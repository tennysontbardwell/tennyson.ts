import { inspect } from "node:util";

// --- ANSI colors ---
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[91m",
} as const;

// --- Log levels ---
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

const LEVEL_STYLE: Record<LogLevel, { label: string; color: string }> = {
  [LogLevel.DEBUG]: { label: "DEBUG", color: C.reset },
  [LogLevel.INFO]: { label: "INFO ", color: C.blue },
  [LogLevel.WARN]: { label: "WARN ", color: C.yellow },
  [LogLevel.ERROR]: { label: "ERROR", color: C.red },
  [LogLevel.FATAL]: { label: "FATAL", color: C.red },
};

// --- Internals ---

function getCallerLocation(stackDepth: number = 4): string {
  const stack = new Error().stack?.split("\n") ?? [];
  // [0] Error, [1] getCallerLocation, [2] _log, [3] debug/info/…, [4] actual caller
  const frame = stack[stackDepth] ?? "";

  //  "    at foo (/abs/path/file.ts:12:5)"   or   "    at /abs/path/file.ts:12:5"
  const match =
    frame.match(/\((.+):(\d+):\d+\)/) ?? frame.match(/at\s+(.+):(\d+):\d+/);

  return match ? `${match[1]}:${match[2]}` : "unknown";
}

function formatTimestamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${MM}:${ss}:${ms}`;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) =>
      typeof a === "string"
        ? a
        : inspect(a, { colors: true, depth: 6, compact: false }),
    )
    .join(" ");
}

// --- Public API ---

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
  setLevel: (level: LogLevel) => void;
}

export function createLogger(
  name?: string,
  minLevel: LogLevel = LogLevel.INFO,
): Logger {
  const namesuffix = name ? ` [${name}]` : "";

  function _log(level: LogLevel, args: unknown[]): void {
    if (level < minLevel) return;

    const { label, color } = LEVEL_STYLE[level];
    const ts = formatTimestamp();
    const loc = getCallerLocation();
    const body = formatArgs(args);

    // Format:  {{timestamp}} {{filePathWithLine}}{{nameWithDelimiterPrefix}}
    //          {{logLevelName}} {{message…}}
    process.stderr.write(
      `${C.gray}${ts}${C.reset} ${loc}${namesuffix}\n` +
        `${color}${C.bold}${label}${C.reset} ${body}\n`,
    );
  }

  return {
    debug: (...args: unknown[]) => _log(LogLevel.DEBUG, args),
    info: (...args: unknown[]) => _log(LogLevel.INFO, args),
    warn: (...args: unknown[]) => _log(LogLevel.WARN, args),
    error: (...args: unknown[]) => _log(LogLevel.ERROR, args),
    fatal: (...args: unknown[]) => _log(LogLevel.FATAL, args),
    setLevel: (level: LogLevel) => {
      minLevel = level;
    },
  };
}
