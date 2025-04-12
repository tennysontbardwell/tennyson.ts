import * as ec2 from "src/lib/infra/ec2";
import * as common from "src/lib/core/common";
import * as host from "src/lib/infra/host";
import * as execlib from "src/lib/core/exec";
import { Dictionary } from "async";
import dns from "dns";

const PYTHON_SCRIPT = `
#!/usr/bin/env python3
import json
import socket
import uuid
import sys
import time

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

def send_ping(host):
    send_udp_packet(host, f'ping {my_ip} {uuid.uuid4()}')

def send_resp(host, id):
    send_udp_packet(host, f'resp \${my_ip} {id}')

def receive_udp_packets():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((my_ip, PORT))

    while True:
        data, address = sock.recvfrom(4096)
        cmd, sender, id = data.decode().split(' ')
        if cmd == 'ping':
            send_resp(sender, id)
        print(f"Received one complete packet: {data.decode()}, From: {address}")

def ping_bot():
    time.sleep(5)
    for _ in range(20):
        for node in fleet['nodes']:
            host = node['hostname']
            if my_name == node['name']:
                continue
            send_ping(host);
            time.sleep(0.01)
            send_ping(host);
            time.sleep(0.1)

if __name__ == "__main__":
    if sys.argv[1] == "server":
        receive_udp_packets()
    elif sys.argv[1] == 'client':
        ping_bot()
`

class Node {
  readonly name: string;
  box: host.Host | undefined;

  constructor() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let rnd = Array.from({ length: 5 }, _ => chars.charAt(Math.floor(Math.random() * chars.length)));
    this.name = "temp-box-" + rnd.join("");
  }

  async expertStart() {
    common.log.info(`Starting ${this.name}`);
    this.box = await ec2.createNewSmall(this.name)
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
  ips: Dictionary<String>;

  constructor(n: number) {
    this.nodes = Array.from({ length: n }, _ => new Node());
    this.ips = {};
  }

  async fetchIps() {
    await Promise.all(this.nodes.map(async node => {
      const res = await dns.promises.lookup(node.box!.fqdn());
      this.ips[node.name] = res.address;
    }))
  }

  async runTest() {
    const fleetFile = (node: Node) =>
      JSON.stringify({
        nodes: this.nodes.map(node => ({
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
      node.box!.exec("/bin/bash", ["-c", `nohup ${cmd} &`]);

    async function setupNode(node: Node) {
      // const apt = box!.apt();
      await node.box!.exec("mkdir", ["/tmp/results"]);
      await Promise.all([
        node.box!.putFile("/tmp/fleet.json", fleetFile(node)),
        node.box!.putFile("/tmp/script.py", PYTHON_SCRIPT),
        bg_cmd(node, 'sudo timeout 30 tcpdump -U -w /tmp/results/tcpdump.pcap --time-stamp-precision=nano &> /tmp/results/tcpdump.stdout'),
        // apt?.upgrade().then(() => apt.install(["python3-websockets", "python3-aiottp"]))
      ]);
    }

    async function runNode(node: Node) {
      await Promise.all([
        bg_cmd(node, 'python3 /tmp/script.py server &> /tmp/results/server.stdout'),
        bg_cmd(node, 'python3 /tmp/script.py client &> /tmp/results/client.stdout'),
      ]);
    }

    async function finNode(node: Node) {
      const dir = `/tmp/fleet-results/${node.box!.hostname()}/`;
      await execlib.exec("mkdir", ["-p", dir]);
      await execlib.exec("scp", ['-r', `${node.box!.user}@${node.box!.fqdn()}:/tmp/results`, dir]);
    }

    await Promise.all(this.nodes.map(setupNode));
    common.log.info("Fleet setup complete. Beginning Test");
    await Promise.all(this.nodes.map(runNode));
    await common.sleep(45000);
    common.log.info("Test complete. Retrieving results")
    await Promise.all(this.nodes.map(finNode));
  }

  async withLive(f: (nodes: Node[]) => Promise<void>) {
    const nodes = this.nodes;
    process.on('SIGINT', async () => {
      common.log.warn('Received SIGINT (Ctrl+C). Starting cleanup...');
      try {
        await Promise.all(nodes.map(x => x.cleanup()));
        common.log.info('Cleanup completed successfully.');
      } catch (error) {
        common.log.error(['Error during cleanup:', error]);
      } finally {
        process.exit(0);
      }
    });
    async function run() {
      await Promise.all(nodes.map(x => x.expertStart()));
      await f(nodes);
    }
    await run().finally(() => Promise.all(nodes.map(x => x.cleanup())))
  }
}

async function main() {
  common.log.info("main");
  let fleet = new Fleet(2);
  await fleet.withLive(async () => {
    common.log.info("Fleet start-up complete")
    await fleet.runTest();
    // await sleep(60000);
    // common.log.info("Done sleeping")
  });
  common.log.info("Cleaned up");
}

main().catch((error) => {
  common.log.error("error in main");
  common.Log.error(["error in main", error]);
  common.log.error("error in main", error);
});

