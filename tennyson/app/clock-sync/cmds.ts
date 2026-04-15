import * as c from "tennyson/lib/core/common";
import * as cli from "tennyson/lib/core/cli";

const bigFleet = {
  _tag: "simple",
  regions: ["us-east-1", "us-east-2", "us-west-2", "ap-east-1"],
  zones: ["a", "b", "c"],
  perZone: 3,
} as const;

const mediumFleet = {
  _tag: "simple",
  regions: ["us-east-1", "us-east-2", "us-west-2", "ap-east-1"],
  zones: ["a", "b"],
  perZone: 1,
} as const;

const leanFleet = {
  _tag: "zones",
  nodes: [
    { zone: { region: "us-east-1", zone: "a" }, count: 1 },
    { zone: { region: "us-east-1", zone: "b" }, count: 1 },
    { zone: { region: "us-east-2", zone: "a" }, count: 1 },
    { zone: { region: "us-west-2", zone: "a" }, count: 1 },
    { zone: { region: "ap-east-1", zone: "a" }, count: 1 },
  ],
} as const;

const mediumLength = {
  iterations: 150,
  jitterDelay: 0.01,
  delay: 0.1,
};

const shortLength = {
  iterations: 20,
  jitterDelay: 0.01,
  delay: 0.1,
};

const full = {
  fleetConfig: bigFleet,
  testConfig: mediumLength,
};

const configs = {
  "medium-1h": {
    fleetConfig: mediumFleet,
    testConfig: {
      iterations: 60 * 60,
      jitterDelay: 0.01,
      delay: 1 / 7,
    },
  },
  "fast-tick": {
    fleetConfig: mediumFleet,
    testConfig: {
      iterations: 2000,
      jitterDelay: 0.001,
      delay: 0.005,
    },
  },
  "lean-10hz-10m": {
    fleetConfig: leanFleet,
    testConfig: {
      iterations: Math.floor((1 / 0.02) * 10 * 60 / 5),
      jitterDelay: 0.005,
      delay: 0.02,
    },
  },
  "lean-10hz-20m": {
    fleetConfig: leanFleet,
    testConfig: {
      iterations: Math.floor((1 / 0.02) * 20 * 60 / 5),
      jitterDelay: 0.005,
      delay: 0.02,
    },
  },
  full,
  "full-long": c.copyAndModify(full, (x) => {
    x.testConfig.iterations = 150 * 6;
  }),
  test: {
    fleetConfig: {
      _tag: "simple",
      regions: ["us-east-1"] as const,
      zones: ["a", "b"] as const,
      perZone: 1,
    },
    testConfig: shortLength,
  },
  small: {
    fleetConfig: {
      _tag: "simple",
      regions: ["us-east-1", "us-east-2"] as const,
      zones: ["a", "b"] as const,
      perZone: 1,
    },
    testConfig: shortLength,
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
