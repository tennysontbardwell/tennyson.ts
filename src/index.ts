import * as yargs from "yargs";
import axios from "axios";

import * as cli from "src/lib/core/cli";
import * as api from "src/app/api";
import * as common from "src/lib/core/common";
import * as util from "src/lib/core/util";
import * as ec2 from "src/lib/infra/ec2";
import * as readline from "readline";
import * as hometty from "src/app/scripts/hometty";
import * as host from "src/lib/infra/host";

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

function test(x: string) {
  return cli.command(x, async () => { common.log.info(x) });
}

async function main() {
  await cli.execute([
    Devbox.cmd,
    test("c"),
    cli.group("test", [
      test("a"),
      test("b"),
      test("*"),
    ])
  ]);
}

async function _main() {
  yargs
    .scriptName("tbardwell.ts")
    .command(
      simple("devbox", async () => {
      })
  )
    .command(
      simple("devbox", async () => {
      })
    )
    .command(
      simple("quickdev", async () => {
        await common.passthru("zsh", ['-ic', 'find . | fzf']);
      })
  )
    .command(
      simple("hometty", async () => {
        await hometty.run();
      })
    )
    // .command(simple("*", async () => { common.log.info("default top level"); }))
    .command(simple("api-run", async () => api.run()))
    .demandCommand(1)
    .help()
    .parse(process.argv.slice(2));
}

main().catch((error) =>
  common.log.error("error in comand parsing function", error)
);
