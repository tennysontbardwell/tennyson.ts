import * as common from "tennyson/lib/core/common";
import * as cNode from "tennyson/lib/core/common-node";
import * as openai from "tennyson/lib/ai/openai";
import type { Static, TSchema } from '@sinclair/typebox'
import { Effect, Option, Schema, pipe, JSONSchema, Either, Data, Match } from 'effect'
import { openAIConfig, openAIModels } from "./const";
import { UnknownException } from "effect/Cause";

const c = common

export interface Attachment {
  title: string,
  contents: string,
}

type ControlFlow<R> =
  | {
    _tag: 'return',
    results: R,
  }

export interface Tool {
  name: string;
  inputSchema: TSchema;
  outSchema: TSchema;
  description: string;
  callback: (request: string) => Promise<Attachment>;
}

export interface Tool2<A, B, R = never> {
  tag: "type2",
  name: string;
  inputSchema: Schema.Schema<A, any>;
  outSchema: Schema.Schema<B, any>;
  description: string;
  callback: (request: A) => Promise<Either.Either<B, ControlFlow<R>>>;
}

interface Query<R> {
  userText: string,
  tools?: Array<Tool2<any, any, R>>,
  maxToolCalls?: number,
  attachments?: Attachment[],
  model?: keyof typeof openAIModels,
  previousCallCount?: number,
  responseSchema: Schema.Schema<R, any>,
}

const ToolCall = Schema.Struct({
  toolName: Schema.String,
  data: Schema.Any,
})
type ToolCall = Schema.Schema.Type<typeof ToolCall>

interface UnexpectedToolError {
  _tag: 'error',
  error: 'Unexpected Tool Error',
  message: string,
  data?: any,
}

const executeToolCall = <R>(
  call: ToolCall, tools: Tool2<any, any, R>[]
) => Effect.gen(function* () {
  const toolMap = new Map(tools.map(tool => [tool.name, tool]));

  const tool = toolMap.get(call.toolName);
  if (!tool) {
    return {
      _tag: "error",
      error: 'Unexpected Tool Error',
      message: 'The requested tool name does not exist',
      data: { availableTools: [...toolMap.keys()] },
    } as UnexpectedToolError
  }

  try {
    const input = Schema.decodeSync(tool.inputSchema)(call.data) as any;
    const result = yield* Effect.tryPromise(() => tool.callback(input));
    const inputStr = Schema.encodeSync(Schema.parseJson(ToolCall))(call)
    return result.pipe(Either.match({
      onLeft: control => control,
      onRight: data => {
        const dataStr =
          Schema.encodeSync(Schema.parseJson(tool.outSchema))(data)
        return {
          _tag: "data" as const,
          input,
          inputStr,
          data,
          dataStr,
          tool
        }
      },
    }));
  } catch (error) {
    return {
      _tag: "error",
      error: 'Unexpected Tool Error',
      message: 'Error while executing tool',
      data: { error },
    } as UnexpectedToolError
  }
})

interface Prompt {
  role: string,
  userText: string,
  attachments: Attachment[],
  tools: Tool2<any, any, any>[],
}

const responseName = "control-flow/responseToUser"

function mkResponseTool<R>(returnSchema: Schema.Schema<R>) {
  const outSchema = Schema.String
  const respondToUserTool
    : Tool2<R, Schema.Schema.Type<typeof outSchema>, R>
    = {
    tag: "type2",
    name: responseName,
    inputSchema: returnSchema,
    outSchema: outSchema,
    description: "Does no further tool calls or execution steps, and returns the response to the user",
    callback: async (results: R) => Either.left({
      _tag: "return",
      results
    })
  }
  return respondToUserTool
}

namespace PromptSection {
  interface PromptSection {
    header: string,
    contents: string,
  }

  export function combine(sections: PromptSection[]) {
    const sep = '==================================';

    return sections.map(({ header, contents }) => [
      sep,
      ' ',
      header,
      '\n',
      contents
    ].join('')).join('\n\n')
  }

