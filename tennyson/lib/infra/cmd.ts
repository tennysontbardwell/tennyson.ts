import * as c from "tennyson/lib/core/common";
import * as cli from "tennyson/lib/core/cli";

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

  async function runThenKill(size: Size, kill = true, gb?: number) {
    const util = await import("tennyson/lib/core/util");
    const ec2 = await import("tennyson/lib/infra/ec2");
    const name = rndName();
    const instance = ec2.sizes[size];
    const mkbox = async () =>
      await ec2.createNew(name, c.stripUndefined({ instance, diskSizeGb: gb }));
    if (kill) {
      await using box = await mkbox();
      await box.host.passthroughSsh();
      await util.askQuestion("Proceed?");
    } else {
      const box = await mkbox();
      await box.host.passthroughSsh();
    }
  }

  export const cmd = cli.flagsCommand(
    "quickbox",
    {
      cleanup: {
        describe: "If false, cleans up after",
        type: "boolean",
        default: true,
        requiresArg: true,
      },
      type: {
        describe: "",
        type: "string",
        choices,
        default: "small",
      },
      disk: {
        describe: "Disk size in GB",
        type: "number",
        required: false,
      },
    },
    async (args) => {
      await runThenKill(
        args.type as (typeof choices)[number],
        args.cleanup,
        args.disk,
      );
    },
  );
}
