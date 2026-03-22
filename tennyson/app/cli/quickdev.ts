import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import { FileSystem } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";

import { pipe, Stream, Effect, Schedule, Schema, Sink, Console } from "effect";
import { runTxLog } from "tennyson/lib/core/txlog";

export async function quickdev() {
  const app = Effect.gen(function* () {
    const State = Schema.JsonNumber;
    const Tx = Schema.JsonNumber;
    const input = pipe(
      Schedule.fixed("250 millis"),
      Stream.fromSchedule,
      Stream.take(5),
    );
    const output = Sink.forEach(Console.log);
    yield* runTxLog(
      cn.resolveHome("~/Desktop/test/test"),
      0,
      input,
      output,
      (state: number) => (tx: number) => tx + state,
      State,
      Tx,
    );
  });
  return pipe(app, Effect.provide(NodeContext.layer), NodeRuntime.runMain());
}
