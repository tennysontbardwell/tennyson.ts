import * as c from "tennyson/lib/core/common";

import { Stream, Schedule, pipe } from "effect";

export namespace DataFlicker {
  export const dataA = [
    {
      name: "A",
      x: 1,
      y: 30,
      z: 5,
    },
    {
      name: "Z",
      x: 2,
      y: 20,
      z: 4,
    },
    {
      name: "C",
      x: 3,
      y: 10,
      z: 3,
    },
    {
      name: "F",
      x: 1.5,
      y: 10,
      z: 2,
    },
  ];

  const dataB = [
    ...dataA,
    {
      name: "D",
      x: 4,
      y: 0,
      z: 0,
    },
    {
      name: "E",
      x: 1.5,
      y: 20,
      z: 0,
    },
  ];

  export const stream = pipe(
    Schedule.spaced("30000 millis"),
    Stream.fromSchedule,
    Stream.map((i) => (i % 2 === 0 ? dataA : dataB)),
  );
}

export const oneKRows = () =>
  c.range(1000).map((i) =>
    c.id({
      name: i,
      x: Math.random() * 10,
      y: Math.random() * 10,
      z: Math.random() * 10,
    }),
  );
