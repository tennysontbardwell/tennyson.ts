export async function* toAsyncGenerator<T>(source: Iterable<T>) {
  for (const elm of source) {
    yield elm;
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

export async function* runBatchProcessing<A,B>(
  source: AsyncIterable<A>,
  fn: (input: A[]) => Promise<B[]>,
  batchSize: number,
): AsyncIterator<B[]> {
  const batchedObjectStream = createBatches(source, batchSize);
  batchedObjectStream
  for await (const batch of batchedObjectStream) {
    yield await fn(batch);
  }
}
