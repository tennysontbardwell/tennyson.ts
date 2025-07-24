import * as cli from "tennyson/lib/core/cli";
import * as common from "tennyson/lib/core/common";
import type { Attachment } from 'tennyson/lib/ai/aichat'
import { models } from './const';

export const cmd = cli.flagsCommand(
  "ai <prompt>",
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
      describe: "Attach a webpage to the query. This will remove scripts and style tags.",
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
  },
  async (args) => {
    const aichat = await import("tennyson/lib/ai/aichat");

    const attachments: Attachment[] = [];

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

    await attach(args.file, aichat.file);
    await attach(args.webpageRaw, aichat.webpageRaw);
    await attach(args.webpage, aichat.webpageRawish);
    await attach(args.cleanedWebpage, aichat.webpage);

    try {
      const response = await aichat.query({
        userText: <string>args.prompt,
        attachments: attachments,
        model: args.model,
      });
      console.log(response);
    } catch (error) {
      common.log.error("AI query failed:", error);
    }
  },
  "Query AI with a prompt and optional file/webpage attachments"
);
