import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";
import * as clock_sync from "tennyson/app/clock-sync/cmds";

import * as cli from "tennyson/lib/core/cli";

import * as fs from "fs/promises";

export const cmds = async () => {
  return [
    cli.flagsCommand(
      "profile",
      {
        warmup: {
          alias: "w",
          describe: "Number of un-timed warmup runs",
          type: "number",
          default: 3,
        },
        trials: {
          alias: "t",
          describe: "Number of timed runs",
          type: "number",
          default: 10,
        },
      },
      async (args) => {
        const warmup = args.warmup;
        const trials = args.trials;
        const cmd = args.command;
        await c.mapSeq(c.range(warmup), () => cn.exec.exec2(cmd));
        const raw = await c.mapSeq(c.range(trials), () =>
          c.withStopwatch(() => cn.exec.exec2(cmd)).then((x) => x.elapsed),
        );
        const mean = c.mean(raw);
        const stddev = c.stddev(raw);
        // c.info({ cmd, mean, stddev, raw });
        c.info(`${c.formatSI(mean / 1000)}s ± ${c.formatSI(stddev / 1000)}s`);
      },
      undefined,
      {
        command: {
          describe: "Command to run",
          type: "string",
          required: "true",
          array: true,
        },
      },
    ),
    cli.flagsCommand(
      "espanso-gen",
      {
        reload: {
          alias: "r",
          describe: "restarts or reloads the service",
          type: "boolean",
          required: "false",
          default: true,
        },
      },
      async (args) => {
        const x = await import("tennyson/lib/random/espanso");
        await fs.writeFile(
          cn.resolveHome(
            "~/repos/tennysontbardwell/dotfiles/espanso/Library/Application Support/espanso/match/autogen.yml",
          ),
          x.gen(),
        );
        if (args.reload) await cn.exec.sh("espanso service restart");
      },
    ),
    cli.group("clock-sync", clock_sync.cmds),
    cli.command("nop", async () => {}),

    // cli.command("", async () => {
    //   // Create a client.
    //   // Warning: don't share the client secret with others.
    //   const getSecret = async (id: string[]) => {
    //     const res = await common_node.exec.exec("sops", [
    //       "decrypt",
    //       "--extract",
    //       id.map((part) => `["${part}"]`).join(""),
    //       common_node.resolveHome("~/secrets/main.personal-machine.json"),
    //     ]);
    //     return res.stdout;
    //   };
    //   const client_id = await getSecret(["gcn.nasa.go", "client_id"]);
    //   const client_secret = await getSecret(["gcn.nasa.go", "client_secret"]);
    //   const kafka = new Kafka({ client_id, client_secret });

    //   // Subscribe to topics and receive alerts
    //   const consumer = kafka.consumer();
    //   try {
    //     await consumer.subscribe({
    //       topics: ["gcn.classic.text.SNEWS"],
    //     });
    //   } catch (error: any) {
    //     if (error.type === "TOPIC_AUTHORIZATION_FAILED") {
    //       console.warn("Not all subscribed topics are available");
    //     } else {
    //       throw error;
    //     }
    //   }

    //   await consumer.run({
    //     eachMessage: async (payload: any) => {
    //       const value = payload.message.value;
    //       console.log(
    //         `topic=${payload.topic}, offset=${payload.message.offset}`,
    //       );
    //       console.log(value?.toString());
    //     },
    //   });
    // }),
  ];
};
