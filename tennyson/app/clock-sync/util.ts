import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import * as host from "tennyson/lib/infra/host";

export function parseHex(hex: String) {
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

export const mkdir = () => `/tmp/fleet-results/${new Date().toISOString()}`;

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
    resources.map(async (r) => {
      await r[Symbol.asyncDispose]();
    }),
  );
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason);
  if (errors.length) {
    throw new AggregateError(
      errors,
      "Errors during parallel resource disposal",
    );
  }
}

export function combineAsyncDisposables<R>(
  factories: (() => Promise<AsyncDisposable & R>)[],
): () => Promise<AsyncDisposable & R[]> {
  return async () => {
    process.on("exit", (code) => {
      console.error(`Process exiting with code: ${code}`);
      console.trace();
    });
    process.on("uncaughtException", (err) => {
      console.error("Uncaught exception:", err);
    });

    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled rejection:", reason);
      // NOTE: don't call process.exit() here during debugging
    });

    const promises = factories.map(async (f) => {
      return await f();
    });
    c.info("Starting procurement");
    const keepAlive = setInterval(() => {}, 60_000);
    const results = await Promise.allSettled(promises);
    clearInterval(keepAlive); // let the process exit normally when done

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason);

    const resources = results
      .filter(
        (r): r is PromiseFulfilledResult<Awaited<AsyncDisposable & R>> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);

    if (errors.length) {
      c.log.warn(
        "One or more resource factories failed. Starting cleanup",
        errors,
      );
      await disposeAllParallel(resources);
      throw new AggregateError(errors, "One or more resource factories failed");
    }

    c.assert(resources.length == factories.length);

    return Object.assign(resources, {
      [Symbol.asyncDispose]: async () => {
        return await disposeAllParallel(resources);
      },
    });
  };
}

export async function withResource<R, Z>(
  acquire: () => Promise<AsyncDisposable & R>,
  f: (resource: R) => Z | Promise<Z>,
): Promise<Z> {
  const resource = await acquire();
  try {
    return await f(resource);
  } finally {
    await resource[Symbol.asyncDispose]();
  }
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
