import shellescape from "shell-escape";
import * as path from "path";
import * as uuid from 'uuid';

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
// async Fleet {

// }
