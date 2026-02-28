import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import * as cli from "tennyson/lib/core/cli";

import * as fs from "fs/promises";

export const cmds = async () => {
  return [
    cli.command("espanso-gen", async () => {
      const x = await import("tennyson/lib/random/espanso");
      await fs.writeFile(
        cn.resolveHome(
          "~/repos/tennysontbardwell/dotfiles/espanso/Library/Application Support/espanso/match/autogen.yml",
        ),
        x.gen(),
      );
    }),

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
