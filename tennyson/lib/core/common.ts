import { toArray } from "./common-array";

export * from "./common-array";
export * from "./common-async";
export * from "./common-datetime";
export * from "./common-error";
export * from "./common-functional";
export * from "./common-lazy";
export * from "./common-logger";
export * from "./common-numbers";
export * from "./common-objects";
export * from "./common-optionish";
export * from "./common-rnd";
export * from "./common-types";
export * from "./common-unicode";

export function errorToObject(error: any) {
  const errorObj: Record<string, any> = {};
  Object.getOwnPropertyNames(error).forEach((key) => {
    errorObj[key] = error[key];
  });
  return errorObj;
}

// modified from https://www.npmjs.com/package/shell-escape
export function shellescape(a: string[] | string) {
  var ret: string[] = [];

  toArray(a).forEach(function (s) {
    if (!/^[A-Za-z0-9_\/-]+$/.test(s)) {
      s = "'" + s.replace(/'/g, "'\\''") + "'";
      s = s
        .replace(/^(?:'')+/g, "") // unduplicate single-quote at the beginning
        .replace(/\\'''/g, "\\'"); // remove non-escaped single-quote if there are enclosed between 2 escaped
    }
    ret.push(s);
  });

  return ret.join(" ");
}

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

export function copyAndModify<T>(original: T, mutate: (a: T) => void): T {
  const cp = clone(original);
  mutate(cp);
  return cp;
}
