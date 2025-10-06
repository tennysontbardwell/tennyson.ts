import * as ec2 from "tennyson/lib/infra/ec2";
import * as common from "tennyson/lib/core/common";
import * as host from "tennyson/lib/infra/host";
import * as execlib from "tennyson/lib/core/exec";
import dns from "dns";
import * as path from "path";
import Papa from "papaparse";
import * as fs from "fs";

const iterations = 10;
const jitterDelay = 0.01;
const delay = 0.1;
const fleetSize = 20;
const totalDelay = Math.ceil(iterations * fleetSize * (delay + jitterDelay));

const PYTHON_SCRIPT = `
#!/usr/bin/env python3
import json
import socket
import uuid
import sys
import time
import random

FLEET_FILE = '/tmp/fleet.json'
PORT = 8000

with open(FLEET_FILE, 'r') as f:
    fleet = json.load(f)
my_name = fleet['self']['name']
my_ip = fleet['self']['ip']

def send_udp_packet(host, message):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sent = sock.sendto(message.encode(), (host, PORT))
        print(f"Sent {sent} bytes")
    finally:
        sock.close()

ping_count = 0
def send_ping(host):
    global ping_count
    send_udp_packet(host, f'ping {ping_count} {my_ip} {host} null')
    ping_count += 1

ping_pong_count = 0
def send_ping_pong(h1, h2):
    global ping_pong_count
    send_udp_packet(h1, f'ping2 {ping_count} {my_ip} {h1} {h2}')
    ping_pong_count += 1

def receive_udp_packets():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", PORT))

    while True:
        data, address = sock.recvfrom(4096)
        cmd, id, host1, host2, host3 = data.decode().split(' ')
        if cmd == 'ping' and host3 == 'null':
            send_udp_packet(host1, f'resp {id} {host1} {host2} {host3}')
        if cmd == 'ping2' and host3 != 'null':
            send_udp_packet(host3, f'pong {id} {host1} {host2} {host3}')
        if cmd == 'pong':
            send_udp_packet(host1, f'resp {id} {host1} {host2} {host3}')
        print(f"Received one complete packet: {data.decode()}, From: {address}")

def ping_bot():
    time.sleep(5)
    others = [node for node in fleet['nodes'] if node['name'] != my_name]
    for _ in range(${iterations}):
        for node in others:
            host = node['ip']
            send_ping(host);
            time.sleep(${jitterDelay})
            send_ping(host);
            time.sleep(${jitterDelay})
            h1, h2 = random.sample(others, 2)
            send_ping_pong(h1['ip'], h2['ip']);
            time.sleep(${delay} - ${jitterDelay} * 2)

if __name__ == "__main__":
    if sys.argv[1] == "server":
        receive_udp_packets()
    elif sys.argv[1] == 'client':
        ping_bot()
`;

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

  constructor() {
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
    });
  }

  async cleanup() {
    common.log.info(`Cleaning ${this.name}`);
    await ec2.purgeByName(this.name);
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
  ips: Record<string, string>;
  directory: string;

  constructor(n: number) {
    this.nodes = Array.from({ length: n }, (_) => new Node());
    this.ips = {};
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

    const fleetFile = (node: Node) =>
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
      });

    const bg_cmd = (node: Node, cmd: string) =>
      // node.box!.exec("/bin/bash", ["-c", `nohup ${cmd} &`]);
      node.box!.exec("/usr/bin/env", ["-S", "bash", "-c", `nohup ${cmd} &`]);

    async function setupNode(node: Node) {
      // const apt = box!.apt();
      await node.box!.exec("mkdir", ["/tmp/results"]);
      await Promise.all([
        node.box!.putFile("/tmp/fleet.json", fleetFile(node)),
        node.box!.putFile("/tmp/script.py", PYTHON_SCRIPT),
        node.box!.exec("bash", ["-c", "sudo systemctl stop chrony"]),
        // apt?.upgrade().then(() => apt.install(["python3-websockets", "python3-aiottp"]))
      ]);
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
    function parseHex(hex: String) {
      try {
        const cleanedHex = hex.replace(/\s+/g, "").replace(/^0x/, "");
        const byteArray = new Uint8Array(
          cleanedHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
        );
        return new TextDecoder("utf-8").decode(byteArray);
      } catch (e) {
        common.log.error({ message: "error parsing hex", hex: hex });
        throw e;
      }
    }

    async function parseCsv(file: string) {
      const cmd = `tshark -r ${file} -T fields -e frame.number -e frame.time -e eth.src -e eth.dst -e ip.src -e ip.dst -e ip.proto -e udp.payload -E header=y -E separator=, -E quote=d -E occurrence=f`;
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
            const payload = parseHex(payloadStr);
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
    process.on("SIGINT", async () => {
      common.log.warn("Received SIGINT (Ctrl+C). Starting cleanup...");
      try {
        await Promise.all(nodes.map((x) => x.cleanup()));
        common.log.info("Cleanup completed successfully.");
      } catch (error) {
        common.log.error(["Error during cleanup:", error]);
      } finally {
        process.exit(0);
      }
    });
    async function run() {
      await Promise.all(nodes.map((x) => x.expertStart()));
      await f(nodes);
    }
    await run().finally(() => Promise.all(nodes.map((x) => x.cleanup())));
  }
}

async function main() {
  common.log.info("main");
  let fleet = new Fleet(fleetSize);
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
