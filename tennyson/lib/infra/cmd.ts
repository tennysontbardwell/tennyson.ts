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
    let util = await import("tennyson/lib/core/util");
    let ec2 = await import("tennyson/lib/infra/ec2");
    let name = rndName();
    let instance = ec2.sizes[size];
    let box = await ec2.createNew(name, { instance });
    await box.passthroughSsh();
    await util.askQuestion("Proceed?");
    await ec2.purgeByName(name);
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
