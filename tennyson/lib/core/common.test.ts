import { expect, test } from "vitest";

import * as c from "./common";
import { getWeekNumber } from "./common";

test("week number", () => {
  expect(getWeekNumber(new Date(2019, 11, 22, 12, 0, 0))).toMatchInlineSnapshot(
    `51`,
  );
  expect(getWeekNumber(new Date(2019, 11, 23, 12, 0, 0))).toMatchInlineSnapshot(
    `52`,
  );
  expect(getWeekNumber(new Date(2019, 11, 29, 12, 0, 0))).toMatchInlineSnapshot(
    `52`,
  );
  expect(getWeekNumber(new Date(2019, 11, 30, 12, 0, 0))).toMatchInlineSnapshot(
    `1`,
  );
  expect(getWeekNumber(new Date(2020, 0, 5, 12, 0, 0))).toMatchInlineSnapshot(
    `1`,
  );
  expect(getWeekNumber(new Date(2020, 0, 6, 12, 0, 0))).toMatchInlineSnapshot(
    `2`,
  );
});

test("si formatting", () => {
  expect(c.formatSI(10001)).toMatchInlineSnapshot(`"10k"`);
  expect(c.formatSI(10010)).toMatchInlineSnapshot(`"10.01k"`);
  expect(c.formatSI(1000)).toMatchInlineSnapshot(`"1k"`);
  expect(c.formatSI(1010)).toMatchInlineSnapshot(`"1.01k"`);
  expect(c.formatSI(1001)).toMatchInlineSnapshot(`"1k"`);
  expect(c.formatSI(1000.1)).toMatchInlineSnapshot(`"1k"`);
  expect(c.formatSI(0.1)).toMatchInlineSnapshot(`"100m"`);
  expect(c.formatSI(1e10)).toMatchInlineSnapshot(`"10G"`);
});
