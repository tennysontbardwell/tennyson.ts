import * as c from "tennyson/lib/core/common";
import * as cli from "tennyson/lib/core/cli";

const full = {
  fleetConfig: {
    regions: ["us-east-1", "us-east-2", "us-west-2", "ap-east-1"] as const,
    zones: ["a", "b", "c"] as const,
    perZone: 3,
  },
  testConfig: {
    iterations: 150,
    jitterDelay: 0.01,
    delay: 0.1,
  },
};

const configs = {
  full,
  "full-long": c.copyAndModify(full, (x) => {
    x.testConfig.iterations = 150 * 6;
  }),
  small: {
    fleetConfig: {
      regions: ["us-east-1", "us-east-2"] as const,
      zones: ["a", "b"] as const,
      perZone: 1,
    },
    testConfig: {
      iterations: 50,
      jitterDelay: 0.01,
      delay: 0.1,
    },
  },
} as const;

export const cmds = [
  cli.flagsCommand(
    "process-results",
    { dir: { type: "string", required: true } },
    async (args) => {
      const main = await import("./index");
      main.processResultsDir(args.dir);
    },
  ),
  cli.flagsCommand(
    "run",
    {
      config: {
        type: "string",
        required: true,
        choices: Object.keys(configs),
      },
    },
    async (args) => {
      const main = await import("./index");
      main.run(configs[args.config as keyof typeof configs]);
    },
  ),
];
