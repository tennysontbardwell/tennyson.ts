import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import { promises as fs } from "fs";

// npm ls --all 2&>/dev/null | sed 's/[├─┬│└]/ /g; s/^    //; s/ /  /g' | vim '+set foldmethod=indent'

export async function view(dir: string) {
  const dropVer = (s: string) => s.replace(/(.+)@[^@]+$/, "$1");

  const packageJson = await cn.parseBigJson<{
    dependencies: Record<string, string>;
  }>(cn.path.join(dir, "package.json"));

  const resp = await cn.exec
    .exec("yarn", ["list", "--production", "--json", "--depth", "9999"])
    .then(
      (x) =>
        JSON.parse(x.stdout) as {
          data: { trees: { name: string; children: { name: string }[] }[] };
        },
    );

  const deps = Object.fromEntries(
    resp.data.trees.map((tree) => [
      dropVer(tree.name),
      tree.children.map((c) => dropVer(c.name)),
    ]),
  );

  function count(dep: string): { direct: number; total: number } {
    const sum = (numbers: number[]) =>
      numbers.reduce((acc, cur) => acc + cur, 0);
    // c.log.info(dep);
    // c.log.info(deps[dep]);
    const direct = deps[dep].length;
    const total =
      direct > 0 ? 1 + sum(deps[dep].map((dep) => count(dep).total)) : 0;
    return {
      direct,
      total,
    };
  }

  await cn.vdJson(
    Object.keys(packageJson.dependencies).map((dep: string) =>
      c.id({
        name: dep,
        ...count(dep),
      }),
    ),
  );
}
