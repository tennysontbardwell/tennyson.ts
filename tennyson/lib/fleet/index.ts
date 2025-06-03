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

  static async create(fleetname?: string) {
    let name = [
      "tmp-fleet",
      fleetname,
      "box",
      common.rndAlphNum(5)
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
    await su("npm", ["install", "--global", "yarn"]);
    await this.host.exec("bash", ["-c", "cd tennyson.ts; yarn install; yarn run build"]);
    await this.host.exec("bash", ["-c", "cd misc-projects/personal.ts; yarn install; yarn run build"]);
  }

  async setupComms() {
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

  type WorkerCommand = GetCommand

  interface GetReply {
    kind: "getReply",
    url: string,
    status: number,
    contents: string
  }

  type ReplyMessage = GetReply

  // function processMessage(msg: GetCommand): Promise<GetReply>;

  async function processMessage(msg: GetCommand) {
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

    async process(msg: WorkerCommand): Promise<ReplyMessage> {
      const response = await fetch(`localhost:${this.localPort}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(msg)
      });
      return await net_util.responseJsonExn(response);
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

// async Fleet {

// }
