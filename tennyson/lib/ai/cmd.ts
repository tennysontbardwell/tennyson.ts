import * as cli from "tennyson/lib/core/cli";
import * as common from "tennyson/lib/core/common";

import type { Attachment, Tool2 } from './aichat'
import { models, openAIModels } from './const';


export const cmd = cli.flagsCommand(
  "ai",
  {
    "file": {
      alias: "f",
      describe: "Attach a file to the query",
      type: "string",
      array: true,
      default: [],
    },
    "cleanedWebpage": {
      alias: "c",
      describe: "Attach a webpage to the query. This will remove scripts, styles, and tags.",
      type: "string",
      array: true,
      default: [],
    },
    "webpage": {
      alias: "w",
      describe:
        "Attach a webpage to the query. This will remove scripts and style tags.",
      type: "string",
      array: true,
      default: [],
    },
    "webpageRaw": {
      alias: "r",
      describe: "Attach a webpage to the query, as is.",
      type: "string",
      array: true,
      default: [],
    },
    "model": {
      alias: "m",
      describe: "",
      type: "string",
      default: "gpt-4.1-mini",
      choices: Object.keys(models),
    },
    "prompt": {
      alias: "p",
      describe: "",
      type: "string",
      required: true,
    },
    "webpageTool": {
      alias: "W",
      describe: "allows model to make tool calls",
      boolean: true,
      default: false,
    },
    "maxToolIteration": {
      alias: "n",
      describe:
        "maximum number of tool call iterations allowed, if tools are present",
      type: "number",
      default: 5,
    },
    "verbose": {
      alias: "v",
      describe: "print debug logs",
      boolean: true,
      default: false,
    },
    "quiet": {
      alias: "q",
      describe: "Do not print the final response. Useful when using -v",
      boolean: true,
      default: false,
    },
  },
  async (args) => {
    const aichat = await import("tennyson/lib/ai/aichat");
    const tools = await import("tennyson/lib/ai/tools");
    const effect = await import("effect");

    const attachments: Attachment[] = [];
    const tools_: Tool2<any, any>[] = [];

    async function attach(
      lst: string[],
      f: (input: string) => Promise<Attachment>
    ) {
      for (const elm of lst) {
        try {
          attachments.push(await f(elm));
        } catch (error) {
          common.log.error(`Failed to handle attachment ${elm}:`, error);
        }
      }
    }

    const web = (cleanup: 'raw' | 'contentTags' | 'text') => (url: string) =>
      tools.fetchWebpage(url, cleanup)

    await Promise.all([
      attach(args.file, tools.file),
      attach(args.webpageRaw, web('raw')),
      attach(args.webpage, web('contentTags')),
      attach(args.cleanedWebpage, web('text')),
    ])

    if (args.webpageTool) {
      tools_.push(tools.urlFetchTool2())
    }
    // await writeBigJson("/tmp/aiattach.json", attachments)

    try {
      const response = await aichat.query({
        userText: <string>args.prompt,
        attachments: attachments,
        model: args.model as keyof typeof openAIModels,
        tools: tools_,
        maxToolCalls: args.maxToolIteration,
        responseSchema: effect.Schema.String,
      }).pipe(
        effect.Logger.withMinimumLogLevel(
          args.verbose
            ? effect.LogLevel.Debug
            : effect.LogLevel.Info),
        effect.Effect.provide(effect.Logger.json),
        effect.Effect.runPromise,
      )
      if (!args.quiet)
        console.log(response);
    } catch (error) {
      common.log.error("AI query failed:", error);
    }
  },
  "Query AI with a prompt and optional file/webpage attachments"
);
