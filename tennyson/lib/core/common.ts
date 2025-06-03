import process from "process";
import * as tslog from "tslog";
import * as os from "os";
import * as path from 'path';
import { promises as fs } from 'fs';
import * as uuid from 'uuid';
import { tqdm } from "./tqdm";

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

type logLevel = "debug" | "info" | "error";
function compare(a: logLevel, b: logLevel) {
  function toInt(level: logLevel): number {
    switch (level) {
      case "debug":
        return 0;
      case "info":
        return 1;
      case "error":
        return 2;
    }
  }
  return toInt(a) - toInt(b);
}

const debugOn =
  process.env["DEBUG"] !== undefined &&
  process.env["DEBUG"] !== null &&
  process.env["DEBUG"] != "0" &&
  process.env["DEBUG"] != "";

var logLevel = "info";

export class Log {
  static stdout(str: string) {
    process.stdout.write(str + "\n");
  }

  static log(data: any, logLevel: logLevel) {
    const pretty = (obj: any) => JSON.stringify(obj, null, 2);
    const msg = {
      logLevel,
      time: Date(),
      data,
    };
    this.stdout(pretty(msg));
  }

  static debug(data: any) {
    if (debugOn) {
      this.log(data, "debug");
    }
  }

  static info(data: any) {
    this.log(data, "info");
  }

  static error(data: any) {
    this.log(data, "error");
  }
}

export const log = new tslog.Logger({ minLevel: 3 });

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

export function resolveHome(path: string) {
  const filepath = path.split('/');
  if (filepath[0] === '~') {
    return [os.homedir()].concat(filepath.slice(1)).join('/');
  }
  return path;
}

export async function passthru(exe: string, args: string[]) {
  const child_process = await import("child_process");
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(exe, args, {
      stdio: 'inherit',
    });
    const signals = {
      // SIGHUP: 1,
      SIGINT: 2,
      // SIGQUIT: 3,
      // SIGTERM: 15,
      // SIGUSR1: 10,
      // SIGUSR2: 12,
    };
    Object.entries(signals).every(([sig, num]) =>
      process.on(sig, () => child.kill(num))
    );
    child.on("error", (error) => reject(error));
    child.on("close", (exitCode) => {
      // console.log("Exit code:", exitCode);
      // process.stdin.unpipe();
      resolve(exitCode);
    });
  });
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

export async function fsExists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function fsCacheResult<T extends NonNullable<any>>(
  path: string,
  f: () => Promise<T>)
: Promise<T> {
  if (await fsExists(path)) {
    return JSON.parse(await fs.readFile(path, 'utf-8'));
  } else {
    let res = await f();
    let str = JSON.stringify(res);
    await fs.writeFile(path, str);
    return res;
  }
}

export async function withTempDir(f: (dir: string) => Promise<void>) {
  const tempDir = path.join(os.tmpdir(), uuid.v4());

  try {
    await fs.mkdir(tempDir);
    await f(tempDir);
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await fs.rm(tempDir, { recursive: true });
  }
}

export async function jless(data: any) {
  await withTempDir(async (dir: string) => {
    let text = (typeof data === 'string') ? data : JSON.stringify(data);
    let file = path.join(dir, 'data.json');
    await fs.writeFile(file, text);
    await passthru("jless", [file]);
  })
}

export async function nvim(data: any, name = 'data.json') {
  await withTempDir(async (dir: string) => {
    let text = (typeof data === 'string') ? data : JSON.stringify(data);
    let file = path.join(dir, name);
    await fs.writeFile(file, text);
    await passthru("nvim", [file]);
  })
}

export async function vdJson(data: any) {
  await withTempDir(async (dir: string) => {
    let text = (typeof data === 'string') ? data : JSON.stringify(data);
    let file = path.join(dir, 'data.json');
    await fs.writeFile(file, text);
    await passthru("vd", [file]);
  })
}

export async function parseJsonFileToArray<T>(filePath: string): Promise<T[]> {
  const data = await fs.readFile(filePath, 'utf-8');
  return data.split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line));
}

export const range = (n: number) => Array.from({ length: n }, (value, key) => key)

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
    let [key, newItem] = fn(item);
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
