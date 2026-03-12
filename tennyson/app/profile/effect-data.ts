import { Data } from "effect";

// export const point = Data.struct({ x: 1, y: 2 });
class Person extends Data.Class<{ readonly name: string }> {}
// export const point = Data.Class

