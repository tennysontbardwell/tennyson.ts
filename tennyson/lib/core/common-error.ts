import type { NotFunction } from "./common-types";
import { log } from "./common-logger";

export class ErrorWithData extends Error {
  readonly data;

  constructor(message: string, data?: any) {
    super(message);
    this.data = data;
  }
}

export function assert(condition: false, data?: NotFunction<any>): never;
export function assert(condition: boolean, data?: NotFunction<any>): void;
export function assert(condition: boolean, data?: NotFunction<any>) {
  if (!condition) {
    log.error({ message: "Assertion Failed", data });
    throw new ErrorWithData("Assertion Failed", data);
  }
}
