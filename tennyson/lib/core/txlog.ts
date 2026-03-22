import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import {
  Stream,
  Effect,
  Schema,
  Sink,
  Chunk,
  SubscriptionRef,
  DateTime,
  pipe,
} from "effect";
import { FileSystem } from "@effect/platform";

function batch<T>(handle: (items: T[]) => Effect.Effect<void>): Effect.Effect<{
  put: (item: T) => Effect.Effect<void>;
  close: () => Effect.Effect<void>;
}> {
  return Effect.gen(function* () {
    const newGroup = pipe(
      Effect.makeLatch(false),
      Effect.map((latch) => c.id({ latch, items: [] as T[] })),
    );
    const cur = yield* SubscriptionRef.make(yield* newGroup);
    const changeGroup = Effect.gen(function* () {
      return yield* SubscriptionRef.getAndSet(cur, yield* newGroup);
    });

    const handleItems = Effect.gen(function* () {
      const _hasData = yield* Stream.runForEachWhile(cur.changes, (x) =>
        Effect.succeed(x.items.length > 0),
      );
      const { items, latch } = yield* changeGroup;
      yield* handle(items);
      yield* latch.open;
    });

    pipe(handleItems, Effect.forever, Effect.fork);

    const put = (item: T) =>
      pipe(
        cur.modify((x) => [
          undefined,
          {
            ...x,
            items: [...x.items, item],
          },
        ]),
        Effect.ignore,
      );

    return {
      put,
      // TODO fix
      close: () => Effect.succeed(undefined),
    };
  });
}

const errorExn = <A>(effect: Effect.Effect<A, any>) =>
  Effect.catchAll(effect, (err) => Effect.die(err));

function fileTransactionLog(
  dir: string,
  name: string,
): Effect.Effect<
  {
    readPrev: Stream.Stream<string>;
    write: (content: string) => Effect.Effect<void>;
  },
  never,
  FileSystem.FileSystem
> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = cn.path.join(dir, name + ".txlog.jsonl");
    const readPrev = pipe(
      fs.readFileString(path),
      Effect.map((x) => x.split("\n")),
      errorExn,
      Stream.fromIterableEffect,
    );
    const write = (content: string) =>
      pipe(fs.writeFileString(path, content, { flag: "a+" }), errorExn);

    return { readPrev, write };
  });
}

export function runTxLog<S, T>(
  path: string,
  seed: S,
  txRequests$: Stream.Stream<T>,
  committed$: Sink.Sink<any, readonly [S, T]>,
  f: (state: S) => (tx: T) => S,
  State: Schema.Schema<S>,
  Tx: Schema.Schema<T>,
) {
  const LogItem = Schema.Union(
    Schema.TaggedStruct("Tx", {
      data: Tx,
      time: Schema.DateTimeUtc,
    }),
    Schema.TaggedStruct("Snapshot", {
      data: State,
      time: Schema.DateTimeUtc,
    }),
  );
  type LogItem = typeof LogItem.Type;
  const decode = Schema.decodeSync(Schema.parseJson(LogItem));
  const encode = Schema.encodeSync(Schema.parseJson(LogItem));

  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const prevFromLog = yield* Effect.gen(function* () {
      if (yield* fs.exists(path)) {
        const prevTxs = yield* fs.readFileString(path);
        // TODO fix large streams
        return prevTxs
          .split("\n")
          .filter((x) => x.trim().length > 0)
          .map((x) => decode(x))
          .reduce(
            (state, item): S => {
              switch (item._tag) {
                case "Tx": {
                  if (state === null) throw new Error("tx without snapshot");
                  else return f(state)(item.data);
                }
                case "Snapshot": {
                  return item.data;
                }
              }
            },
            null as S | null,
          );
      } else return null;
    });

    const seed_ = prevFromLog ?? seed;
    if (prevFromLog === null) {
      const s =
        encode({ _tag: "Snapshot", data: seed, time: yield* DateTime.now }) +
        "\n";
      yield* fs.writeFileString(path, s);
    }

    const stream$ = txRequests$.pipe(
      Stream.mapAccum(seed_, (state, tx) => {
        const state_ = f(state)(tx);
        return [state_, [state_, tx] as const];
      }),
      Stream.mapChunksEffect((chunk) =>
        Effect.gen(function* () {
          if (chunk.length === 0) return chunk;

          const time = yield* DateTime.now;
          const strTxChunk = chunk.pipe(
            Chunk.map(([_, tx]) => encode({ _tag: "Tx", data: tx, time })),
          );

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
