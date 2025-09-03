import * as common from "tennyson/lib/core/common";
import * as cNode from "tennyson/lib/core/common-node";
import * as openai from "tennyson/lib/ai/openai";
import type { Static, TSchema } from '@sinclair/typebox'
import { Effect, Option, Schema, pipe, JSONSchema } from 'effect'
import { openAIConfig } from "./const";
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
  model?: string,
  previousCallCount?: number,
}

const ppQuery = (query: Query) => c.id({
  userText: query.userText,
  toolsCount: query?.tools?.length,
  maxToolCalls: query.maxToolCalls,
  attachmentsCount: query?.attachments?.length,
  outputSchema: query.outputSchema,
  attachments: query?.attachments?.map(a =>
    ({ title: a.title, contentLength: a.contents.length }))
})

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

interface PromptSection {
  header: string,
  contents: string,
}

interface Prompt {
  role: string,
  userText: string,
  attachments: Attachment[],
  tools: Tool2<any, any>[],
}

function combineSections(sections: PromptSection[]) {
  const sep = '==================================';

  return sections.map(({ header, contents }) => [
    sep,
    ' ',
    header,
    '\n',
    contents
  ].join('')).join('\n\n')
}

function promptSectionsOfPrompt(p: Prompt) {
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
    promptSectionsOfPrompt,
    combineSections,
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
    promptSectionsOfPrompt,
    combineSections,
  )
}

function toolCallPromptOfPlannedQuery(q: Query, plan: string) {
  const role = `You are an agent who is tasked with executing a plan for a user input. Write tool call, as a JSON, necessary to advance the plan. No execution on this plan has occurred thus far.`
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
    promptSectionsOfPrompt,
    combineSections,
  )
}

function generatePrompt(
  prompt: string,
  model?: string,
) {
  return Effect.gen(function* () {
    const model_ = model ?? "gpt-4.1-mini";
    const resp = yield* Effect.tryPromise(() =>
      openai.openai.generateWithModel(model_, openAIConfig, prompt))
    yield* Effect.logDebug({ type: 'query', model, prompt, resp });
    return resp
  })
}

const DelimitedString = (delimiter: string) =>
  Schema.transform(
    Schema.String,
    Schema.Array(Schema.String),
    {
      strict: true,
      decode: (str) => str.split(delimiter),
      encode: (parts) => parts.join(delimiter)
    }
  )

export const query = (q: Query): Effect.Effect<string, UnknownException> =>
  Effect.gen(function* () {

    const plan = yield* generatePrompt(planOfQuery(q), q.model)
    yield* Effect.logDebug({ type: 'plan', plan });

    const toolCallResponse =
      yield* generatePrompt(toolCallPromptOfPlannedQuery(q, plan), q.model)
    const toolCall = parseToolCall(toolCallResponse)

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

    const finalPrompt = finalizePromptOfPlanAndCallResults(
      q,
      plan,
      toolResults,
    )
    return yield* generatePrompt(finalPrompt, q.model)
  })

