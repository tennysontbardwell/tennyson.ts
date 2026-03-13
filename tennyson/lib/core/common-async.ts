import { ErrorWithData } from "./common-error";
import { tqdm } from "./tqdm";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry(
  ms: number,
  retries: number,
  task: () => Promise<boolean>,
): Promise<boolean> {
  if (retries < 1) {
    return false;
  } else {
    const res = await task();
    if (res) {
      return true;
    } else {
      await sleep(ms);
      return retry(ms, retries - 1, task);
    }
  }
}

export async function retryExn(
  ms: number,
  retries: number,
  task: () => Promise<boolean>,
): Promise<void> {
  const res = await retry(ms, retries, task);
  if (!res) {
    throw new ErrorWithData("Retry failed", { ms: ms, retries });
  }
}

export async function withStopwatch<T>(
  fn: () => T | Promise<T>,
): Promise<{ result: T; elapsed: number }> {
  const start = performance.now();
  const result = await fn();
  const elapsed = (performance.now() - start) / 1000;
  return { result, elapsed };
}

export async function gather<T>(source: AsyncIterable<T>) {
  let accum = [];
  for await (const batch of source) {
    accum.push(batch);
  }
  return accum;
}

export async function mapSeq<T, U>(
  items: Iterable<T>,
  fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const res: U[] = [];
  for (const [i, item] of [...items].entries()) res.push(await fn(item, i));
  return res;
}

export async function didRaise(fun: () => Promise<void>) {
  try {
    await fun();
  } catch {
    return false;
  }
  return true;
}

export class Semaphore {
  private current: number;
  private readonly max: number;
  private readonly waiting: (() => void)[];

  constructor(max: number) {
    this.current = 0;
    this.max = max;
    this.waiting = [];
  }

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(() => {
        this.current++;
        resolve();
      });
    });
  }

  release(): void {
    this.current--;
    if (this.current < this.max && this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next) {
        next();
      }
    }
  }

  async with<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export async function runInLimitedConcurrency<T>(
  fns: (() => Promise<T>)[],
  maxConcurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  const executing: Set<Promise<void>> = new Set();

  for await (const fn of tqdm(fns)) {
    const p = fn().then((result) => {
      results.push(result);
      executing.delete(p);
    });
    executing.add(p);

    if (executing.size >= maxConcurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing); // Wait for all remaining promises
  return results;
}

export async function mapInLimitedConcurrency<A, B>(
  fn: (x: A) => Promise<B>,
  inputs: A[],
  maxConcurrency: number,
): Promise<B[]> {
  return runInLimitedConcurrency(
    inputs.map((elm) => () => fn(elm)),
    maxConcurrency,
  );
}
