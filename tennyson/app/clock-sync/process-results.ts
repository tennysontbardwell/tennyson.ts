import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import * as ec2 from "tennyson/lib/infra/ec2";

import * as fs from "fs";

import { parseHex } from "./util";

import * as pl from "nodejs-polars";
import { Command, FileSystem } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Chunk, Effect, Stream } from "effect";

async function parsePcap(file: string) {
  const fields = [
    "frame.number",
    "frame.time_epoch",
    "frame.time_relative",
    "ip.src",
    "ip.dst",
    "udp.payload",
    "sll.pkttype",
  ] as const;

  return await cn.withTempDir(async (dir) => {
    const tmpfile = cn.pathjoin(dir, "file.json");
    const cmd = (() => {
      const fields_args = fields.flatMap((x) => ["-e", x]).join(" ");
      const tshark_cmd = `tshark -Y udp -r ${file} -T json ${fields_args}`;
      const jq_cmd = `jq '[ .[]._source.layers | map_values(if type == "array" and length == 1 then .[0] else . end) ]'`;
      return `${tshark_cmd} | ${jq_cmd} > "${tmpfile}"`;
    })();
    await cn.exec.sh(`${cmd}`);

    const res = (await cn.parseBigJson(tmpfile)) as {
      [K in (typeof fields)[number]]: string | null;
    }[];

    return res
      .map((row) => {
        const val = row["udp.payload"];
        const parts =
          val != null && val.length > 0 ? parseHex(val).split(" ") : [];
        const dir =
          row["sll.pkttype"] === null
            ? null
            : ["0", "1", "2"].includes(row["sll.pkttype"])
              ? "inbound"
              : "4" == row["sll.pkttype"]
                ? "outbound"
                : null;
        return {
          time_relative: row["frame.time_relative"],
          src: row["ip.src"],
          dst: row["ip.dst"],
          cmd: c.getOrDefault(parts, 0, null),
          seq: c.getOrDefault(parts, 1, null),
          host1: c.getOrDefault(parts, 2, null),
          host2: c.getOrDefault(parts, 3, null),
          dir,
        };
      })
      .filter((row) => row.cmd === "ping" || row.cmd === "resp");
  });
}

export async function processResults(
  nodes: { name: string; zone: ec2.AvailabilityZone }[],
  directory: string,
) {
  // const results2 = async function* () {
  //   for (const { name, zone } of nodes) {
  //     const file = cn.path.resolve(directory, name, "mydata", "tcpdump.pcap");
  //     c.info(`Processing ${file}`)
  //     const data = await parsePcap(file);
  //     const data2 = data.map((d) => ({
  //       ...d,
  //       name,
  //       zone,
  //     }));
  //     for (const x of data2) {
  //       const { zone, ...rest } = x;
  //       yield rest;
  //     }
  //   }
  // };
  // await cn.writeJsonLines(
  //   results2(),
  //   cn.path.resolve(directory, "results.jsonl"),
  // );

  const results = await (async () => {
    const res = await Promise.all(
      nodes.map(async ({ name, zone }) => {
        const file = cn.path.resolve(directory, name, "mydata", "tcpdump.pcap");
        const data = await parsePcap(file);
        return data.map((d) => ({
          ...d,
          name,
        }));
      }),
    ).then(x => x.flat());
    return res;
  })();
  const df = pl.DataFrame(results);
  df.writeParquet(cn.path.resolve(directory, "results.parquet"));

  // const data = await Promise.all(results).then((x) => x.flat());
  // await fs.promises.writeFile(
  //   cn.path.resolve(directory, "results.json"),
  //   JSON.stringify(data),
  // );
}
