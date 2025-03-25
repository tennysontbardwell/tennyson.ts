import * as yargs from "yargs";
import axios from "axios";

import * as ansible from "src/lib/infra/ansible";
import * as api from "src/app/api";
import * as common from "src/lib/core/common";
import * as execlib from "src/lib/core/exec";
import * as consul from "src/lib/infra/consul";
import * as ec2 from "src/lib/infra/ec2";
import * as hassio from "src/lib/infra/hassio";
import * as host from "src/lib/infra/host";
import * as infraBuilder from "src/lib/infra/infra-builder";
import * as jupyter from "src/lib/infra/jupyter";
import * as kerb from "src/lib/infra/kerb";
import * as nginx from "src/lib/infra/nginx";
import * as openvpn from "src/lib/infra/openvpn";
import * as prox from "src/lib/infra/prox";
import * as readline from "readline";
import * as samba from "src/lib/infra/samba";
import * as secrets from "src/secrets/secrets";
import * as util from "src/lib/infra/util";
import * as vault from "src/lib/infra/vault";
import * as webwatcher from "src/lib/misc/webwatcher";
import * as workstation from "src/lib/infra/work-station";

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

// function group(name: string, subcommands: (any => any) {
//   return subcommands;
// }

async function main() {
  const arch = host.Host.ofLocalName("nyc1-arch-misc1");
  const infra = yargs
    .scriptName("tbardwell.ts")
    .command(
      simple("devbox", async () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let rnd = Array.from({ length: 5 }, _ => chars.charAt(Math.floor(Math.random() * chars.length)));
        let name = "temp-box-" + rnd;
        let box = await ec2.createNewSmall(name)
        await box.passthroughSsh();
        await ec2.purgeByName(name)
      })
    )
    .command(
      simple("quickdev", async () => {
        await common.passthru("zsh", ['-ic', 'find . | fzf']);
      })
    )
    .command(simple("api-run", async () => api.run()))
    .demandCommand()
    .help()
    .parse(process.argv.slice(2));
}

main().catch((error) =>
  common.log.error("error in comand parsing function", error)
);
