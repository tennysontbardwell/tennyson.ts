import { expect, test } from 'vitest'

import { getWeekNumber } from './common';

test("week number", () => {
  expect(
    getWeekNumber(new Date(2019, 11, 22, 12, 0, 0))
  ).toMatchInlineSnapshot(
    `51`
  );
  expect(
    getWeekNumber(new Date(2019, 11, 23, 12, 0, 0))
  ).toMatchInlineSnapshot(
    `52`
  );
  expect(
    getWeekNumber(new Date(2019, 11, 29, 12, 0, 0))
  ).toMatchInlineSnapshot(
    `52`
  );
  expect(
    getWeekNumber(new Date(2019, 11, 30, 12, 0, 0))
  ).toMatchInlineSnapshot(
    `1`
  );
  expect(
    getWeekNumber(new Date(2020, 0, 5, 12, 0, 0))
  ).toMatchInlineSnapshot(
    `1`
  );
  expect(
    getWeekNumber(new Date(2020, 0, 6, 12, 0, 0))
  ).toMatchInlineSnapshot(
    `2`
  );
});
