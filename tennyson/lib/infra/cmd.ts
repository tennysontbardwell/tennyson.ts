import type * as yargs from "yargs";

export namespace Devbox {
  const choices = ["small", "big", "gpu_medium"] as const;
  type Size = (typeof choices)[number];

  function rndName() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let rnd = Array.from({ length: 5 }, (_) =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    );
    return "temp-box-" + rnd.join("");
  }

  async function runThenKill(size: Size) {
    const util = await import("tennyson/lib/core/util");
    const ec2 = await import("tennyson/lib/infra/ec2");
    const name = rndName();
    const instance = ec2.sizes[size];
    await using box = await ec2.createNew(name, { instance });
    await box.host.passthroughSsh();
    await util.askQuestion("Proceed?");
  }

  export const cmd: yargs.CommandModule<{}, {}> = {
    command: "quickbox",
    describe: "",
    builder: {
      type: {
        describe: "",
        type: "string",
        choices,
        default: "small",
      },
    },
    handler: async (args: any) => {
      await runThenKill(args.type);
    },
  };
}
