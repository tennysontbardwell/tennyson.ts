import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import * as ec2 from "tennyson/lib/infra/ec2";
import * as host from "tennyson/lib/infra/host";
import * as execlib from "tennyson/lib/core/exec";

import * as path from "path";
import * as fs from "fs/promises";
import * as pl from "nodejs-polars";
import dns from "dns";

import { PYTHON_SCRIPT } from "./python-script";
import * as util from "./util";

const iterations = 150;
const jitterDelay = 0.01;
const delay = 0.1;

// const fleetSize = 36;
// const zones = (() => {
//   const regions = ["us-east-1", "us-east-2", "us-west-2", "ap-east-1"] as const;
//   const zones = ["a", "b", "c"] as const;
//   const per = 3;
//   return new Map(
//     regions.flatMap((region) => zones.map((zone) => [{ region, zone }, per])),
//   );
// })();

// const fleetSize = 12;
// const zones = (() => {
//   const regions = ["us-east-1", "us-east-2", "us-west-2", "ap-east-1"] as const;
//   const zones = ["a", "b", "c"] as const;
//   const per = 1;
//   return new Map(
//     regions.flatMap((region) => zones.map((zone) => [{ region, zone }, per])),
//   );
// })();
// const totalDelay = Math.ceil(iterations * fleetSize * (delay + jitterDelay));

const fleetSize = 2;
const zones = (() => {
  const regions = ["us-east-1"] as const;
  const zones = ["a"] as const;
  const per = 2;
  return new Map(
    regions.flatMap((region) => zones.map((zone) => [{ region, zone }, per])),
  );
})();
const totalDelay = Math.ceil(iterations * fleetSize * (delay + jitterDelay));

interface NodeConfig {
  readonly name: string;
  readonly availabilityZone: ec2.AvailabilityZone;
}

namespace NodeConfig {
  export const make = (availabilityZone: ec2.AvailabilityZone) =>
    c.id({ name: "temp-box-" + c.rndAlphNum(8), availabilityZone });
}

interface LiveNode {
  readonly config: NodeConfig;
  readonly host: host.Host;
  readonly ip: string;
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
    const dnsRes = await dns.promises.lookup(h.host.fqdn());
    return { ...h, config, ip: dnsRes.address };
  };
}

type FleetConfig = readonly NodeConfig[];

type Fleet_ = readonly LiveNode[];

namespace Fleet_ {
  const config = (options: {
    regions: ec2.Region[];
    zones: c.AlphaNumeric.AlphaLower[];
    perZone: number;
  }): FleetConfig => {
    const { regions, zones, perZone } = options;
    return regions.flatMap((region) =>
      zones.flatMap((zone) =>
        c.range(perZone).map((_) => NodeConfig.make({ region, zone })),
      ),
    );
  };

  const withFleet = async <T>(
    config: FleetConfig,
    f: (fleet: Fleet_) => Promise<T>,
  ) => {
    const factories = config.map(
      (nodeConfig) => () => LiveNode.ofConfig(nodeConfig),
    );
    return await util.withResources(factories, f);
  };
}

class Node {
  readonly name: string;
  box: host.Host | undefined;

  constructor(readonly availabilityZone?: ec2.AvailabilityZone) {
    this.name = "temp-box-" + c.rndAlphNum(8);
  }

  async expertStart() {
    c.info(`Starting ${this.name}`);
    const box = await ec2.createNewSmall(this.name, {
      additionalSecurityGroups: ["default", "all-8000s"],
      ...(this.availabilityZone !== undefined
        ? {
            region: this.availabilityZone.region,
            availabityZone: this.availabilityZone,
          }
        : {}),
    });
    this.box = box.host;
  }

  async cleanup() {
    c.info(`Cleaning ${this.name}`);
    await ec2.purgeByName(this.name, this.availabilityZone?.region);
  }

  async withLive(f: (node: Node) => Promise<void>) {
    await this.expertStart();
    const name = this.name;
    f(this).finally(async () => {
      await ec2.purgeByName(name);
    });
  }
}

namespace Setup {
  const configFile = (node: LiveNode, fleet: Fleet_) =>
    JSON.stringify({
      nodes: fleet.map((node) => ({
        name: node.config.name,
        hostname: node.host.fqdn(),
        ip: node.ip,
      })),
      self: {
        name: node.config.name,
        ip: node.ip,
      },
      jitterDelay,
      iterations,
      delay,
    });

  export const setupNode = (fleet: Fleet_) => async (node: LiveNode) => {
    const h = node.host;
    await h.exec("mkdir", ["/tmp/results"]);
    await Promise.all([
      h.putFile("/tmp/config.json", configFile(node, fleet)),
      h.putFile("/tmp/script.py", PYTHON_SCRIPT),
      h.exec("bash", ["-c", "sudo systemctl stop systemd-timesyncd"]),
    ]);
    const bg = util.bg_cmds(h);
    await bg(
      ["in", "out"].map(
        (x) =>
          `sudo timeout ${totalDelay + 5} tcpdump -U -n ${x}bound -i any -w /tmp/results/${x}bound.pcap --time-stamp-precision=nano &> /tmp/results/${x}bound-tcpdump.stdout`,
      ),
    );
  };
}

