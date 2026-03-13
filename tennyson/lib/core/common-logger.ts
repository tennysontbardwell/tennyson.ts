// import * as tslog from "tslog";

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
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;

const debugOn = inNode
  ? process.env["DEBUG"] !== undefined &&
    process.env["DEBUG"] !== null &&
    process.env["DEBUG"] !== "0" &&
    process.env["DEBUG"] !== ""
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
// export const prettyLog = new tslog.Logger({
//   type: "pretty",
//   prettyLogTemplate:
//     "{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}} {{filePathWithLine}}{{nameWithDelimiterPrefix}}\n{{logLevelName}} ",
//   minLevel,
//   prettyInspectOptions: { depth: Infinity },
// });

// export const jsonStdErrlog = new tslog.Logger({
//   type: "json",
//   minLevel,
//   overwrite: {
//     transportJSON: (logObj) => {
//       console.error(JSON.stringify(logObj));
//     },
//   },
// });

const webLog = {
  info: console.info,
  debug: console.debug,
  warn: console.warn,
  error: console.error,
  fatal: console.error,
};

// export var log = inNode ? prettyLog : webLog;
export var log = inNode ? (await import("./logger")).createLogger() : webLog;

// export const debug = log.debug.bind(log);
export const info = log.info.bind(log);
export const warn = log.warn.bind(log);
export const error = log.error.bind(log);
export const fatal = log.fatal.bind(log);
export const infoTap = <T>(a: T): T => {
  log.info(a);
  return a;
};
// export const warn = log.warn.bind(log);
// export const error = log.error.bind(log);
// export const fatal = log.fatal.bind(log);
