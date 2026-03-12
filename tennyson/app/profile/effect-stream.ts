import { Stream } from "effect";

const stream = Stream.iterate(1, (n) => n + 1) // Produces 1, 2, 3, ...
const take = stream.pipe(Stream.take(5))
export const collect = Stream.runCollect(take)