  export function fromPrompt(p: Prompt) {
    const section =
      (header: string, contents: string) => c.id({ header, contents })

    const tools =
      (p.tools ?? []).map(
        (tool: Tool2<any, any, any>, i: number) =>
          section(
            `Tool Number ${i + 1} of ${p.tools?.length}; `
            + `Tool Name: \"${tool.name}\"`,
            JSON.stringify({
              toolName: tool.name,
              inputSchema:
                JSONSchema.make(Schema.Struct({
                  toolName: Schema.Literal(tool.name),
                  data: tool.inputSchema,
                })),
              outputSchema: JSONSchema.make(tool.outSchema),
            })
          ))

    const attachments =
      (p?.attachments ?? []).map(
        (attachment: Attachment, i: number) =>
          section(
            `Attachment ${i + 1} of ${p.attachments?.length}; `
            + `Title: ${attachment.title}`,
            attachment.contents))

    return [
      section("Developer Instruction, Top Level Objective", p.role),
      section("Instructions From User", p.userText),
      ...tools,
      ...attachments,
    ]
  }
}

function parseToolCall(response: string) {
  const schema = Schema.Struct({
    toolName: Schema.String,
    data: Schema.Unknown,
  })
  return Schema.decodeOption(Schema.parseJson(schema))(response)
}

function planOfQuery(q: Query<any>) {
  const role =
    `You are an agent tasked with planning how to complete a users request. You have access to attachments, a small number of specified tools, and the user's description of the task. If a tool or attachment is not listed below, then you do NOT have access to it. Only plan to use tools that are explicitly listed below.\n`
    + `Sketch out a plan for how to answer this user request. Do NOT answer the user. Only consider how to answer. Consider if any tools would be useful in answering the user. If they would be useful, then explain how they might be useful and what parameters they should be called with. This plan can be multiple steps, including steps that depend on the results of previous steps. Consider the user's intentions. Consider what might go wrong when executing tools.`

  return pipe({
    role,
    userText: q.userText,
    attachments: q.attachments ?? [],
    tools: q.tools ?? [],
  },
    PromptSection.fromPrompt,
    PromptSection.combine,
  )
}

function finalizePromptOfPlanAndCallResults<R>(
  q: Query<R>,
) {
  const role =
    `You are an agent tasked with responding to a users request. You have access to attachments, a small number of specified tools, the user's description of the task, a plan for executing on the user's request, and the results of a set of tool calls.\n`
    + `Use this information to respond to the user. If you lack information required to respond to the user, then be transparent in this limitation and communicate this to the user rather than answer as the user requested.`

  return pipe({
    role,
    userText: q.userText,
    attachments: q.attachments ?? [],
    tools: q.tools ?? [],
  },
    PromptSection.fromPrompt,
    PromptSection.combine,
  )
}

function toolCallPromptOfQuery(
  q: Query<any>, prev: number, remaining: number
) {
  const role = [
    `You are an agent who is tasked with executing a plan for a user input. Write tool call, as a JSON, necessary to advance the plan.`,
    prev == 0
      ? `No execution on this plan has occurred thus far.`
      : `There have been ${prev} previous tool calls. The results of these tool calls are under attached with names "Tool Call Number <number>; <tool response title>".`,
    remaining == 0
      ? `This is the final chance to call a tool.`
      : `There will be ${remaining} remaining chances to call a tool after this tool call.`,
  ].join(' ')
  return pipe({
    role,
    userText: q.userText,
    attachments: q.attachments ?? [],
    tools: q.tools ?? [],
  },
    PromptSection.fromPrompt,
    PromptSection.combine,
  )
}

let spentMills = 0
// const spentMills = Metric.counter("spent_mills", {
//   description: "Number of spent 0.001 USD on openai",
//   incremental: true,
// })

