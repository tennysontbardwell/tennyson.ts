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

export class Pipe<T> {
  source: AsyncGenerator<T>

  constructor(source: AsyncGenerator<T>) {
    this.source = source;
  }

  static ofArray<T>(input: T[]) {
    return new Pipe(toAsyncGenerator(input));
  }

  mapSync<R>(f: (input: T) => R): Pipe<R> {
    let source = this.source;
    async function* gen() {
      for await (const x of source)
        yield f(x)
    }
    return new Pipe(gen())
  }

  map<R>(f: (input: T) => Promise<R>): Pipe<R> {
    let source = this.source;
    async function* gen() {
    for await (const x of source)
      yield await f(x)
    }
    return new Pipe(gen())
  }

  flat<U>(
    this: Pipe<U[]>,
  ): Pipe<U> {
    let source = this.source;
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
    let source = this.source;
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

export async function* runBatchProcessing<A,B>(
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

