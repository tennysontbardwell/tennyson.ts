import * as common from "tennyson/lib/core/common";

import type { IncomingMessage } from "http";

import * as rx from 'rxjs';
import type * as ws from 'ws';
import { Data, Equal, HashMap, Option, Tuple } from "effect";

const c = common

export namespace BiComm {
  export interface T<C, M> {
    commander$: rx.Subject<C>,
    messages$: rx.Observable<M>,
  }

  export function ofWS<C, M>(ws: WebSocket | ws.WebSocket): T<C, M> {
    function isNodeWS(ws: WebSocket | ws.WebSocket): ws is WebSocket {
      return 'dispatchEvent' in ws
    }
    if (ws.readyState !== ws.CONNECTING)
      throw new Error(
        "This websocket is already open, messages might have been lost");

    const isClosed$ = new rx.BehaviorSubject(false);
    const closed$ = isClosed$.pipe(
      rx.filter(x => x),
      rx.take(1));

    let queue = [] as string[] | 'toClose';

    function fromEvent<T>(
      ws: WebSocket | ws.WebSocket,
      target: string,
    ): rx.Observable<T> {
      return isNodeWS(ws)
        ? rx.fromEvent<T, T>(ws, target, c.id)
        : rx.fromEvent<T, T>(ws, target, c.id)
    }

    function singleEvent<E extends keyof WebSocketEventMap, O>(
      target: E, handler: (event: WebSocketEventMap[E]) => O
    ) {
      return fromEvent<WebSocketEventMap[E]>(ws, target)
        .pipe(
          rx.map(handler),
          rx.take(1),
          rx.takeUntil(closed$),
          rx.tap({ error: err => common.log.error(err) }),
          rx.catchError(_err => rx.of(true)),
        );
    }

    singleEvent('open', () => null).forEach(() => {
      if (queue === 'toClose')
        ws.close()
      else {
        queue.forEach(s => ws.send(s))
        queue = [];
      }
    });

    // Needed in case `closed$` cancels `singleEvent('open'`

    fromEvent<void>(ws, 'open',).pipe(
      rx.map(() => null),
      rx.take(1),
      rx.catchError(_err => rx.of(null)),
    )

    singleEvent('close', (_) => true).subscribe(isClosed$);
    singleEvent('error', (errorEvent) => {
      common.log.error({ message: "Error in ws", errorEvent });
      return true;
    }).subscribe(isClosed$);

    function closeWS() {
      if (ws.readyState == ws.CONNECTING)
        queue = 'toClose'
      if (ws.readyState == ws.OPEN)
        ws.close()
    }
    closed$.forEach(closeWS)

    const messages$ =
      fromEvent<MessageEvent>(ws, "message").pipe(
        rx.map((x: MessageEvent) =>
          <M>JSON.parse(<string>x.data)),
        rx.takeUntil(closed$),
        rx.share({ resetOnError: false, resetOnComplete: false }),
      );

    const commander$ = new rx.Subject<C>();
    commander$
      .pipe(rx.takeUntil(closed$))
      .subscribe({
        next: (command: C) => {
          const s = JSON.stringify(command);
          if (ws.readyState === ws.OPEN)
            ws.send(s);
          else if (ws.readyState === ws.CONNECTING && queue !== 'toClose')
            queue.push(s);
        },
        error: () => isClosed$.next(true),
        complete: () => isClosed$.next(true),
      });

    return {
      messages$,
      commander$,
    }
  }

  export function ofWSSConnection<C, M>(
    wss: ws.WebSocketServer
  ) {
    const connections$ =
      rx.fromEvent(
        wss, 'connection',
        (clientws: ws.WebSocket, _request: IncomingMessage) =>
          ofWS<C, M>(clientws));
    return connections$;
  }
}

// export namespace BiCommTopicMux {
//   export interface ConfigEntry<C, R> {
//     parseCommand: (str: string) => C,
//     encodeCommand: (command: C) => string,
//     parseReply: (str: string) => R,
//     encodeReply: (reply: R) => string,
//     singleItem: boolean,
//   }

//   type Config = Record<string, ConfigEntry<any, any>>;

//   interface CommanderState {
//     nextTopicId: number,
//     openTopics: {
//       id: number,
//       observable: rx.Observable<any>,
//     }[]
//   }

//   interface ReplierState {
//     nextTopicId: number,
//     openTopics: {
//       id: number,
//       observer: rx.Observer<any>,
//     }[]
//   }

