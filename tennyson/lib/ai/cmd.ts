import * as yargs from "yargs";

import * as common from "tennyson/lib/core/common";

export const cmd: yargs.CommandModule<{}, {}> = {
  command: "ai <prompt>",
  describe: "Query AI with a prompt and optional file/webpage attachments",
  builder: {
    "file": {
      alias: "f",
      describe: "Attach a file to the query",
      type: "array",
      default: []
    },
    "webpage": {
      alias: "w",
      describe: "Attach a webpage to the query",
      type: "array", 
      default: []
    }
  },
  handler: async (args: any) => {
    let aichat = await import("tennyson/lib/ai/aichat");

    const attachments = [];

    // Process file attachments
    if (args.file && args.file.length > 0) {
      for (const filePath of args.file) {
        try {
          const attachment = await aichat.file(filePath);
          attachments.push(attachment);
        } catch (error) {
          common.log.error(`Failed to read file ${filePath}:`, error);
        }
      }
    }

    // Process webpage attachments  
    if (args.webpage && args.webpage.length > 0) {
      for (const url of args.webpage) {
        try {
          const attachment = await aichat.webpage(url);
          attachments.push(attachment);
        } catch (error) {
          common.log.error(`Failed to fetch webpage ${url}:`, error);
        }
      }
    }

    try {
      const response = await aichat.query({
        userText: args.prompt,
        attachments: attachments
      });
      console.log(response);
    } catch (error) {
      common.log.error("AI query failed:", error);
    }
  }
};
