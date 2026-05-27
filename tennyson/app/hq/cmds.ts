import * as c from "tennyson/lib/core/common";
import * as cli from "tennyson/lib/core/cli";

import * as server from "./server";

import * as http from "http";

export const cmds = (
  additionalPaths?: Record<
    string,
    (a: http.ServerResponse<http.IncomingMessage>) => Promise<void>
  >,
) => [
  cli.flagsCommand(
    "server",
    {
      "main-scratch-file": { type: "string", required: false },
    },
    async (args) => {
      server.run(
        c.stripUndefined({
          mainScratchFile: args.mainScratchFile,
          additionalPaths,
        }),
      );
    },
  ),
];