//   export function responderOfBiComm<U extends Config>(
//     config: U,
//     handler: { [K in keyof U]: BiComm.T<U[K], U[K]> }
//   ) {

//   }
//   export function commanderOfBiComm<U extends Config>(
//     config: Config,
//   ) {

//   }
// }

export namespace PingPongConfig {
  interface T {
    pingFreqMs: number,
    pongToleranceMs: number,
  }

  export function setupPingPong(t: T, w: ws.WebSocket) {
    const open$ = (() => {
      switch (w.readyState) {
        case w.CONNECTING:
          return rx.fromEvent(w, 'open', () => "open");
        case w.OPEN:
          return rx.of("open")
        default:
          return rx.EMPTY
      }
    })();
    open$.pipe(rx.first()).forEach(() => {
      const pongTimer$ = rx.interval(t.pingFreqMs);
      const pong$ = rx.fromEventPattern(
        handler => w.on("pong", handler),
        handler => w.off("pong", handler)
      )

      const failures$ = pongTimer$.pipe(
        rx.map(() => {
          w.ping();
          return rx.interval(t.pongToleranceMs).pipe(
            rx.takeUntil(pong$)
          );
        }),
        rx.mergeAll(),
        rx.take(1),
      );

      failures$.subscribe(() => {
        common.log.warn('ws closed after failing to respond to ping');
        w.close()
      });
    })

    // if (w.readyState === w.CONNECTING) {
    //   w.on('open', () => setupPingPong(t, w));
    //   return
    // }
    // if (w.readyState !== w.OPEN)
    //   return
    // common.log.info("We are in the ready state");
    // var state: 'init' | 'pingOutstanding' | 'sleeping' | 'closed' = 'init';
    // function handle(event: 'timeout' | 'pong') {
    //   const startState = state;
    //   let interval = null as NodeJS.Timeout | null;
    //   function alarm(ms: number) {
    //     interval?.close();
    //     interval = setInterval(() => { handle('timeout') }, ms);
    //   }
    //   switch (state) {
    //     case 'init':
    //       w.ping();
    //       state = 'pingOutstanding';
    //       alarm(t.pongToleranceMs);
    //       break;
    //     case 'pingOutstanding':
    //       if (event === 'timeout') {
    //         common.log.warn('ws closed after failing to respond to ping');
    //         w.close();
    //         state = 'closed';
    //       } else {
    //         state = 'sleeping';
    //         alarm(t.pingFreqMs);
    //       }
    //       break;
    //     case 'sleeping':
    //       if (event === 'timeout') {
    //         state = 'pingOutstanding';
    //         w.ping();
    //         alarm(t.pongToleranceMs)
    //       } else {}
    //       break;
    //   }
    //   common.log.info(`${startState} === ${event} ===> ${state}`);
    // }
    // handle('timeout');
    // w.on("pong", () => handle("pong"));
  }
}


// export async function run() {
//   const server = createHTTPServer({
//     router: appRouter,
//   });

//   const wss = new ws.WebSocketServer({
//     server
//   });
//   wss.on('connection', (clientws, request) => {
//     const kws = kalshiWS.getKalshiWS();
//     kws.messages$.forEach(msg => {
//       common.log.info(msg);
//       return clientws.send(JSON.stringify(msg))
//     });
//     clientws.on('message', data =>
//       kws.commander.next(<kalshiWS.Command>JSON.parse(data.toString())));
//   })
//   applyWSSHandler({
//     wss,
//     router: appRouter,
//   });

//   server.listen(3000);
// }

export namespace WebSocket {
  // TODO ping and pong functions
}


export async function* toAsyncGenerator<T>(source: Iterable<T>) {
  for (const elm of source) {
    yield elm;
  }
}

export async function gather<T>(source: AsyncGenerator<T>) {
  let accum = [];
  for await (const batch of source) {
    accum.push(batch);
  }
  return accum;
}
// static eventToAsyncGenerator<T>(emitter: any, eventName: string)
//   : AsyncGenerator<T>
// {
//   const queue: T[] = [];
//   const resolvers: Array<(value: T | IteratorResult<T>) => void> = [];

//   const handleEvent = (data: T) => {
//     if (resolvers.length > 0) {
//       resolvers.shift()!({ value: data, done: false });
//     } else {
//       queue.push(data);
//     }
//   };

//   emitter.on(eventName, handleEvent);

//   return {
//     async next(): Promise<IteratorResult<T>> {
//       if (queue.length > 0) {
//         return { value: queue.shift()!, done: false };
//       }

