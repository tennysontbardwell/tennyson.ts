import * as c from "tennyson/lib/core/common";

import { FileSystem } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"

import { Stream, Effect, Schedule, Schema, Sink } from "effect";
import { homedir } from "os";
import path from "path";
import { runTxLog } from "tennyson/lib/core/txlog";
import * as playwrite from 'playwright'
import fs from 'fs'


export async function quickdev() {
  const f = await playwrite.firefox.launch({})
  // const f = await playwrite.chromium.launch({ headless: false })
  // await c.sleep(5000)
  const page = await f.newPage({ deviceScaleFactor: 4 })
  await page.goto("google.com", { timeout: 180_000 })
  const buff = await page.screenshot({ fullPage: false })
  fs.writeFileSync(path.join(homedir(), "Desktop/sceenshot.png"), buff)
  const html = await page.content()
  fs.writeFileSync(path.join(homedir(), "Desktop/body.html"), html)
  await f.close()

  // const p = path.join(homedir(), 'Desktop/txlogtest')
  // const txRequests$ =
  //   Schedule.spaced("1 second").pipe(
  //     Schedule.compose(Schedule.recurs(10)),
  //     Stream.fromSchedule,
  //   )
  // const committed$ = Sink.forEach(Effect.log)
  // const f = (state: number) => (tx: number) => tx + state
  // const program =
  //   // Stream.run(txRequests$, committed$)
  //   runTxLog(p, 0, txRequests$, committed$, f, Schema.Number, Schema.Number)
  //   // Stream.runCollect(txRequests$).pipe(Effect.map(console.log))
  // NodeRuntime.runMain(program.pipe(Effect.provide(NodeContext.layer)))
}
