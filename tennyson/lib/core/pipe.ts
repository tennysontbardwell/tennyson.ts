import * as common from "tennyson/lib/core/common";
import * as rx from 'rxjs';
import type * as ws from 'ws';
import type { IncomingMessage } from "http";
import type { EventEmitter } from "stream";


export namespace BiComm {
  export interface T<C, M> {
    commander$: rx.Subject<C>,
    messages$: rx.Observable<M>,
  }

  export function ofWS<C, M>(ws: WebSocket | ws.WebSocket): T<C, M> {
    let queue = [] as string[] | 'toClose';

    rx.fromEvent<any, null>(ws, 'open', (x: any) => null)
      .pipe(rx.first())
      .forEach(() => {
        if (queue === 'toClose')
          ws.close()
        else {
          queue.forEach(s => ws.send(s))
          queue = [];
        }
      });

    const close$ =
      ws.readyState === ws.CLOSED
        ? rx.of(null)
        : rx.fromEvent<any, null>(
          ws, "close", (_: CloseEvent) => null);

    function handleClose() {
      switch (ws.readyState) {
        case ws.CONNECTING:
          queue = 'toClose'
          break;
        case ws.OPEN:
          ws.close()
        default:
      }
    }
    close$.forEach(() => common.log.info("ws closed"));

    const errors$ =
      rx.fromEvent<any, never>(ws, "error", (error: ErrorEvent) => {
        common.log.error({
          message: "error from WS connection",
          errorMessage: error.message,
          error,
          errorerror: error.error,
        });
        throw new Error("error in WS")
      });

    const messagesRaw$ =
      rx.fromEvent<any, M>(ws, "message", (x: MessageEvent) =>
        <M>JSON.parse(<string>x.data));

    const messages$ =
      rx.merge(messagesRaw$, errors$).pipe(
        rx.takeUntil(close$),
        rx.share(),
      );

    const commander$ = new rx.Subject<C>();
    commander$.subscribe({
      next: (command: C) => {
        const s = JSON.stringify(command);
        if (ws.readyState === ws.OPEN)
          ws.send(s);
        else if (ws.readyState === ws.CONNECTING && queue !== 'toClose')
          queue.push(s);
      },
      error: handleClose,
      complete: handleClose,
    });

    close$.subscribe({ next: () => commander$.complete() });
    errors$.subscribe({ next: error => commander$.error(error) });

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
        (clientws: ws.WebSocket, request: IncomingMessage) =>
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
        rx.first(),
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
  for await (const batch of source) {}
}

