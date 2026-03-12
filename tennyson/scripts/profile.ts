#!/usr/bin/env node

import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

async function profile(cmd: string) {
  const warmup = 3;
  const trials = 10;
  await c.mapSeq(c.range(warmup), () => cn.exec.sh(cmd));
  const raw = await c.mapSeq(c.range(trials), () =>
    c.withTimer(() => cn.exec.sh(cmd)).then((x) => x.elapsed),
  );
  return {
    cmd,
    mean: c.mean(raw),
    stddev: c.stddev(raw),
    raw,
  };
}

async function main() {
  const commands = [
    "ttp --help",
    "./bin/index.js --help",
    "tt --help",
    "./bin/index.js meta test perf-effect-quit",
    "./bin/index.js meta test perf-effect-quit -p node",
    "./bin/index.js meta test perf-effect-quit -p bun",
    "bun run tennyson/index.ts -- meta test perf-effect-quit",
    "bun run tennyson/index.ts -- meta test perf-effect-quit -p node",
    "bun run tennyson/index.ts -- meta test perf-effect-quit -p bun",
    "bun run tennyson/index.ts -- --help",
  ];

  const res = await c.mapSeq(commands, profile);
  const pretty = res.map((x) =>
    c.id({
      cmd: x.cmd,
      mean: c.formatSI(x.mean, 2, "s"),
      stddev: c.formatSI(x.stddev, 2, "s"),
    }),
  );
  c.info(pretty);
  cn.vdJson(res)
}

await main();
