import * as ec2 from "tennyson/lib/infra/ec2";
import * as common from "tennyson/lib/core/common";
const c = common;
import * as host from "tennyson/lib/infra/host";
import * as execlib from "tennyson/lib/core/exec";
import dns from "dns";
import * as path from "path";
import Papa from "papaparse";
import * as fs from "fs";
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
const fleetSize = 12;
const zones = (() => {
  const regions = ["us-east-1", "us-east-2", "us-west-2", "ap-east-1"] as const;
  const zones = ["a", "b", "c"] as const;
  const per = 1;
  return new Map(
    regions.flatMap((region) => zones.map((zone) => [{ region, zone }, per])),
  );
})();
const totalDelay = Math.ceil(iterations * fleetSize * (delay + jitterDelay));

// frame.number,frame.time,eth.src,eth.dst,ip.src,ip.dst,ip.proto,udp.payload,data
type CsvRow = {
  "frame.number": number;
  "frame.time": string;
  "eth.src": string;
  "eth.dst": string;
  "ip.src": string;
  "ip.dst": string;
  "ip.proto": string;
  "udp.payload": string | number | null;
};

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
    common.log.info(`Starting ${this.name}`);
    this.box = await ec2.createNewSmall(this.name, {
      additionalSecurityGroups: ["default"],
      ...(this.availabilityZone !== undefined
        ? {
            region: this.availabilityZone.region,
            availabityZone: this.availabilityZone,
          }
        : {}),
    });
  }

  async cleanup() {
    common.log.info(`Cleaning ${this.name}`);
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
      // common.log.info(`Node ${node.name} setup almost complete`);
      await Promise.all([
        bg_cmd(
          node,
          `sudo timeout ${totalDelay + 5} tcpdump -U -n inbound -w /tmp/results/inbound.pcap --time-stamp-precision=nano &> /tmp/results/inbound-tcpdump.stdout`,
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
    common.log.info("Fleet setup complete. Beginning Test");
    await Promise.all(this.nodes.map(runNode));
    common.log.info(`Waiting ${totalDelay + 15} seconds for completion`);
    await common.sleep((totalDelay + 15) * 1000);
    common.log.info("Test complete. Retrieving results");
    await Promise.all(this.nodes.map(finNode));
    common.log.info("Processing results");
    await this.processResults();
  }

  async processResults() {
    async function parseCsv(file: string) {
      const fields = [
        "frame.number",
        "frame.time_epoch",
        "frame.time_relative",
        "ip.src",
        "ip.dst",
        "data.data",
      ];
      const fields_args = fields.flatMap((x) => ["-e", x]).join(" ");
      const cmd = `tshark -r ${file} -T json ${fields_args} | jq -c '.[]'`;
      const res = await execlib.sh(`${cmd}`);
      return Papa.parse<CsvRow>(res.stdout, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      })
        .data.map((x) => {
          const payloadStr = x["udp.payload"]?.toString();
          if (payloadStr === undefined || payloadStr.length === 0) return null;
          else {
            const payload = util.parseHex(payloadStr);
            const allowlist = new Set(["resp", "ping", "pong"]);
            const words = payload.split(" ");
            if (allowlist.has(words[0]))
              return {
                ...x,
                cmd: words[0],
                host_id: words[1],
                host1: words[2],
                host2: words[3],
                host3: words[4],
                "udp.payload": payload,
              };
            else return null;
          }
        })
        .filter((x) => x !== null);
    }

    const results = await Promise.all(
      this.nodes.flatMap((node) =>
        ["inbound", "outbound"].map(async (dir) => {
          const file = path.resolve(
            this.directory,
            node.box!.hostname(),
            "results",
            dir + ".pcap",
          );
          const data = await parseCsv(file);
          return data.map((d) => ({
            ...d!,
            dir: dir,
          }));
        }),
      ),
    );
    const data = await Promise.all(results).then((x) => x.flat());
    await fs.promises.writeFile(
      path.resolve(this.directory, "results.json"),
      JSON.stringify(data),
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
          common.log.error(["Error during cleanup:", error]);
        }
      };

      try {
        let onSigint: () => void;
        const sigintTrap = new Promise<never>((_, reject) => {
          onSigint = () => {
            common.log.warn("Received SIGINT (Ctrl+C). Starting cleanup...");
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
      common.log.info("Cleanup completed successfully.");
    };

    async function run() {
      await Promise.all(nodes.map((x) => x.expertStart()));
      await f(nodes);
    }

    await withSiginTrap(run, cleanup);
  }
}

async function main() {
  common.log.info("main");
  let fleet = new Fleet(fleetSize, { availabilityZones: zones });
  await fleet.withLive(async () => {
    common.log.info("Fleet start-up complete");
    await fleet.runTest();
  });
  common.log.info("Cleaned up");
}

main().catch((error) => {
  common.log.error("error in main");
  common.log.error("error in main", error);
});
