import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import * as execlib from "tennyson/lib/core/exec";

import * as fs from "fs";

function parseHex(hex: String) {
  try {
    const cleanedHex = hex.replace(/\s+/g, "").replace(/^0x/, "");
    const byteArray = new Uint8Array(
      cleanedHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    return new TextDecoder("utf-8").decode(byteArray);
  } catch (e) {
    c.log.error({ message: "error parsing hex", hex: hex });
    throw e;
  }
}

async function parsePcap(file: string) {
  const fields = [
    "frame.number",
    "frame.time_epoch",
    "frame.time_relative",
    "ip.src",
    "ip.dst",
    "udp.payload",
  ] as const;

  return await cn.withTempDir(async (dir) => {
    const tmpfile = cn.pathjoin(dir, "file.json");
    const cmd = (() => {
      const fields_args = fields.flatMap((x) => ["-e", x]).join(" ");
      const tshark_cmd = `tshark -Y udp -r ${file} -T json ${fields_args}`;
      const jq_cmd = `jq '[ .[]._source.layers | map_values(if type == "array" and length == 1 then .[0] else . end) ]'`;
      return `${tshark_cmd} | ${jq_cmd} > "${tmpfile}"`;
    })();
    c.info(cmd)
    await execlib.sh(`${cmd}`);

    c.info(tmpfile)
    // await c.sleep(100_000)

    const res = (await cn.parseBigJson(tmpfile)) as {
      [K in (typeof fields)[number]]: string | null;
    }[];

    return res.map((row) => {
      const val = row["udp.payload"];
      const parts =
        val != null && val.length > 0 ? parseHex(val).split(" ") : [];
      return {
        time_relative: row["frame.time_relative"],
        src: row["ip.src"],
        dst: row["ip.dst"],
        cmd: c.getOrDefault(parts, 0, null),
        seq: c.getOrDefault(parts, 1, null),
        host1: c.getOrDefault(parts, 2, null),
        host2: c.getOrDefault(parts, 3, null),
      };
    });
  });
}

export async function processResults(hostnames: string[], directory: string) {
  const results = await Promise.all(
    hostnames.flatMap((hostname) =>
      ["inbound", "outbound"].map(async (dir) => {
        const file = cn.path.resolve(
          directory,
          hostname,
          "results",
          dir + ".pcap",
        );
        const data = await parsePcap(file);
        return data.map((d) => ({
          ...d,
          hostname,
          dir: dir,
        }));
      }),
    ),
  );
  const data = await Promise.all(results).then((x) => x.flat());
  await fs.promises.writeFile(
    cn.path.resolve(directory, "results.json"),
    JSON.stringify(data),
  );
}
