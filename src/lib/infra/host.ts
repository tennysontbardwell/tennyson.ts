import { spawn } from "child_process";
import Path from "path";
import process from "process";
import dns from "dns";

import shellescape from "shell-escape";
import axios from "axios";

import * as common from "src/lib/core/common";
import * as execlib from "src/lib/core/exec";

export class Apt {
  readonly exec: execlib.ExecLike;

  constructor(exec: execlib.ExecLike) {
    this.exec = exec;
  }

  async upgrade() {
    // "--allow-releaseinfo-change" needed b/c we're using an old deb version
    await this.exec("apt-get", ["update", "-y", "--allow-releaseinfo-change"]);
    await this.exec("apt-get", ["upgrade", "-y"]);
    return this;
  }

  async fullUpgrade() {
    await this.upgrade();
    await this.upgrade();
    return this;
  }

  async install(packages: string[]) {
    const command =
      "DEBIAN_FRONTEND=noninteractive " +
      shellescape(
        ["apt-get", "install", "-y", "-q", "--force-yes"].concat(packages)
      );
    await this.exec("bash", ["-c", command]);
  }

  async addKey(url: string) {
    const response = await axios.get(url);
    await this.exec("apt-key", ["add", "-"], { stdin: response.data });
  }
}

export class Host {
  readonly fqdn_: string;
  readonly user: string;

  constructor(fqdn_: string, user: string) {
    this.fqdn_ = fqdn_;
    this.user = user;
  }

  static ofLocalName(str: string, user: string = "root") {
    const full = ".node.nyc1.consul.tennysontbardwell.com";
    const short = ".node.consul.tennysontbardwell.com";
    const host = /([^\.]*)/;
    if (str.endsWith(full) || str.endsWith(short)) {
      const match = str.match(host);
      if (!match) {
        throw "bad regesx";
      }
      const node = match[1];
      return new Host(`${node}.node.nyc1.consul.tennysontbardwell.com`, user);
    } else {
      const node = str;
      return new Host(`${node}.node.nyc1.consul.tennysontbardwell.com`, user);
    }
  }

  async passthroughSsh() {
    common.log.info("Consider doing TERM=ansi");
    await common.passthru("ssh", [`${this.user}@${this.fqdn()}`]);
  }

  apt() {
    const exec = (command: string, args: string[]) => this.exec(command, args);
    return new Apt(exec);
  }

  hostname() {
    return this.fqdn_.split(".")[0];
  }

  fqdn() {
    return this.fqdn_;
  }

  fqdnNoDc() {
    return this.hostname() + '.node.consul.tennysontbardwell.com';
  }


  sshTarget() {
    return this.user + "@" + this.fqdn();
  }

  exec_() {
    const host_ = this;
    return (command: string, args: string[], options?: execlib.ExecOptions) =>
      host_.exec(command, args, options);
  }

  exec(command: string, args: string[], options: execlib.ExecOptions = {}) {
    const remoteCommand = shellescape([command].concat(args));
    const target = this.sshTarget();
    const sshArgs = [target, "/bin/bash", "-c", shellescape([remoteCommand])];
    return execlib.exec("ssh", sshArgs, options);
  }

  async withTempDir<Output>(f: (path: string) => Promise<Output>) {
    return execlib.ExecHelpers.withTempDir(this.exec.bind(this), f);
  }

  async checkDNS() {
    const fqdn_ = this.fqdn();
    const res = await dns.promises
      .lookup(fqdn_)
      .then(() => true)
      .catch(() => false);
    return res;
  }

  async waitOnDNS() {
    const host = this;
    const res = await common.retry(3000, 30, () => host.checkDNS());
    if (!res) {
      common.log.error("unable to find dns entry", host);
      throw { message: "unable to find dns entry", host };
    }
  }

  async execNoStderr(command: string, args: string[]) {
    const results = await this.exec(command, args);
    const { stderr, ...newResults } = results;
    if (stderr != "") {
      throw { message: "non empty stderr", results };
    }
    return newResults;
  }

  async putFile(path: string, contents: string) {
    return execlib.ExecHelpers.putFile(this.exec.bind(this), path, contents);
  }

  async putFileBase64(path: string, contents: string) {
    await this.exec("mkdir", ["-p", Path.dirname(path)]);
    await this.exec(
      "bash",
      ["-c", "base64 -d | dd status=none of=" + shellescape([path])],
      {
        stdin: contents,
      }
    );
  }
  async appendFile(path: string, contents: string) {
    await this.exec("mkdir", ["-p", Path.dirname(path)]);
    await this.exec("touch", [path]);
    await this.exec("tee", ["-a", path], { stdin: contents });
  }

  async learnHostKey() {
    await execlib.exec("bash", ["-c", "yes yes | ssh-keygen -R " + this.fqdn()], {
      acceptExitCode: (_code: number | null) => true,
    });
    const hostKey = await execlib.exec("bash", [
      "-c",
      "yes yes | ssh-keyscan -H " + this.fqdn(),
    ]);
    await execlib.appendFile(
      process.env["HOME"] + "/.ssh/known_hosts",
      hostKey.stdout
    );
  }
}
