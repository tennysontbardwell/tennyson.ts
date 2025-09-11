import * as common from "tennyson/lib/core/common";
import * as common_node from "tennyson/lib/core/common-node";
import * as process from "process";
import * as execlib from "tennyson/lib/core/exec";
import * as fzf from "tennyson/lib/core/fzf";
import * as readline from "readline";
import { default as urlparse } from "url-parse";
import * as fs from "fs/promises";
import * as os from "os";
import shellescape from "shell-escape";
import Path from "path";

export namespace GithubRepo {
  type t = {
    user: string;
    repo: string;
  };

  const repoPath = Path.join(os.homedir(), "repos");

  export function toURL(t: t) {
    return `https://github.com/${t.user}/${t.repo}`;
  }

  function toRepoURL(t: t, useSSH = false) {
    if (useSSH) {
      return `git@github.com:${t.user}/${t.repo}.git`;
    } else {
      return `https://github.com/${t.user}/${t.repo}.git`;
    }
  }

  export function ofURL(url: string): t {
    const components = urlparse(url).pathname.split("/");
    return { user: components[1], repo: components[2] };
  }

  export function localPath(t: t) {
    return Path.join(repoPath, t.user, t.repo);
  }

  export async function clone(t: t, useSSH = false) {
    await execlib.exec("mkdir", ["-p", localPath(t)]);
    return common_node.passthru("git", [
      "clone",
      toRepoURL(t, useSSH),
      localPath(t),
    ]);
  }

  export async function fzfLocalRepos() {
    const dirs: string[] = [];
    try {
      const level1 = await fs.readdir(repoPath);
      await Promise.all(
        level1.map(async (file) => {
          try {
            const level2 = await fs.readdir(Path.join(repoPath, file));
            level2.forEach((x) => dirs.push(Path.join(file, x)));
          } catch {}
          return null;
        }),
      );
    } catch {}
    const repos = dirs.map((dir) => fzf.cd(Path.join(repoPath, dir), dir));
    const commands = [
      {
        choice: "--clone",
        preview: "",
        action: async () => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          var answer: string = await new Promise((resolve) => {
            rl.question("Enter URL: ", resolve);
          });
          rl.close();
          // https://github.com/nodejs/node/issues/45213
          // only affects zsh widgets
          if (answer.startsWith("~") && answer.endsWith("~")) {
            answer = answer.slice(1, -1);
          }
          const t = ofURL(answer);
          const useSSH = t.user == process.env["GITHUB_USERNAME"];
          await clone(t, useSSH);
          await fzf.evalAfterExit(shellescape(["cd", localPath(t)]));
        },
      },
    ];
    return repos.concat(commands);
  }
}
