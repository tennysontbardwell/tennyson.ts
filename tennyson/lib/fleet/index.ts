import shellescape from "shell-escape";
import * as http from 'http';
import * as path from "path";
import * as uuid from 'uuid';
import * as os from "os";

import * as net_util from "tennyson/lib/core/net-util";
import * as ec2 from "tennyson/lib/infra/ec2";
import * as common from "tennyson/lib/core/common";
import * as exec from "tennyson/lib/core/exec";
import * as host from "tennyson/lib/infra/host";

export class Member {
  name: string;
  host: host.Host;

  constructor(name: string, host: host.Host) {
    this.name = name;
    this.host = host;
  }

  static async create(fleetname?: string, memberName?: string) {
    let memberName_ = (memberName === undefined)
      ? common.rndAlphNum(5) : memberName;
    let name = [
      "tmp-fleet",
      fleetname,
      "box",
      memberName_
    ].filter(x => x !== null).join("-");
    let host = await ec2.createNewSmall(name, { terminateOnShutdown: true });
    return new Member(name, host);
  }

  async destroy() {
    await ec2.purgeByName(this.name);
  }

  async setupTypescript() {
    for await (const repo of ["misc-projects", "tennyson.ts"]) {
      await this.sendGitRepo(
        path.join(os.homedir(), "repos/tennysontbardwell", repo),
        path.join("/home/admin/", repo)
      );
    }
    let su = exec.ExecHelpers.su(this.host.exec.bind(this.host), "root", false)
    let apt = new host.Apt(su);
    await apt.upgrade();
    await apt.install(["npm"]);
    await su("npm", ["install", "--global", "node", "yarn"]);
    await this.host.exec(
      "bash", ["-c", "cd tennyson.ts; yarn install; yarn run build"]);
    // await this.host.exec("bash",
    //   ["-c", "cd misc-projects/personal.ts; yarn install; yarn run build"]);
  }

  async becomeWorker() {
    const { localPort, process } = await this.host.sshTunnel(8080);
    common.log.info(`Tunnel Created on port ${localPort}`);
    const _fleetMemberProc = this.host.exec(
      "bash",
      ["-c",
        "cd tennyson.ts; yarn install; " +
        "yarn run run fleet-member > ~/stdout 2> ~/stderr"]);

    // Needed to ensure the tunnel & command is setup
    await common.sleep(10_000);
    return new Comms.Worker(this, localPort);
  }

  static async with(
    fn: (member: Member) => Promise<void>, fleetname?: string
  ) {
    let member = await Member.create(fleetname);
    try {
      await fn(member);
    } finally {
      await member.destroy()
    }
  }

  async sendGitRepo(localPath: string, remotePath: string) {
    const remoteTarPath = path.join("/tmp", common.rndAlphNum(10) + ".tar.gz");
    await common.withTempDir(async (dir) => {
      const tarPath = path.join(dir, "repo.tar.gz");
      await exec.sh(
        `cd ${shellescape([localPath])}; ` +
        `git archive --format=tar.gz -o ${shellescape([tarPath])} HEAD`
      );
      await this.host.scpTo(tarPath, remoteTarPath);
      await this.host.exec("mkdir", ["-p", remotePath]);
      await this.host.exec("tar", ["-xf", remoteTarPath, "-C", remotePath]);
    });
  }
}

export namespace Comms {
  interface GetCommand {
    kind: "getCommand",
    url: string
  }

  export type WorkerCommand = GetCommand

  interface GetReply {
    kind: "getReply",
    url: string,
    status: number,
    text: string
  }

  export type ReplyMessage = GetReply

  // function processMessage(msg: GetCommand): Promise<GetReply>;

  async function processMessage(msg: GetCommand): Promise<GetReply> {
    const response = await fetch(msg.url);
    const text = await response.text();
    return {
      kind: "getReply",
      url: msg.url,
      status: response.status,
      text
    }
  }

  export class Worker {
    member: Member;
    localPort: number;

    constructor(member: Member, localPort: number) {
      this.member = member;
      this.localPort = localPort;
    }

    async process(request: WorkerCommand): Promise<ReplyMessage> {
      try {
        const msg = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        };
        const url = `http://localhost:${this.localPort}`;
        // common.log.info({ url, msg });
        const response = await fetch(url, msg);
        return await net_util.responseJsonExn(response);
      } catch (error) {
        common.log.error({
          message: "Error while processing request",
          worker: this,
          request, error });
        throw error;
      }
    }
  }

  export function startServer(port: number = 8080): http.Server {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const msg: WorkerCommand = JSON.parse(body);
          const reply = await processMessage(msg);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(reply));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON or some other issue' }));
        }
      });
    });

    server.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
    return server;
  }

  export async function becomeFleetMember(): Promise<void> {
    const server = startServer();
    new Promise((resolve) => server.on("close", () => resolve(null)));
  }
}

export class Fleet {
  members: Member[];
  name: string;
  workers: Comms.Worker[] | undefined;

  constructor(name: string | null, members: Member[]) {
    this.name = (name === null) ? common.rndAlphNum(5) : name;
    this.members = members;
  }

  async runAll(fn: (member: Member) => Promise<void>) {
    return Promise.all(this.members.map(fn));
  }

  static async createWorkerFleet(size: number) {
    if (size > 50)
      throw new Error("too big of fleet, confirm")
    const name = common.rndAlphNum(5);
    const membersAsync = common.range(size)
      .map(async (i) => {
        await common.sleep(i * 500)
        return await Member.create(name)
      });
    const members = await Promise.all(membersAsync);
    const fleet = new Fleet(name, members);
    await fleet.runAll((member: Member) => member.setupTypescript());
    fleet.workers = await Promise.all(
      fleet.members.map(member => member.becomeWorker()));
    return fleet;
  }

  randomWorker = () => common.getRandomElement(this.workers!)!;

  process = (msg: Comms.WorkerCommand): Promise<Comms.ReplyMessage> =>
    this.randomWorker().process(msg);
}

export async function withFleet(size: number, f: (fleet: Fleet) => Promise<void>) {
  var fleet;
  try {
    fleet = await Fleet.createWorkerFleet(size);
    await f(fleet);
  } catch (error) {
    common.log.error({ msg: "Error during fleet execution", error });
    if (fleet !== undefined) {
      common.log.info("Initially fleet destruction");
      let destroying = fleet.members.map(member => member.destroy());
      await Promise.all(destroying);
    }
    throw error
  }
}
