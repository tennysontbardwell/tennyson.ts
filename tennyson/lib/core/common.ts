import process from "process";
import * as tslog from "tslog";
import * as os from "os";
import * as path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as uuid from 'uuid';
import { tqdm } from "./tqdm";
import { Writable } from 'stream';
import chain from 'stream-chain';
import { parser } from 'stream-json'; // JSON parser factory
import Assembler from 'stream-json/Assembler'; // Class to assemble the JS object


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

// https://kagi.com/assistant/92b7ca63-6a36-4458-9bd5-c9e53332c470
export async function parseJsonFileStream(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const pipeline = chain([
            fsSync.createReadStream(filePath, { encoding: 'utf8' }),
            parser(),
        ]);

        const asm = Assembler.connectTo(pipeline);
        asm.on('done', asm => resolve(asm.current));
    });
}

async function writeChunk(stream: Writable, chunk: string): Promise<void> {
  // Attempt to write the chunk. If stream.write() returns false, the internal buffer is full.
  if (!stream.write(chunk, 'utf8')) {
    // Wait for the 'drain' event before resolving the promise, allowing more data to be written.
    await new Promise<void>(resolve => stream.once('drain', resolve));
  }
  // If stream.write() returns true, the chunk was accepted, and we can proceed.
}

// https://kagi.com/assistant/92b7ca63-6a36-4458-9bd5-c9e53332c470
export async function recursivelyWriteObjectToStream(
    data: any,
    stream: Writable
): Promise<void> {
    if (data === undefined) {
        // For standalone 'undefined' or if 'undefined' is explicitly passed.
        // JSON.stringify(undefined) returns undefined (no string output).
        // In a streaming context, writing "null" is a common way to represent it.
        await writeChunk(stream, 'null');
        return;
    }
    if (data === null) {
        await writeChunk(stream, 'null');
    } else if (typeof data === 'string') {
        // Use JSON.stringify to ensure proper escaping and quoting of strings.
        await writeChunk(stream, JSON.stringify(data));
    } else if (typeof data === 'number' || typeof data === 'boolean') {
        await writeChunk(stream, String(data));
    } else if (Array.isArray(data)) {
        await writeChunk(stream, '[');
        for (let i = 0; i < data.length; i++) {
            if (i > 0) {
                await writeChunk(stream, ',');
            }
            // In JSON, 'undefined' in an array becomes 'null'.
            // Functions and Symbols in arrays also become 'null'.
            const element = data[i];
            if (element === undefined || typeof element === 'function' || typeof element === 'symbol') {
                await recursivelyWriteObjectToStream(null, stream);
            } else {
                await recursivelyWriteObjectToStream(element, stream);
            }
        }
        await writeChunk(stream, ']');
    } else if (typeof data === 'object') { // Excludes null, which is handled above.
        await writeChunk(stream, '{');
        const keys = Object.keys(data);
        let firstPropertyWritten = false;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = (data as Record<string, any>)[key];

            // JSON.stringify omits keys with 'undefined', function, or symbol values.
            if (value !== undefined && typeof value !== 'function' && typeof value !== 'symbol') {
                if (firstPropertyWritten) {
                    await writeChunk(stream, ',');
                }
                await writeChunk(stream, JSON.stringify(key)); // Keys are always strings in JSON.
                await writeChunk(stream, ':');
                await recursivelyWriteObjectToStream(value, stream);
                firstPropertyWritten = true;
            }
        }
        await writeChunk(stream, '}');
    } else {
        // This case handles types not explicitly covered, primarily top-level functions or symbols.
        // JSON.stringify would produce 'undefined' (no output) for these.
        // We write 'null' as a sensible default for a streaming context.
        await writeChunk(stream, 'null');
    }
}

export async function fsCacheResult<T extends NonNullable<any>>(
  path: string,
  f: () => Promise<T>)
  : Promise<T> {
  if (await fsExists(path)) {
    return parseJsonFileStream(path);
    // return JSON.parse(await fs.readFile(path, 'utf-8'));
  } else {
    let res = await f();
    // await writeToFile(res, path);
    const writeStream = fsSync.createWriteStream(path);
    await recursivelyWriteObjectToStream(res, writeStream);
    // streamJsonData(writeStream, res);
    // await new Promise((resolve, reject) => {
    //   writeStream.on('finish', () => resolve(null));
    //   writeStream.on('error', reject);
    // });
    // writeStream.close();
    return res;

    // let str = JSON.stringify(res);
    // await fs.writeFile(path, str);
    // jsonStream = JSONStream.stringify();
    // let str = JSONStream.stringify(res);
    // return res;
  }
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

export function mkCachable<T extends NonNullable<any>>(
  path: string, f: () => Promise<T>)
{
  return lazy(() => fsCacheResult(path, f))
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


export function rndAlphNum(length: number) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let rnd = Array.from({ length }, _ => chars.charAt(Math.floor(Math.random() * chars.length)));
  return rnd.join("");
}

export function getRandomElement<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}
