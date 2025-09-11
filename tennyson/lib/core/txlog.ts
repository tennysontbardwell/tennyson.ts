import { Stream, Effect, Schema, Sink, Chunk } from "effect";
import { FileSystem } from "@effect/platform";

export function runTxLog<S, T>(
  path: string,
  seed: S,
  txRequests$: Stream.Stream<T>,
  committed$: Sink.Sink<any, readonly [S, T]>,
  f: (state: S) => (tx: T) => S,
  State: Schema.Schema<S>,
  Tx: Schema.Schema<T>,
) {
  // const logSchema = Schema.Union(
  //   Schema.TaggedStruct('tx', { data: Tx }),
  //   Schema.TaggedStruct('seed', { data: State }),
  //   // Schema.TaggedStruct('snapshot', { data: State }),
  // )

  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const decodeTx = Schema.decodeSync(Schema.parseJson(Tx));
    const encodeTx = Schema.encodeSync(Schema.parseJson(Tx));

    const seed_ = yield* Effect.gen(function* () {
      if (yield* fs.exists(path)) {
        const prevTxs = yield* fs.readFileString(path);
        // TODO fix large streams
        return prevTxs
          .split("\n")
          .filter((x) => x.trim().length > 0)
          .map((x) => decodeTx(x))
          .reduce((state, tx) => f(state)(tx), seed);
      } else {
        yield* fs.writeFileString(path, "");
        return seed;
      }
    });

    const stream$ = txRequests$.pipe(
      Stream.mapAccum(seed_, (state, tx) => {
        const state_ = f(state)(tx);
        return [state_, [state_, tx] as const];
      }),
      Stream.mapChunksEffect((chunk) =>
        Effect.gen(function* () {
          if (chunk.length === 0) return chunk;

          const strTxChunk = chunk.pipe(Chunk.map(([_, tx]) => encodeTx(tx)));

          yield* fs.writeFileString(path, Chunk.join(strTxChunk, "\n") + "\n", {
            flag: "a",
          });
          return chunk;
        }),
      ),
    );

    return yield* Stream.run(stream$, committed$);
  });
}
