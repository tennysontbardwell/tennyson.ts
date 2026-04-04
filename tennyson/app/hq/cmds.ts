import * as c from "tennyson/lib/core/common";
import * as cli from "tennyson/lib/core/cli";

import * as server from "./server";

export const cmds = [
  cli.flagsCommand(
    "server",
    {
      "main-scratch-file": { type: "string", required: false },
    },
    async (args) => {
      server.run(
        c.stripUndefined({
          mainScratchFile: args.mainScratchFile,
        }),
      );
    },
  ),
];
