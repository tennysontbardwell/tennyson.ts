import process from "process";
import * as tslog from "tslog";
import * as os from "os";

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