//       return new Promise(resolve => {
//         resolvers.push(resolve);
//       });
//     },

//     [Symbol.asyncIterator]() { return this; }
//   };
// }

export class Pipe<T> {
  source: AsyncGenerator<T>

  constructor(source: AsyncGenerator<T>) {
    this.source = source;
  }

  static ofArray<T>(input: T[]) {
    return new Pipe(toAsyncGenerator(input));
  }

  // static ofPromisedArray<T>(input: Promise<T[]>) {
  //   async function* gen() {
  //     for await (const x of input) {
  //       yield x;
  //     }
  //   }
  //   return new Pipe(gen());
  // }

  mapSync<R>(f: (input: T) => R): Pipe<R> {
    const source = this.source;
    async function* gen() {
      for await (const x of source)
        yield f(x)
    }
    return new Pipe(gen())
  }

  map<R>(f: (input: T) => Promise<R>): Pipe<R> {
    const source = this.source;
    async function* gen() {
      for await (const x of source)
        yield await f(x)
    }
    return new Pipe(gen())
  }

  batchMap<R, U>(
    this: Pipe<U[]>,
    f: (input: U) => Promise<R>
  ): Pipe<R[]> {
    const source = this.source;
    async function* gen() {
      for await (const x of source) {
        const accum = [];
        for (const y of x)
          accum.push(await f(y));
        yield accum;
      }
    }
    return new Pipe(gen())
  }

  batchMapSync<R, U>(
    this: Pipe<U[]>,
    f: (input: U) => R
  ): Pipe<R[]> {
    const source = this.source;
    async function* gen() {
      for await (const x of source)
        yield x.map(f);
    }
    return new Pipe(gen())
  }

  batchFlat<U>(
    this: Pipe<U[][]>,
  ): Pipe<U[]> {
    const source = this.source;
    async function* gen() {
      for await (const batch of source) {
        yield batch.flat();
      }
    }
    return new Pipe(gen());
  }

  flat<U>(
    this: Pipe<U[]>,
  ): Pipe<U> {
    const source = this.source;
    async function* gen() {
      for await (const batch of source) {
        for (const item of batch) {
          yield item;
        }
      }
    }
    return new Pipe(gen());
  }

  batch(batchSize: number): Pipe<T[]> {
    const source = this.source;
    async function* gen() {
      let batch: T[] = [];
      for await (const item of source) {
        batch.push(item);
        if (batch.length >= batchSize) {
          yield batch;
          batch = []; // Reset for the next batch
        }
      }
      // Yield any remaining items in the last batch
      if (batch.length > 0) {
        yield batch;
      }
    }
    return new Pipe(gen());
  }

  async gather(): Promise<T[]> {
    return await gather(this.source);
  }
}

export async function* createBatches<T>(
  source: AsyncIterable<T>,
  batchSize: number
): AsyncGenerator<T[], void, undefined> {
  let batch: T[] = [];
  for await (const item of source) {
    batch.push(item);
    if (batch.length >= batchSize) {
      yield batch;
      batch = []; // Reset for the next batch
    }
  }
  // Yield any remaining items in the last batch
  if (batch.length > 0) {
    yield batch;
  }
}

export async function* batchesOfArray<T>(
  source: Array<T>,
  batchSize: number
) {
  var remaining;
  while (true) {
    yield source.slice(0, batchSize);
    remaining = source.slice(batchSize);
    if (remaining.length == 0)
      break;
  }
}

export async function* runBatchProcessing<A, B>(
  source: AsyncIterable<A>,
  fn: (input: A[]) => Promise<B[]>,
  batchSize: number,
): AsyncGenerator<B[]> {
  const batchedObjectStream = createBatches(source, batchSize);
  batchedObjectStream
  for await (const batch of batchedObjectStream) {
    yield await fn(batch);
  }
}

export async function drain(source: AsyncGenerator<any>) {
  for await (const _batch of source) {}
}

export function tapDebug<T>(meta: { [key: string]: any }, enableNext = true) {
  const notes = { ...meta, message: "tapDebug event" }
  let count = 0;
  const log = (x: any) => common.log.debug({ ...notes, ...x, count });
  const next = enableNext
    ? (item: any) => log({ event: "next", item })
    : undefined;
  return rx.tap<T>(c.stripUndefined({
    next,
    subscribe: () => { count++; log({ event: "subscribe" }) },
    unsubscribe: () => { count--; log({ event: "subscribe" }) },
    complete: () => log({ event: "complete" }),
    error: (error: any) => log({ event: "error", error }),
    finalize: () => log({ event: "finalize" }),
  }));
}

