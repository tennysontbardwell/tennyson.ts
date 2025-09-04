import * as common from "tennyson/lib/core/common";
import * as cNode from "tennyson/lib/core/common-node";
import * as openai from "tennyson/lib/ai/openai";
import type { Static, TSchema } from '@sinclair/typebox'
import { Effect, Option, Schema, pipe, JSONSchema, Either } from 'effect'
import { openAIConfig, openAIModels } from "./const";
import type { UnknownException } from "effect/Cause";

const c = common

export interface Attachment {
  title: string,
  contents: string,
}

export interface Tool {
  name: string;
  inputSchema: TSchema;
  outSchema: TSchema;
  description: string;
  callback: (request: string) => Promise<Attachment>;
}

export interface Tool2<
  A extends Schema.Schema<any, any, never>,
  B extends Schema.Schema<any, any, never>
> {
  tag: "type2",
  name: string;
  inputSchema: A;
  outSchema: B;
  description: string;
  callback: (request: Schema.Schema.Type<A>) =>
    Promise<Attachment>;
}

interface Query {
  userText: string,
  tools?: Array<Tool2<any, any>>,
  maxToolCalls?: number,
  attachments?: Attachment[],
  outputSchema?: string,
  model?: keyof typeof openAIModels,
  previousCallCount?: number,
}

interface ToolCall {
  toolName: string;
  data: any;
}

async function executeToolsInParallel(
  toolCalls: ToolCall[], availableTools: Array<Tool | Tool2<any, any>>
): Promise<Attachment[]> {
  const toolMap = new Map(availableTools.map(tool => [tool.name, tool]));

  const toolPromises = toolCalls.map(async (call): Promise<Attachment> => {
    const tool = toolMap.get(call.toolName);
    if (!tool) {
      return {
        title: `Tool Error: ${call.toolName}`,
        contents: `Tool "${call.toolName}" not found`
      };
    }

    try {
      const input = Schema.decodeSync(tool.inputSchema)(call.data) as any;
      const result = await tool.callback(input);
      return result;
    } catch (error) {
      return {
        title: `Tool Error: ${call.toolName}`,
        contents: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  });

  return Promise.all(toolPromises);
}

interface Prompt {
  role: string,
  userText: string,
  attachments: Attachment[],
  tools: Tool2<any, any>[],
}

const responseName = "control-flow/responseToUser"
const responseSchema = Schema.Struct({
  response: Schema.String
})
const RespondToUserTool: Tool2<typeof responseSchema, typeof Schema.String> = {
  tag: "type2",
  name: responseName,
  inputSchema: responseSchema,
  outSchema: Schema.String,
  description: "Does no further tool calls or execution steps, and returns the response to the user",
  callback: async (input: Schema.Schema.Type<typeof responseSchema>) =>
    c.id({ title: responseName, contents: input.response })
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
        (tool: Tool | Tool2<any, any>, i: number) =>
          section(
            `Tool Number ${i + 1} of ${p.tools?.length}; `
            + `Tool Name: \"${tool.name}\"`,
            JSON.stringify({
              name: tool.name,
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
    data: Schema.Any,
  })
  return Schema.decodeOption(Schema.parseJson(schema))(response)
}

function planOfQuery(q: Query) {
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

function finalizePromptOfPlanAndCallResults(
  q: Query,
  plan: string,
  toolCallResults: Attachment[],
) {
  const role =
    `You are an agent tasked with responding to a users request. You have access to attachments, a small number of specified tools, the user's description of the task, a plan for executing on the user's request, and the results of a set of tool calls.\n`
    + `Use this information to respond to the user. If you lack information required to respond to the user, then be transparent in this limitation and communicate this to the user rather than answer as the user requested.`

  return pipe({
    role,
    userText: q.userText,
    attachments: [
      ...q.attachments ?? [],
      {
        title: "Plan",
        contents: plan,
      },
      ...toolCallResults,
    ],
    tools: q.tools ?? [],
  },
    PromptSection.fromPrompt,
    PromptSection.combine,
  )
}

function toolCallPromptOfPlannedQuery(
  q: Query, plan: string, prev: number, remaining: number
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
    attachments: [
      {
        title: "Plan",
        contents: plan,
      },
      ...q.attachments ?? [],
    ],
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

export const query = (q_: Query): Effect.Effect<string, UnknownException> =>
  Effect.gen(function* () {
    const tools: Tool2<any, any>[] = [RespondToUserTool].concat(q_.tools ?? [])
    const q = {
      ...q_,
      tools
    }

    const plan = yield* generatePrompt(planOfQuery(q), q.model)
    yield* Effect.logDebug({ type: 'plan', plan });

    let allToolResults = [] as Attachment[]
    for (const i of c.range(3)) {
      const toolCallResponse = yield* generatePrompt(
        toolCallPromptOfPlannedQuery(
          {
            ...q,
            attachments: (q.attachments ?? []).concat(allToolResults)
          },
          plan, i, 5 - 1 - i),
        q.model
      )
      const toolCall = parseToolCall(toolCallResponse)

      if (Option.isSome(toolCall) && toolCall.value.toolName === responseName) {
        const data = pipe(toolCall.value.data,
          Schema.decodeEither(RespondToUserTool.inputSchema))
        yield* Effect.logDebug({ priceUSDSoFar: spentMills / 1000 })
        if (Either.isLeft(data)) {
          yield* Effect.logWarning(data.left)
          return "Failure"
        } else
          return data.right.response
      }

      const toolResults = yield* Option.match(toolCall, {
        onNone: () => Effect.succeed([]),
        onSome: (toolCall) => Effect.gen(function* () {
          const toolResults = yield* Effect.tryPromise(() =>
            executeToolsInParallel([toolCall], q.tools ?? []))

          yield* Effect.logDebug({
            type: 'tool_call',
            toolCall,
            results: toolResults.map(result => ({
              title: result.title,
              contentLength: result.contents.length,
              contentPreview:
                result.contents.substring(0, 200)
                + (result.contents.length > 200 ? '...' : '')
            }))
          })

          return toolResults
        })
      })
      const toolResults_ = toolResults.map(x => c.id({
        title: `Tool Call Number ${i + 1}; ${x.title}`,
        contents: `${toolCallResponse}\n${x.contents}`
      }))
      allToolResults = allToolResults.concat(toolResults_)
    }

    const finalPrompt = finalizePromptOfPlanAndCallResults(
      q,
      plan,
      allToolResults,
    )
    const res = yield* generatePrompt(finalPrompt, q.model)

    yield* Effect.logDebug({ priceUSDSoFar: spentMills / 1000 })
    return res
  })

