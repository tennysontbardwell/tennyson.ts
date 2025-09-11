import { expect, test } from "vitest";

import { queryOfUrlAndParams } from "./net-util";

test("queryOfUrlAndParams", () => {
  expect(
    queryOfUrlAndParams("example.com", {
      teststr: "str",
      test1: 1,
      testtrue: true,
      testUndefined: undefined,
    }),
  ).toMatchInlineSnapshot(`"example.com?teststr=str&test1=1&testtrue=true"`);

  expect(
    queryOfUrlAndParams("example.com", {
      testUndefined: undefined,
    }),
  ).toMatchInlineSnapshot(`"example.com"`);
});
