import * as tslog from "tslog";
import { tqdm } from "./tqdm";
import stableStringify from "json-stable-stringify"
import type { NotFunction } from "effect/Types";

export type Modify<T, R> = Omit<T, keyof R> & R;

export function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

export function datestamp() {
  const date = new Date();
  const pad = (num: number) => num.toString().padStart(2, "0");
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate())
  );
}

export class ErrorWithData extends Error {
  readonly data;

  constructor(message: string, data?: any) {
    super(message);
    this.data = data;
  }
}

// type logLevel = "debug" | "info" | "error";
// function compare(a: logLevel, b: logLevel) {
//   function toInt(level: logLevel): number {
//     switch (level) {
//       case "debug":
//         return 0;
//       case "info":
//         return 1;
//       case "error":
//         return 2;
//     }
//   }
//   return toInt(a) - toInt(b);
// }

export const inNode =
  typeof process !== 'undefined'
  && process.versions != null
  && process.versions.node != null

const debugOn =
  inNode
    ? (
      process.env["DEBUG"] !== undefined &&
      process.env["DEBUG"] !== null &&
      process.env["DEBUG"] !== "0" &&
      process.env["DEBUG"] !== ""
    )
    : false;

// var logLevel = "info";

// export class Log {
//   static stdout(str: string) {
//     process.stdout.write(str + "\n");
//   }

//   static log(data: any, logLevel: logLevel) {
//     const pretty = (obj: any) => JSON.stringify(obj, null, 2);
//     const msg = {
//       logLevel,
//       time: Date(),
//       data,
//     };
//     this.stdout(pretty(msg));
//   }

//   static debug(data: any) {
//     if (debugOn) {
//       this.log(data, "debug");
//     }
//   }

//   static info(data: any) {
//     this.log(data, "info");
//   }

//   static error(data: any) {
//     this.log(data, "error");
//   }
// }

const minLevel = debugOn ? 2 : 3;
export const prettyLog = new tslog.Logger({
  type: "pretty",
  minLevel,
});

export const jsonStdErrlog = new tslog.Logger({
  type: "json",
  minLevel,
  overwrite: {
    transportJSON: (logObj) => {
      console.error(JSON.stringify(logObj));
    }
  }
});

const webLog = {
  info: console.info,
  debug: console.debug,
  warn: console.warn,
  error: console.error,
  fatal: console.error,
}

export var log = inNode ? prettyLog : webLog;

// export const debug = log.debug.bind(log);
export const info = log.info.bind(log);
// export const warn = log.warn.bind(log);
// export const error = log.error.bind(log);
// export const fatal = log.fatal.bind(log);

export function assert(condition: false, data?: NotFunction<any>): never;
export function assert(condition: boolean, data?: NotFunction<any>): void;
export function assert(condition: boolean, data?: NotFunction<any>) {
  if (!condition) {
    log.error({ message: "Assertion Failed", data })
    throw new ErrorWithData("Assertion Failed", data)
  }
}

export function lazyAssert(condition: boolean, data?: () => any) {
  const data_ = data === undefined ? undefined : data();
  if (!condition) {
    log.error({ message: "Assertion Failed", data: data_ })
    throw new ErrorWithData("Assertion Failed", data_)
  }
}

export class LazyMap<K, V> {
  private cache = new Map<K, V>();

  constructor(private generator: (key: K) => V) {}

  get(key: K): V {
    if (!this.cache.has(key)) {
      const value = this.generator(key);
      this.cache.set(key, value);
    }
    return this.cache.get(key)!;
  }
}

export function lazyGet<K, V>(map: Map<K, V>, key: K, get: () => V) {
  if (!map.has(key)) {
    const value = get();
    map.set(key, value);
  }
  return map.get(key)!;
}

export function lazyGetObj<O extends Object, K extends keyof O>
  (obj: Partial<O>, key: K, get: () => O[K]): O[K] {
  if (!(key in obj))
    obj[key] = get()
  return obj[key]!;
}

export function memo<T, R>(fn: (arg: T) => R): (arg: T) => R {
  const cache = new Map<string, R>();
  return (arg: T): R => lazyGet(cache, stableStringify(arg), () => fn(arg));
}

export const id = (x: any) => x;

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function didRaise(fun: () => Promise<void>) {
  try {
    await fun()
  } catch {
    return false;
  }
  return true;
}

export async function ignore(x: Promise<any>) {
  await x;
}

export async function retry(
  ms: number,
  retries: number,
  task: () => Promise<boolean>
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
  task: () => Promise<boolean>
): Promise<void> {
  const res = await retry(ms, retries, task);
  if (!res) {
    throw { message: "Retry failed", ms: ms, retires: retries };
  }
}

export function cache<T>(fun: () => T): (() => T) {
  var res: null | ['set', T] = null;
  return () => {
    if (res === null) {
      res = ['set', fun()];
    }
    return res[1];
  };
}


