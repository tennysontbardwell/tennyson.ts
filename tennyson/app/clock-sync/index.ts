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

class Node {
  readonly name: string;
  box: host.Host | undefined;

  constructor(readonly availabilityZone?: ec2.AvailabilityZone) {
    this.availabilityZone = availabilityZone;
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let rnd = Array.from({ length: 5 }, (_) =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    );
    this.name = "temp-box-" + rnd.join("");
  }

  async expertStart() {
    c.info(`Starting ${this.name}`);
    this.box = await ec2.createNewSmall(this.name, {
      additionalSecurityGroups: ["default", "all-8000s"],
      ...(this.availabilityZone !== undefined
        ? {
            region: this.availabilityZone.region,
            availabityZone: this.availabilityZone,
          }
        : {}),
    });
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

    const bg_cmd = (node: Node, cmd: string) =>
      // node.box!.exec("/bin/bash", ["-c", `nohup ${cmd} &`]);
      node.box!.exec("/usr/bin/env", ["-S", "bash", "-c", `nohup ${cmd} &`]);

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
        bg_cmd(
          node,
          `sudo timeout ${totalDelay + 5} tcpdump -U -n inbound -i any -w /tmp/results/inbound.pcap --time-stamp-precision=nano &> /tmp/results/inbound-tcpdump.stdout`,
        ),
        bg_cmd(
          node,
          `sudo timeout ${totalDelay + 5} tcpdump -U -n outbound -w /tmp/results/outbound.pcap --time-stamp-precision=nano &> /tmp/results/outbound-tcpdump.stdout`,
        ),
      ]);
    }

    async function runNode(node: Node) {
      await Promise.all([
        bg_cmd(
          node,
          "python3 /tmp/script.py server &> /tmp/results/server.stdout",
        ),
        bg_cmd(
          node,
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

    const withSiginTrap = async (
      f: () => Promise<void>,
      cleanup: () => Promise<void>,
    ) => {
      const wrappedCleanup = async () => {
        try {
          await cleanup();
        } catch (error) {
          c.log.error(["Error during cleanup:", error]);
        }
      };

      try {
        let onSigint: () => void;
        const sigintTrap = new Promise<never>((_, reject) => {
          onSigint = () => {
            c.log.warn("Received SIGINT (Ctrl+C). Starting cleanup...");
            reject(new Error("SIGINT"));
          };
        });
        process.on("SIGINT", onSigint!);
        await Promise.race([f(), sigintTrap]);
      } finally {
        await wrappedCleanup();
      }
    };

    const cleanup = async () => {
      await Promise.all(nodes.map((x) => x.cleanup()));
      c.info("Cleanup completed successfully.");
    };

    async function run() {
      await Promise.all(nodes.map((x) => x.expertStart()));
      await f(nodes);
    }

    await withSiginTrap(run, cleanup);
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
