import * as yargs from "yargs";
import * as path from "path";

import * as cli from "tennyson/lib/core/cli";
import * as api from "tennyson/app/api";
import * as common from "tennyson/lib/core/common";
import * as util from "tennyson/lib/core/util";
import * as ec2 from "tennyson/lib/infra/ec2";
import * as readline from "readline";
import * as hometty from "tennyson/app/scripts/hometty";
import * as fleet from "tennyson/lib/fleet";
import * as exec from "tennyson/lib/core/exec";
import * as host from "tennyson/lib/infra/host";

function askQuestion(query: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

function simple(name: string, cmd: () => Promise<void>) {
  return {
    command: name,
    describe: "",
    handler: async (parsed: any) => {
      try {
        common.log.info("running " + name);
        await cmd();
      } catch (error) {
        common.log.fatal(error);
      }
    },
  };
}

namespace Devbox {
  const choices = Object.keys(ec2.sizes);
  type Size = keyof typeof ec2.sizes;

  function rndName() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let rnd = Array.from({ length: 5 }, _ => chars.charAt(Math.floor(Math.random() * chars.length)));
    return "temp-box-" + rnd.join("");
  }

  async function runThenKill(size: Size) {
    let name = rndName();
    let instance = ec2.sizes[size];
    let box = await ec2.createNew(name, {instance});
    await box.passthroughSsh();
    await util.askQuestion("Proceed?");
    await ec2.purgeByName(name)
  }

  export const cmd: yargs.CommandModule<{},{}> = {
    command: "quickbox",
      describe: "",
      builder: {
        "type": {
          describe: '',
          type: 'string',
          choices,
          default: 'small'
        }
      },
    handler: (async (args: any) => { await runThenKill(args.type); })
  }
}

async function quickdev() {
  // await common.passthru("zsh", ['-ic', 'find . | fzf']);
  await fleet.Member.with(async (member: fleet.Member) => {
    await member.becomeWorker();
    await member.host.passthroughSsh();
  });
}

async function main() {
  await cli.execute([
    Devbox.cmd,
    cli.command("hometty", () => hometty.run()),
    cli.command("api-run", () => api.run()),
    cli.command("quickdev", () => quickdev()),
    cli.command("fleet-member", () => fleet.Comms.becomeFleetMember()),
  ]);
}

main().catch((error) =>
  common.log.error("error in comand parsing function", error)
);
