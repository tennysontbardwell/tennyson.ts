import shellescape from "shell-escape";
import Path from "path";
import * as common from "src/lib/core/common";
import { spawn } from "child_process";

export type ExecLike = (
  command: string,
  args: string[],
  options?: ExecOptions
) => Promise<{
  command: string;
  args: string[];
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}>;

export type ExecOptions = Partial<{
  stdin: string;
  acceptExitCode: (code: number | null) => boolean;
}>;

export class ExecHelpers {
  static async withTempDir<Output>(
    exec: ExecLike,
    f: (path: string) => Promise<Output>
  ) {
    const tmp = await exec("mktemp", ["-d"]);
    const path = tmp.stdout.trim();
    const res = await f(path);
    // TODO
    // await exec("rm", ["-rf", path])
    return res;
  }

  static map(
    exec: ExecLike,
    f: (command: string, args: string[]) => [string, string[]]
  ) {
    return (command: string, args: string[], options?: ExecOptions) => {
      const [newCmd, newArgs] = f(command, args);
      return exec(newCmd, newArgs, options);
    };
  }

  static log(exec: ExecLike) {
    return ExecHelpers.map(exec, (cmd, args) => {
      common.log.info({ cmd: cmd, args: args });
      return [cmd, args];
    });
  }

  static su(exec: ExecLike, user: string, login: Boolean) {
    if (login) {
      return ExecHelpers.map(exec, (cmd, args) => [
        "sudo",
        ["-u", user, "-i", cmd].concat(args),
      ]);
    } else {
      return ExecHelpers.map(exec, (cmd, args) => [
        "sudo",
        ["-u", user, cmd].concat(args),
      ]);
    }
  }

  static bashWrapForStdinPipe(exec: ExecLike) {
    // https://github.com/nodejs/node/issues/21941
    return this.map(exec, (cmd, args) => [
      "bash",
      ["-c", 'tee /dev/null | '+ shellescape([cmd].concat(args))],
    ]);
  }

  static async appendFile(exec: ExecLike, path: string, contents: string) {
    await exec("mkdir", ["-p", Path.dirname(path)]);
    await exec("bash", ["-c" , 'tee /dev/null >> ' + shellescape([path])], {
      stdin: contents,
    });
  }

  static async putFile(exec: ExecLike, path: string, contents: string) {
    await exec("mkdir", ["-p", Path.dirname(path)]);
    await exec("dd", ["of=" + path, "status=none"], {
      stdin: contents,
    });
  }

  static async putJson(exec: ExecLike, path: string, contents: any) {
    return ExecHelpers.putFile(exec, path, JSON.stringify(contents));
  }

  static async sh(exec: ExecLike, cmd: string) {
    return exec("bash", ["-c", cmd]);
  }
}

export async function readableToString(readable: NodeJS.ReadableStream) {
  var total = "";
  readable.on("data", (data) => (total += data));
  await new Promise((resolve) => readable.on("end", resolve));
  return total;
}

export async function exec(
  command: string,
  args: string[],
  options: ExecOptions = {}
) {
  common.log.debug("exec", { command, args, options });
  const ssh = spawn(command, args);
  const stdoutPromise = readableToString(ssh.stdout);
  const stderrPromise = readableToString(ssh.stderr);
  if (options.stdin) {
    ssh.stdin.write(options.stdin);
    ssh.stdin.destroy();
  }

  const exitResults: {
    code: number | null;
    signal: NodeJS.Signals | null;
  } = await new Promise((resolve) =>
    ssh.on("exit", (code, signal) => resolve({ code: code, signal: signal }))
  );

  const stdout= await stdoutPromise;
  const stderr= await stderrPromise;

  const results = {
    command,
    args,
    code: exitResults.code,
    signal: exitResults.signal,
    stdout,
    stderr,
  };
  const acceptExitCode =
    options.acceptExitCode == undefined
      ? (code: number | null) => code == 0
      : options.acceptExitCode;
  if (!acceptExitCode(results.code)) {
    throw { message: "exit code not allowed", results };
  }
  return results;
}

export const sh = (cmd: string) => ExecHelpers.sh(exec, cmd);

export async function appendFile(path: string, contents: string) {
  await exec("mkdir", ["-p", Path.dirname(path)]);
  await exec("touch", [path]);
  await exec("tee", ["-a", path], { stdin: contents });
}
