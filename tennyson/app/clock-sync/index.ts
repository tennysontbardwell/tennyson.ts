import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import * as ec2 from "tennyson/lib/infra/ec2";
import * as host from "tennyson/lib/infra/host";
import * as execlib from "tennyson/lib/core/exec";

import * as path from "path";
import * as fs from "fs/promises";

import { PYTHON_SCRIPT } from "./python-script";
import * as util from "./util";
import { processResults } from "./process-results";

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

interface FleetPreConfig {
  regions: readonly ec2.Region[];
  zones: readonly c.AlphaNumeric.AlphaLower[];
  perZone: number;
}

type Fleet = readonly LiveNode[];

namespace Fleet {
  export const config = (options: FleetPreConfig): FleetConfig => {
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
      await h.exec("mkdir", ["/tmp/mydata"]);
      await Promise.all([
        h.putFile("/tmp/mydata/config.json", configFile(node, fleet, config)),
        h.putFile("/tmp/mydata/script.py", PYTHON_SCRIPT),
        h.exec("bash", ["-c", "sudo systemctl stop systemd-timesyncd"]),
      ]);
    };
}

const fleetTest =
  (config: TestConfig, dir_?: string) => async (fleet: Fleet) => {
    const dir = dir_ ?? util.mkdir();
    const totalDelay_ = totalDelay(config, fleet.length);

    async function bgOnAllNodes(cmds: string[]) {
      await Promise.all(
        fleet.map(async (node) => {
          await util.bg_cmds(node.host)(cmds);
        }),
      );
    }

    async function finNode(node: LiveNode) {
      const d = path.resolve(dir, node.config.humanName);
      await fs.mkdir(d, { recursive: true });
      await execlib.exec("scp", [
        "-r",
        `${node.host.user}@${node.host.fqdn()}:/tmp/mydata`,
        d,
      ]);
    }

    const pyCmd = (arg: "server" | "client") =>
      `python3 /tmp/mydata/script.py ${arg} &> /tmp/mydata/${arg}.stdout`;

    c.info("Fleet procured, starting setup");
    await Promise.all(fleet.map(Setup.setupNode(fleet, config)));
    c.info("Fleet setup complete. Beginning Test");
    await bgOnAllNodes([
      `sudo timeout ${totalDelay_ + 5 + fleet.length} tcpdump -U -n -i any -w /tmp/mydata/tcpdump.pcap --time-stamp-precision=nano &> /tmp/mydata/tcpdump.stdout`,
      pyCmd("server"),
    ]);
    await bgOnAllNodes([pyCmd("client")]);
    const waitTime = totalDelay_ * 1.05 + 15 + fleet.length;
    c.info(`Waiting ${waitTime} seconds for completion`);
    await c.sleep(waitTime * 1000);
    c.info("Test complete. Retrieving results");
    await Promise.all(fleet.map(finNode));
    c.info("Done with Fleet");
  };

export async function processResultsDir(dir: string) {
  const dir_ = cn.resolveHome(dir);
  const hosts = await c.gather(fs.glob(`${dir_}/*/`));
  await processResults(
    hosts.map((x) => {
      const name = cn.path.basename(x);
      return c.id({
        name,
        zone: ec2.AvailabilityZone.ofString_exn(name.slice(0, -2)),
      });
    }),
    dir,
  );
}

export async function run(config: {
  fleetConfig: FleetPreConfig;
  testConfig: TestConfig;
}) {
  const fleetConfig = Fleet.config(config.fleetConfig);
  const testConfig = config.testConfig;
  c.info(config);
  const dir = util.mkdir();
  await Fleet.withFleet(fleetConfig, fleetTest(testConfig, dir));
  c.info("Processing results");
  process;
  await processResultsDir(dir);
}
