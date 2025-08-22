import * as cli from "tennyson/lib/core/cli";
import * as common from "tennyson/lib/core/common";
import type { Attachment, Tool } from './tools'
import { models } from './const';
import { writeBigJson } from "../core/common-node";

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
      default: "",
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
    "traceFile": {
      type: "string"
    },
  },
  async (args) => {
    const aichat = await import("tennyson/lib/ai/aichat");

    const attachments: Attachment[] = [];
    const tools: Tool[] = [];

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

    await Promise.all([
      attach(args.file, aichat.file),
      attach(args.webpageRaw, aichat.webpageRaw),
      attach(args.webpage, aichat.webpageRawish),
      attach(args.cleanedWebpage, aichat.webpage),
    ])

    if (args.webpageTool) {
      tools.push(aichat.urlFetchTool)
    }
    // await writeBigJson("/tmp/aiattach.json", attachments)

    try {
      const response = await aichat.query({
        userText: <string>args.prompt,
        attachments: attachments,
        model: args.model,
        tools,
        maxToolCalls: args.maxToolIteration,
      }, args.traceFile);
      console.log(response);
    } catch (error) {
      common.log.error("AI query failed:", error);
    }
  },
  "Query AI with a prompt and optional file/webpage attachments"
);
