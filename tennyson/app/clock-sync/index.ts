import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import * as ec2 from "tennyson/lib/infra/ec2";
import * as host from "tennyson/lib/infra/host";
import * as execlib from "tennyson/lib/core/exec";

import * as path from "path";
import * as fs from "fs/promises";

import { PYTHON_SCRIPT } from "./python-script";
import * as util from "./util";

interface NodeConfig {
  readonly name: string;
  readonly humanName: string;
  readonly availabilityZone: ec2.AvailabilityZone;
}

namespace NodeConfig {
  export const make = (
    availabilityZone: ec2.AvailabilityZone,
    humanName: string,
  ) =>
    c.id({ name: "temp-box-" + c.rndAlphNum(8), humanName, availabilityZone });
}

interface LiveNode {
  readonly config: NodeConfig;
  readonly host: host.Host;
  readonly ip: string;
  readonly privateIp: string;
  readonly [Symbol.asyncDispose]: () => Promise<void>;
}

namespace LiveNode {
  export const ofConfig = async (config: NodeConfig): Promise<LiveNode> => {
    const h = await ec2.createNewSmall(config.name, {
      additionalSecurityGroups: ["default", "all-8000s"],
      ...(config.availabilityZone !== undefined
        ? {
            region: config.availabilityZone.region,
            availabityZone: config.availabilityZone,
          }
        : {}),
    });
    return {
      ...h,
      config,
      ip: h.instance.PublicIpAddress!,
      privateIp: h.instance.PrivateIpAddress!,
    };
  };
}

type FleetConfig = readonly NodeConfig[];

type Fleet = readonly LiveNode[];

namespace Fleet {
  export const config = (options: {
    regions: readonly ec2.Region[];
    zones: readonly c.AlphaNumeric.AlphaLower[];
    perZone: number;
  }): FleetConfig => {
    const { regions, zones, perZone } = options;
    return regions.flatMap((region) =>
      zones.flatMap((zone) => {
        const az = { region, zone };
        return c
          .range(1, 1 + perZone)
          .map((i) =>
            NodeConfig.make(az, `${ec2.AvailabilityZone.toString(az)}-${i}`),
          );
      }),
    );
  };

  export const withFleet = async <T>(
    config: FleetConfig,
    f: (fleet: Fleet) => Promise<T>,
  ) => {
    const factories = config.map(
      (nodeConfig) => () => LiveNode.ofConfig(nodeConfig),
    );
    return await util.withResources(factories, f);
  };
}

interface TestConfig {
  jitterDelay: number;
  iterations: number;
  delay: number;
}

const totalDelay = (config: TestConfig, fleetSize: number) =>
  Math.ceil(
    config.iterations * fleetSize * (config.delay + config.jitterDelay),
  );

namespace Setup {
  const configFile = (forNode: LiveNode, fleet: Fleet, config: TestConfig) =>
    JSON.stringify({
      nodes: fleet.map((node) => ({
        name: node.config.humanName,
        hostname: node.host.fqdn(),
        ip:
          forNode.config.availabilityZone.region ==
          node.config.availabilityZone.region
            ? node.privateIp
            : node.ip,
      })),
      self: {
        name: forNode.config.humanName,
        ip: forNode.ip,
      },
      jitterDelay: config.jitterDelay,
      iterations: config.iterations,
      delay: config.delay,
    });

  export const setupNode =
    (fleet: Fleet, config: TestConfig) => async (node: LiveNode) => {
      const h = node.host;
      await h.exec("mkdir", ["/tmp/results"]);
      await Promise.all([
        h.putFile("/tmp/config.json", configFile(node, fleet, config)),
        h.putFile("/tmp/script.py", PYTHON_SCRIPT),
        h.exec("bash", ["-c", "sudo systemctl stop systemd-timesyncd"]),
      ]);
    };
}

const fleetTest = (config: TestConfig) => async (fleet: Fleet) => {
  const dir = `/tmp/fleet-results/${new Date().toISOString()}`;
  const totalDelay_ = totalDelay(config, fleet.length);

  async function startListening(node: LiveNode) {
    const bg = util.bg_cmds(node.host);
    await bg(
      ["in", "out"].map(
        (x) =>
          `sudo timeout ${totalDelay(config, fleet.length) + 5 + fleet.length} tcpdump -U -n ${x}bound -i any -w /tmp/results/${x}bound.pcap --time-stamp-precision=nano &> /tmp/results/${x}bound-tcpdump.stdout`,
      ),
    );
  }

  async function runNode(node: LiveNode) {
    const bg = util.bg_cmds(node.host);
    await bg(
      ["server", "client"].map(
        (arg) => `python3 /tmp/script.py ${arg} &> /tmp/results/${arg}.stdout`,
      ),
    );
  }

  async function finNode(node: LiveNode) {
    const d = path.resolve(dir, node.host.hostname());
    await fs.mkdir(d, { recursive: true });
    await execlib.exec("scp", [
      "-r",
      `${node.host.user}@${node.host.fqdn()}:/tmp/results`,
      d,
    ]);
  }

  c.info("Fleet procured, starting setup");
  await Promise.all(fleet.map(Setup.setupNode(fleet, config)));
  c.info("Fleet setup complete. Beginning Test");
  await Promise.all(fleet.map(startListening));
  await Promise.all(fleet.map(runNode));
  const waitTime = totalDelay_ * 1.05 + 15 + fleet.length;
  c.info(`Waiting ${waitTime} seconds for completion`);
  await c.sleep(waitTime * 1000);
  c.info("Test complete. Retrieving results");
  await Promise.all(fleet.map(finNode));
  c.info("Processing results");
  await util.processResults(
    fleet.map((x) =>
      c.id({ hostname: x.host.hostname(), zone: x.config.availabilityZone }),
    ),
    dir,
  );
};

const configs = {
  full: {
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
  },
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
};

async function main() {
  // const config = configs.small;
  const config = configs.full;

  const fleetConfig = Fleet.config(config.fleetConfig);
  const testConfig = config.testConfig;

  // c.info({ fleetConfig, testConfig });
  c.info(config);

  await Fleet.withFleet(fleetConfig, fleetTest(testConfig));
}

// async function main() {
//   const dir = "/tmp/fleet-results/2026-03-05T13:53:33.508Z";
//   const hosts = await c.gather(fs.glob(`${dir}/*/`));
//   await util.processResults(hosts.map(x => cn.path.basename(x)), dir);
// }

main().catch((error) => {
  c.log.error("error in main");
  c.log.error(error);
});