export function tapFinalize<T>(meta: { [key: string]: any }, warn = false) {
  const notes = { message: "Observable closed", ...meta };
  const log = warn
    ? (x: any) => common.log.warn(x)
    : (x: any) => common.log.error(x)
  return rx.tap<T>({
    error: (error: any) => log({ ...notes, results: "error", error }),
    complete: () => log({ ...notes, results: "complete" }),
  });
}
export function tapError<T>(meta: { [key: string]: any }, warn = false) {
  const notes = { message: "error in observable", ...meta };
  const error = warn
    ? (error: any) => common.log.warn({ ...notes, error })
    : (error: any) => common.log.error({ ...notes, error });
  return rx.tap<T>({ error });
}

export function rxfilterMap<A, B>(f: (arg: A) => Option.Option<B>) {
  return (src$: rx.Observable<A>) => src$.pipe(
    rx.map(f),
    rx.filter(Option.isSome),
    rx.map(x => x.value),
  )
}

export class ReplayOnceSubject<T> extends rx.Subject<T> {
  private _buffer: T[] | 'drained' = [];

  next(value: T): void {
    if (!this.closed && this.isStopped && this._buffer !== 'drained')
      this._buffer.push(value);
    return super.next(value);
  }

  error(err: any) {
    this._buffer = 'drained'
    return super.error(err)
  }

  complete() {
    this._buffer = 'drained'
    return super.complete()
  }

  /** @internal */
  protected _subscribe(subscriber: rx.Subscriber<T>): rx.Subscription {
    (this as any)._throwIfClosed();

    const subscription: rx.Subscription
      = (this as any)._innerSubscribe(subscriber);

    if (this._buffer != 'drained') {
      const buffer = this._buffer;
      this._buffer = 'drained';
      for (let i = 0; i < buffer.length && !subscriber.closed; i++)
        subscriber.next(buffer[i]);
    }

    (this as any)._checkFinalizedStatuses(subscriber);

    return subscription;
  }
}

export function sharePlus<T>(
  config: {
    resetOnError?: boolean | ((error: any) => rx.ObservableInput<any>),
    resetOnComplete?: boolean | (() => rx.ObservableInput<any>),
    resetOnRefCountZero?: boolean | (() => rx.ObservableInput<any>),
    replayOne?: boolean
  }
) {
  const { resetOnError, resetOnComplete, resetOnRefCountZero, replayOne } =
    { replayOne: false, ...config }

  let storedVal = Option.none<T>()

  return function (src$: rx.Observable<T>): rx.Observable<T> {
    if (replayOne) {
      return rx.concat(
        rx.defer(() => rx.of(storedVal)),
        src$.pipe(
          rx.tap({ next: (val) => { storedVal = Option.some(val) } }),
          rx.finalize(() => { storedVal = Option.none() }),
          rx.share(c.stripUndefined(
            { resetOnError, resetOnComplete, resetOnRefCountZero })),
          rx.map(Option.some),
        )
      ).pipe(
        rx.filter(Option.isSome),
        rx.map(x => x.value),
      )
    }
    else
      return src$.pipe(
        rx.share(c.stripUndefined(
          { resetOnError, resetOnComplete, resetOnRefCountZero })),
      )
  }
}

// export function scanMap<V, A, O>(
//   f: (accum: A, value: V, index: number) => [A, Option.Option<O>],
//   seed: A,
// ): (a: rx.Observable<V>) => rx.Observable<O>;
// export function scanMap<V, A, O, S>(
//   f: (accum: A | S, value: V, index: number) => [A, Option.Option<O>],
//   seed: S,
// ): (a: rx.Observable<V>) => rx.Observable<O>;
export function scanMap<V, A, O, S>(
  f: (accum: A | S, value: V, index: number) => [A, Option.Option<O>],
  seed: S,
): (a: rx.Observable<V>) => rx.Observable<O> {
  return (src$) =>
    src$.pipe(
      rx.scan<V, [A, Option.Option<O>], [S, Option.Option<O>]>(
        ([accum, _output], input, index) => f(accum, input, index),
        Tuple.make(seed, Option.none())),
      rx.map(Tuple.getSecond),
      rx.filter(Option.isSome),
      rx.map(x => x.value),
    )
}
