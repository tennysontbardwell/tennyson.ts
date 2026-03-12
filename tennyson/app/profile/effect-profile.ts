import * as c from "tennyson/lib/core/common";
import * as cli from "tennyson/lib/core/cli";

export const cmds = [
  cli.flagsCommand(
    "perf-effect-module",
    {
      module: {
        alias: "m",
        type: "string",
        choices: [
          "none",
          "data",
          "stream",
          "stream-effect",
          "stream-effect-and-run",
        ],
        required: true,
      },
    },
    async (args) => {
      {
        if (args.module === "none") await Promise.resolve(5)
        if (args.module === "data") await import("./effect-data");
        if (args.module === "stream") await import("./effect-stream");
        if (args.module === "stream-effect")
          await import("./effect-stream-runable");
        if (args.module === "stream-effect-and-run") {
          const x = await import("./effect-stream-runable");
          await x.main();
        }
      }
    },
  ),
  cli.flagsCommand(
    "perf-effect-quit",
    {
      platform: {
        alias: "p",
        describe: "Imports Node Platform",
        type: "string",
        choices: ["bun", "node"],
        required: false,
      },
    },
    async (args) => {
      const platformBun_ = () => import("@effect/platform-bun");
      const platformNode_ = () => import("@effect/platform-node");
      const effect_ = () => import("effect");

      const target = args.platform as "bun" | "node" | undefined;
      // const target = args.platform as "node" | undefined;

      if (target === undefined) {
        const effect = await effect_();

        effect.Effect.log("Hello World").pipe(effect.Effect.runSync);
      } else if (target === "node") {
        const [effect, platformNode] = await Promise.all([
          effect_(),
          platformNode_(),
        ]);

        effect.Effect.log("Hello World").pipe(
          effect.Effect.provide(platformNode.NodeContext.layer),
          platformNode.NodeRuntime.runMain(),
        );
      } else if (target === "bun") {
        const [effect, platformBun] = await Promise.all([
          effect_(),
          platformBun_(),
        ]);

        effect.Effect.log("Hello World").pipe(
          effect.Effect.provide(platformBun.BunContext.layer),
          platformBun.BunRuntime.runMain(),
        );
      } else {
        c.unreachable(target);
      }
    },
  ),
];
