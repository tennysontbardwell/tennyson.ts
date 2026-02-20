import * as c from "tennyson/lib/core/common";

import { FileSystem } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";

import { Stream, Effect, Schedule, Schema, Sink } from "effect";
import { homedir } from "os";
import { runTxLog } from "tennyson/lib/core/txlog";

import * as path from "path";
import { promises as fs } from "fs";
import * as common_node from "tennyson/lib/core/common-node";

const { Kafka } = require("gcn-kafka");

export async function quickdev() {
  // const prop = (vcf: string, key: string) => {
  //   const re = new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, "i");
  //   const line = vcf.split(/\r?\n/).find((l) => re.test(l));
  //   return line?.match(re)?.[1]?.trim();
  // };

  // const unfold = (s: string) => s.replace(/\r?\n[ \t]/g, ""); // vCard folding

  // (async () => {
  //   const dir = common_node.resolveHome("~/Desktop/contact-test");
  //   const files = (await fs.readdir(dir))
  //                   .filter((f) => /\.vcf$/i.test(f))
  //                   .sort();

  //   for (const f of files) {
  //     const raw = await fs.readFile(path.join(dir, f), "utf8");
  //     const vcf = unfold(raw);

  //     const n = prop(vcf, "N") ?? ";;;;";
  //     const [last, first, additional] = n
  //       .split(";")
  //       .map((x) => (x ?? "").trim());

  //     const alt =
  //       prop(vcf, "NICKNAME") ??
  //       prop(vcf, "X-ALTERNATE-NAMES") ??
  //       prop(vcf, "X-ALT-NAMES") ??
  //       "";

  //     const cat = prop(vcf, "X-CATEGORY") ?? "";

  //     const base =
  //       [first, additional, last].filter(Boolean).join(" ").trim() ||
  //       prop(vcf, "FN") ||
  //       "(no name)";

  //     const name = `${base}${alt ? ` (${alt})` : ""}${cat ? ` ${cat}` : ""}`;
  //     console.log(`${f}\t${name}`);
  //   }
  // })();

  // Create a client.
  // Warning: don't share the client secret with others.
  // const getSecret = async (id: string[]) =>
  // {
  //   const res = await common_node.exec.exec("sops", [
  //     "decrypt",
  //     "--extract",
  //     id.map((part) => `["${part}"]`).join(""),
  //     common_node.resolveHome("~/secrets/main.personal-machine.json"),
  //   ]);
  //   return res.stdout;
  // }
  // const client_id = await getSecret(["gcn.nasa.go", "client_id"]);
  // const client_secret = await getSecret(["gcn.nasa.go", "client_secret"]);
  // const kafka = new Kafka({ client_id, client_secret });

  // // Subscribe to topics and receive alerts
  // const consumer = kafka.consumer();
  // try {
  //   await consumer.subscribe({
  //     topics: ["gcn.classic.text.SNEWS"],
  //   });
  // } catch (error: any) {
  //   if (error.type === "TOPIC_AUTHORIZATION_FAILED") {
  //     console.warn("Not all subscribed topics are available");
  //   } else {
  //     throw error;
  //   }
  // }

  // await consumer.run({
  //   eachMessage: async (payload: any) => {
  //     const value = payload.message.value;
  //     console.log(`topic=${payload.topic}, offset=${payload.message.offset}`);
  //     console.log(value?.toString());
  //   },
  // });
}