export function lazy<T extends NonNullable<any>>(f: () => Promise<T>) {
  return {
    data: null as null | Promise<T>,
    get() {
      if (this.data === null) {
        this.data = f();
      }
      return this.data
    }
  }
}

export const range = (a: number, b?: number) => {
  if (b === undefined)
    return Array.from({ length: a }, (_value, key) => key)
  return Array.from({ length: b - a }, (_value, key) => key + a)
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
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
  maxConcurrency: number)
  : Promise<T[]> {
  const results: T[] = [];
  const executing: Set<Promise<void>> = new Set();

  for await (const fn of tqdm(fns)) {
    const p = fn().then(result => {
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
  fn: ((x: A) => Promise<B>),
  inputs: A[],
  maxConcurrency: number)
  : Promise<B[]> {
  return runInLimitedConcurrency(
    inputs.map(elm => (() => fn(elm))),
    maxConcurrency
  );
}

export function splitMap<K extends string | number | symbol, A, B>(
  array: A[],
  fn: (input: A) => [K, B]
): Record<K, B[]> {
  const res = {} as Record<K, B[]>;
  for (const item of array) {
    const [key, newItem] = fn(item);
    if (key in res) {
      res[key].push(newItem);
    } else {
      res[key] = [newItem];
    }
  }
  return res;
}

export function splitArray<K extends string | number | symbol, V>(
  array: V[],
  keyFn: (input: V) => K
): Record<K, V[]> {
  return splitMap(array, x => [keyFn(x), x]);
}


export function rndAlphNum(length: number) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const rnd = Array.from({ length }, _ => chars.charAt(Math.floor(Math.random() * chars.length)));
  return rnd.join("");
}

export function getRandomElement<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}

declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B }
export type Branded<T, B> = T & Brand<B>

export function objOfKeys<T, K extends string | number | symbol, D>(
  lst: readonly T[],
  data: (elm: T) => D,
  key: (elm: T) => K,
): Record<K, D> {
  return lst.reduce((accum, item) => {
    accum[key(item)] = data(item);
    return accum;
  },
    {} as Record<K, D>);
}

export function groupByMulti<T>(lst: T[], keys: (elm: T) => string[]) {
  return lst.reduce((accum, item) =>
    keys(item).reduce((accum, key) => {
      if (!accum[key])
        accum[key] = [item];
      else
        accum[key].push(item);
      return accum;
    }, accum),
    {} as Record<string, T[]>);
}

export function groupBy<T>(lst: T[], key: (elm: T) => string) {
  return lst.reduce((accum, item) => {
    const key_ = key(item);
    if (!accum[key_])
      accum[key_] = [item];
    else
      accum[key_].push(item);
    return accum;
  }, {} as Record<string, T[]>);
}

export function aListGroupBy<T>(lst: T[], key: (elm: T) => string)
  : [string, T[]][] {
  const obj = groupBy(lst, key);
  return Object.keys(obj)
    .map(key => [key, obj[key]] as [string, T[]])
    .sort(([a, _x], [b, _y]) => a.localeCompare(b));
}

export function aListGroupByMulti<T>(lst: T[], keys: (elm: T) => string[])
  : [string, T[]][] {
  const obj = groupByMulti(lst, keys);
  return Object.keys(obj)
    .map(key => [key, obj[key]] as [string, T[]])
    .sort(([a, _x], [b, _y]) => a.localeCompare(b));
}

export function errorToObject(error: any) {
  const errorObj: Record<string, any> = {};
  Object.getOwnPropertyNames(error).forEach(key => {
    errorObj[key] = error[key];
  });
  return errorObj;
}

export function getWeekNumber(date: Date): number {
  // Copying date so the original date won't be modified
  const tempDate = new Date(date.valueOf());

  // ISO week date weeks start on Monday, so correct the day number
  const dayNum = (date.getDay() + 6) % 7;

  // Set the target to the nearest Thursday (current date + 4 - current day number)
  tempDate.setDate(tempDate.getDate() - dayNum + 3);

  // ISO 8601 week number of the year for this date
  const firstThursday = tempDate.valueOf();

  // Set the target to the first day of the year
  // First set the target to January 1st
  tempDate.setMonth(0, 1);

  // If this is not a Thursday, set the target to the next Thursday
  if (tempDate.getDay() !== 4) {
    tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7);
  }

  // The weeknumber is the number of weeks between the first Thursday of the year
  // and the Thursday in the target week
  return 1 + Math.ceil((firstThursday - tempDate.valueOf()) / 604800000); // 604800000 = number of milliseconds in a week
}

export function boundInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function unreachable(x: never): never {
  throw new Error(`Unreachable: ${x}`);
}

export namespace AlphaNumeric {
  export const alphabetLowercase =
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
      'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'] as const
}