async function fleetTest(fleet: Fleet_) {
  const dir = `/tmp/fleet-results/${new Date().toISOString()}`;

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
      dir,
    ]);
  }

  await Promise.all(fleet.map(Setup.setupNode(fleet)));
  c.info("Fleet setup complete. Beginning Test");
  await Promise.all(fleet.map(runNode));
  c.info(`Waiting ${totalDelay + 15} seconds for completion`);
  await c.sleep((totalDelay + 15) * 1000);
  c.info("Test complete. Retrieving results");
  await Promise.all(fleet.map(finNode));
  c.info("Processing results");
  await util.processResults(
    fleet.map((x) => x.host.hostname()),
    dir,
  );
}

class Fleet {
  readonly nodes: Node[];
  ips: Record<string, string> = {};
  directory: string;

  constructor(
    n: number,
    options?: {
      availabilityZones?: Map<ec2.AvailabilityZone, number>;
    },
  ) {
    this.nodes = (() => {
      const zones = options?.availabilityZones;
      if (zones !== undefined) {
        c.assert(Array.from(zones.values()).reduce(c.add, 0) === n);
        return Array.from(zones.entries()).flatMap(([k, v]) =>
          c.range(v).map((_) => new Node(k)),
        );
      } else return Array.from({ length: n }, (_) => new Node());
    })();

    this.directory = `/tmp/fleet-results/${new Date().toISOString()}`;
  }

  async fetchIps() {
    await Promise.all(
      this.nodes.map(async (node) => {
        const res = await dns.promises.lookup(node.box!.fqdn());
        this.ips[node.name] = res.address;
      }),
    );
  }

  async runTest() {
    const fleet = this;

    const bg_cmds = (h: host.Host, cmds: string[] | string) =>
      Promise.all(
        c.toArray(cmds).map((cmd) =>
          h.exec("/usr/bin/env", ["-S", "bash", "-c", `nohup ${cmd} &`]),
        ),
      );
    const configFile = (node: Node) =>
      JSON.stringify({
        nodes: this.nodes.map((node) => ({
          name: node.name,
          hostname: node.box!.fqdn(),
          ip: this.ips[node.name],
        })),
        self: {
          name: node.name,
          ip: this.ips[node.name],
        },
        jitterDelay,
        iterations,
        delay,
      });

    async function setupNode(node: Node) {
      // const apt = box!.apt();
      await node.box!.exec("mkdir", ["/tmp/results"]);
      await Promise.all([
        node.box!.putFile("/tmp/config.json", configFile(node)),
        node.box!.putFile("/tmp/script.py", PYTHON_SCRIPT),
        node.box!.exec("bash", ["-c", "sudo systemctl stop systemd-timesyncd"]),
        // apt?.upgrade().then(() => apt.install(["python3-websockets", "python3-aiottp"]))
      ]);
      // c.info(`Node ${node.name} setup almost complete`);
      await Promise.all([
        bg_cmds(
          node.box!,
          `sudo timeout ${totalDelay + 5} tcpdump -U -n inbound -i any -w /tmp/results/inbound.pcap --time-stamp-precision=nano &> /tmp/results/inbound-tcpdump.stdout`,
        ),
        bg_cmds(
          node.box!,
          `sudo timeout ${totalDelay + 5} tcpdump -U -n outbound -w /tmp/results/outbound.pcap --time-stamp-precision=nano &> /tmp/results/outbound-tcpdump.stdout`,
        ),
      ]);
    }

    async function runNode(node: Node) {
      await Promise.all([
        bg_cmds(
          node.box!,
          "python3 /tmp/script.py server &> /tmp/results/server.stdout",
        ),
        bg_cmds(
          node.box!,
          "python3 /tmp/script.py client &> /tmp/results/client.stdout",
        ),
      ]);
    }

    async function finNode(node: Node) {
      const dir = path.resolve(fleet.directory, node.box!.hostname());
      await execlib.exec("mkdir", ["-p", dir]);
      await execlib.exec("scp", [
        "-r",
        `${node.box!.user}@${node.box!.fqdn()}:/tmp/results`,
        dir,
      ]);
    }

    await this.fetchIps();
    await Promise.all(this.nodes.map(setupNode));
    c.info("Fleet setup complete. Beginning Test");
    await Promise.all(this.nodes.map(runNode));
    c.info(`Waiting ${totalDelay + 15} seconds for completion`);
    await c.sleep((totalDelay + 15) * 1000);
    c.info("Test complete. Retrieving results");
    await Promise.all(this.nodes.map(finNode));
    c.info("Processing results");
    await util.processResults(
      this.nodes.map((x) => x.box!.hostname()),
      this.directory,
    );
  }

  async withLive(f: (nodes: Node[]) => Promise<void>) {
    const nodes = this.nodes;

    const cleanup = async () => {
      await Promise.all(nodes.map((x) => x.cleanup()));
      c.info("Cleanup completed successfully.");
    };

    async function run() {
      await Promise.all(nodes.map((x) => x.expertStart()));
      await f(nodes);
    }

    await util.withSiginTrap(run, cleanup);
  }
}

async function main() {
  let fleet = new Fleet(fleetSize, { availabilityZones: zones });
  await fleet.withLive(async () => {
    c.info("Fleet start-up complete");
    await fleet.runTest();
  });
  c.info("Cleaned up");
}

// async function main() {
//   const dir = "/tmp/fleet-results/2026-03-05T13:53:33.508Z";
//   const hosts = await c.gather(fs.glob(`${dir}/*/`));
//   await util.processResults(hosts.map(x => cn.path.basename(x)), dir);
// }

main().catch((error) => {
  c.log.error("error in main");
  c.log.error("error in main", error);
});