const augmentWithPlan = <R>(q: Query<R>) =>
  Effect.gen(function* () {
    const plan = yield* generatePrompt(planOfQuery(q), q.model)
    yield* Effect.logDebug({ type: 'plan', plan });

    const planAttachment = { title: "Plan", contents: plan }
    return { ...q, attachments: (q.attachments ?? []).concat(planAttachment) }
  })

const augmentWithControlFlow = <R>(q: Query<R>) => c.id({
  ...q,
  tools: (q.tools ?? []).concat(mkResponseTool(q.responseSchema))
})

const augmentToDemandReturn = <R>(q: Query<R>) => c.id({
  ...q,
  tools: [mkResponseTool(q.responseSchema)]
})

const getToolCall = <R>(q: Query<R>, prev: number, remaining: number) =>
  Effect.gen(function* () {
    const toolCallResponse = yield* generatePrompt(
      toolCallPromptOfQuery(q, prev, remaining),
      q.model
    )

    return { raw: toolCallResponse, parsed: parseToolCall(toolCallResponse) }
  })

const executeToolAndAugment =
  <R>(q: Query<R>, prev: number, remaining: number) =>
    Effect.gen(function* () {
      const toolCall = yield* getToolCall(q, prev, remaining)

      const toolResults = yield* Option.match(toolCall.parsed, {
        onNone: () => Effect.succeed([{
          _tag: "error" as const,
          error: 'Unexpected Tool Error',
          message: 'The tool request JSON could not be parsed. Correct format is { toolName: <name>, data: <data> }',
          data: {
            availableTools: (q.tools ?? []).map(x => x.name),
            rawInput: toolCall.raw,
          },
        }]),
        onSome: (toolCall) => Effect.gen(function* () {
          const toolResults = yield* Effect.all([toolCall]
            .map(call => executeToolCall(call, q.tools ?? [])))

          yield* Effect.logDebug({
            type: 'tool_call',
            toolCall,
            results: toolResults
          })

          return toolResults
        })
      })
      const toolResults_ = toolResults.map(x => {
        const title = `Tool Call Number ${prev + 1}`
        const attachment = (contents: string) => Either.right({ contents, title })
        return Match.value(x).pipe(
          Match.tag("data", x => attachment(`${x.inputStr}\n${x.dataStr}`)),
          Match.tag("error", x => attachment(JSON.stringify(x))),
          Match.tag("return", x => Either.left(x)),
          Match.exhaustive
        )
      })
      return Either.all(toolResults_).pipe(
        Either.map(attachments => c.id({
          ...q,
          attachments: (q.attachments ?? []).concat(...attachments)
        })))
    })

function generatePrompt(
  prompt: string,
  model?: keyof typeof openAIModels,
) {
  return Effect.gen(function* () {
    const model_ = model ?? "gpt-4.1-mini";
    const resp = yield* Effect.tryPromise(() =>
      openai.openai.generateWithModel(model_, openAIConfig, prompt))
    yield* Effect.logDebug({ type: 'query', model, prompt, resp });
    spentMills += pipe(resp.price * 1000, Math.ceil)
    return resp.response
  })
}

export const query = <R>(q_: Query<R>): Effect.Effect<R, UnknownException> =>
  Effect.gen(function* () {
    let q: Query<R> = yield* augmentWithPlan(q_)
    q = augmentWithControlFlow(q)

    const maxCalls = q_.maxToolCalls ?? 5
    for (const i of c.range(maxCalls)) {
      const res = yield* executeToolAndAugment(q, i, maxCalls - i - 1)
      if (Either.isRight(res)) {
        q = res.right
      } else {
        if (res.left._tag === "return") {
          return res.left.results
        }
      }
    }

    q = augmentToDemandReturn(q)
    const finalPrompt = finalizePromptOfPlanAndCallResults(q)
    const res = yield* generatePrompt(finalPrompt, q.model)
    yield* Effect.logDebug({ priceUSDSoFar: spentMills / 1000 })
    const data = Schema.decodeSync(Schema.parseJson(ToolCall))(res).data
    return Schema.decodeSync(Schema.parseJson(q.responseSchema))(data)
  })

