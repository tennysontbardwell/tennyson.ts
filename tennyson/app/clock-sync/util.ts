import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import * as execlib from "tennyson/lib/core/exec";
import * as host from "tennyson/lib/infra/host";
import * as ec2 from "tennyson/lib/infra/ec2";

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
    await execlib.sh(`${cmd}`);

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

export async function processResults(
  nodes: { hostname: string; zone: ec2.AvailabilityZone }[],
  directory: string,
) {
  const results = await Promise.all(
    nodes.flatMap(({hostname, zone}) =>
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
          zone,
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

export const withSiginTrap = async (
  f: () => Promise<void>,
  cleanup: () => Promise<void>,
) => {
  const wrappedCleanup = async () => {
    try {
      await cleanup();
    } catch (error) {
      c.log.error(["Error during cleanup:", error]);
    }
  };

  try {
    let onSigint: () => void;
    const sigintTrap = new Promise<never>((_, reject) => {
      onSigint = () => {
        c.log.warn("Received SIGINT (Ctrl+C). Starting cleanup...");
        reject(new Error("SIGINT"));
      };
    });
    process.on("SIGINT", onSigint!);
    await Promise.race([f(), sigintTrap]);
  } finally {
    await wrappedCleanup();
  }
};

async function disposeAllParallel(resources: AsyncDisposable[]): Promise<void> {
  const results = await Promise.allSettled(
    resources.map((r) => r[Symbol.asyncDispose]()),
  );
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason);
  if (errors.length) {
    throw { errors, msg: "Errors during parallel resource disposal" };
  }
}

export function combineAsyncDisposables<R>(
  factories: (() => Promise<AsyncDisposable & R>)[],
): () => Promise<AsyncDisposable & R[]> {
  return async () => {
    const resources: (AsyncDisposable & R)[] = [];

    try {
      await Promise.allSettled(
        factories.map(async (factory) => resources.push(await factory())),
      );
    } catch (acquireError) {
      // Partially acquired — clean up what we have
      await disposeAllParallel(resources);
      throw acquireError;
    }

    return Object.assign(resources as R[], {
      [Symbol.asyncDispose]: () => disposeAllParallel(resources),
    });
  };
}

export async function withResource<R, Z>(
  acquire: () => Promise<AsyncDisposable & R>,
  f: (resource: R) => Z | Promise<Z>,
): Promise<Z> {
  await using resource = await acquire();
  return await f(resource);
}

export async function withResources<R, Z>(
  factories: (() => Promise<AsyncDisposable & R>)[],
  f: (resources: R[]) => Z | Promise<Z>,
) {
  return await withResource(combineAsyncDisposables(factories), f);
}

export const bg_cmds = (h: host.Host) => (cmds: string[]) =>
  Promise.all(
    cmds.map((cmd) =>
      h.exec("/usr/bin/env", ["-S", "bash", "-c", `nohup ${cmd} &`]),
    ),
  );
