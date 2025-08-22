import { Stream, Effect, Schema, Sink, Chunk } from "effect"
import { FileSystem } from "@effect/platform"

export function runTxLog<S, T>(
  path: string,
  seed: S,
  txRequests$: Stream.Stream<T>,
  commited$: Sink.Sink<any, readonly [S, T]>,
  f: (state: S) => (tx: T) => S,
  State: Schema.Schema<S>,
  Tx: Schema.Schema<T>,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    yield* fs.access(path, { writable: true })

    const seed_ = yield* Effect.gen(function* () {
      if (yield* fs.exists(path)) {
        const prevTxs = yield* fs.readFileString(path)
        return prevTxs.split('\n')
          .map(x => JSON.parse(x))
          .map(x => Schema.decodeSync(Tx)(x))
          .reduce((state, tx) => f(state)(tx), seed)
      } else
        return seed
    })

    const stream$ = txRequests$.pipe(
      Stream.mapAccum(seed_, (state, tx) => {
        const state_ = f(state)(tx)
        return [state_, [state_, tx] as const]
      }),

      Stream.mapChunksEffect(chunk =>
        Effect.gen(function* () {

          const strTxChunk = chunk.pipe(
            Chunk.map(([_, tx]) => Schema.encodeSync(Tx)(tx)),
            Chunk.map(x => JSON.stringify(x)),
          )

          yield* fs.writeFileString(
            path,
            Chunk.join(strTxChunk, '\n'),
            { flag: 'a' }
          )
          return chunk
        }))
    )

    return Stream.run(stream$, commited$)
  })
}
