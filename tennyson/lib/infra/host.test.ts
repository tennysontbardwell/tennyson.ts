import { expect, test } from "vitest";

import { Host } from "./host";

test("", () => {
  expect(Host.ofLocalName("test").fqdn()).toMatchInlineSnapshot(
    `"test.node.nyc1.consul.tennysontbardwell.com"`,
  );
  expect(
    Host.ofLocalName("test.node.nyc1.consul.tennysontbardwell.com").fqdn(),
  ).toMatchInlineSnapshot(`"test.node.nyc1.consul.tennysontbardwell.com"`);
  expect(
    Host.ofLocalName("test.node.consul.tennysontbardwell.com").fqdn(),
  ).toMatchInlineSnapshot(`"test.node.nyc1.consul.tennysontbardwell.com"`);
});
