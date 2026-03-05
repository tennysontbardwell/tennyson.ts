import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import * as execlib from "tennyson/lib/core/exec";

import * as pl from "nodejs-polars";

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

export async function parsePcap(file: string) {
  const schema: Record<string, pl.DataType> = {
    "frame.number": pl.UInt32,
    "frame.time_epoch": pl.Utf8,
    "frame.time_relative": pl.Decimal(20, 10),
    "ip.src": pl.Utf8,
    "ip.dst": pl.Utf8,
    "udp.payload": pl.Utf8,
  };
  const df = await cn.withTempDir(async (dir) => {
    const tmpfile = cn.pathjoin(dir, "file.json");
    const cmd = (() => {
      const fields = Object.keys(schema);
      const fields_args = fields.flatMap((x) => ["-e", x]).join(" ");
      const tshark_cmd = `tshark -Y udp -r ${file} -T json ${fields_args}`;
      const jq_cmd = `jq '[ .[]._source.layers | map_values(if type == "array" and length == 1 then .[0] else . end) ]'`;
      return `${tshark_cmd} | ${jq_cmd} > "${tmpfile}"`;
    })();
    await execlib.sh(`${cmd}`);
    return pl.readJSON(tmpfile, {});
  });

  c.info(df.schema);

  const parsedCol = df
    .getColumn("udp.payload")
    .mapElements((val: string | null) =>
      val != null && val.length > 0 ? parseHex(val) : null,
    )
    .rename("data");

  return df
    .withColumn(parsedCol)
    .withColumn(pl.col("data").str.split(" ").alias("_parts"))
    .withColumn(pl.col("_parts").lst.get(0).alias("cmd"))
    .withColumn(pl.col("_parts").lst.get(1).alias("seq"))
    .withColumn(pl.col("_parts").lst.get(2).alias("host1"))
    .withColumn(pl.col("_parts").lst.get(3).alias("host2"))
    .drop("_parts");
}
