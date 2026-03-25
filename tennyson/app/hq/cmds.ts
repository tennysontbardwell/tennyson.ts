import * as c from "tennyson/lib/core/common";
import * as cli from "tennyson/lib/core/cli";

import * as server from './server'

export const cmds = [
  cli.command("server", async () => {
    server.run()
  }),
];
