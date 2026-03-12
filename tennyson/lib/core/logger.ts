import { inspect } from "node:util";
import { fileURLToPath } from "node:url";

interface CallSite {
  getFileName(): string | null;
  getLineNumber(): number | null;
  getColumnNumber(): number | null;
  getFunctionName(): string | null;
  getTypeName(): string | null;
  isEval(): boolean;
}

const THIS_FILE = /* @__PURE__ */ (() => {
  try {
    return fileURLToPath(import.meta.url);
  } catch {
    return __filename;
  }
})();

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

function getCallerLocation(): string {
  const originalPrepare = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = (_err, sites) => sites;
    const err = {} as { stack: CallSite[] };
    Error.captureStackTrace(err, getCallerLocation);
    const sites = err.stack;

    for (const site of sites) {
      let file = site.getFileName();
      if (!file) continue;

      if (file.startsWith("file://")) {
        try { file = fileURLToPath(file); } catch {}
      }

      if (file === THIS_FILE) continue;

      const line = site.getLineNumber() ?? "?";
      return `${file}:${line}`;
    }
  } finally {
    Error.prepareStackTrace = originalPrepare;
  }
  return "unknown";
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
