import * as path from "path";
import shellescape from "shell-escape";
import * as fs from "fs/promises";

import * as fzf from "tennyson/lib/core/fzf";
import * as execlib from "tennyson/lib/core/exec";
import * as git from "tennyson/lib/unixplus/git";
import * as common from "tennyson/lib/core/common";
import * as common_node from "tennyson/lib/core/common-node";
import * as child_process from "child_process";

const c = common;

function py_docs(name: string) {
  var modules: Promise<string[]> | null = null;
  const fetchModules = async (): Promise<string[]> =>
    execlib
      .exec("python3", [
        "-c",
        'import json; print(json.dumps([x.key for x in __import__("pkg_resources").working_set]))',
      ])
      .then((res) => JSON.parse(res.stdout));
  const getModules = async () => {
    if (modules === null) {
      modules = fetchModules();
    }
    return modules;
  };
  const main_preview = async () => getModules().then((x) => x.join("\n"));
  const items = async () => {
    const mods = await getModules();
    return mods.map((mod) => {
      mod = mod.replace("-", "_");
      const fetch = async () =>
        execlib
          .exec("python3", ["-c", `import ${mod}; print(help(${mod}))`])
          .then((x) => x.stdout);
      const action = async () =>
        execlib.ExecHelpers.withTempDir(execlib.exec, async (dir) => {
          const docs = await fetch();
          const path = dir + "/doc.py";
          await execlib.ExecHelpers.putFile(execlib.exec, path, docs);
          await common_node.passthru("nvim", [path]);
        });
      return { choice: mod, preview: fetch, action: action };
    });
  };
  return fzf.lazySubtree(name, items, main_preview);
}

const nop = async () => null;

async function scripts(
  dir: string,
  glob_: string,
  prefix: string = "",
  preActionHook: (name: string) => Promise<void> = async (_) => {},
) {
  const glob = await require("glob");
  dir = common_node.resolveHome(dir);
  const scripts: Array<string> = glob.sync(path.join(dir, glob_));
  return scripts.map((name: string) => {
    const choice = path.relative(dir, name);
    const action = async () => {
      await preActionHook(name);
      const toType = shellescape([`${prefix}${name}`]);
      await fzf.evalAfterExit(`LBUFFER=\${LBUFFER}${toType}`);
    };
    const preview = () => fzf.displayPath(name);
    return { choice: choice, action: action, preview: preview };
  });
}

async function zshExec(cmd: string) {
  const ssh = child_process.spawn("zsh", ["-ic", cmd], { detached: true });
  const stdoutPromise = execlib.readableToString(ssh.stdout);
  const stderrPromise = execlib.readableToString(ssh.stderr);
  const code = await new Promise((resolve) =>
    ssh.on("exit", (code, signal) => resolve(code)),
  );
  const stdout = await stdoutPromise;
  const stderr = await stderrPromise;
  if (code != 0) {
    throw {
      msg: "Failed zsh exec",
      cmd: cmd,
      code: code,
      stdout: stdout,
      stderr: stderr,
    };
  }
  return stdout;
}

async function personalSnippets() {
  const contents = await fs.readFile(
    common_node.resolveHome("~/.config/tennyson/snippets.json"),
    { encoding: "utf-8" },
  );
  const snippets: string[][] = JSON.parse(contents);
  try {
    return snippets.map((elm) => fzf.static_snippet(elm[1], elm[0]));
  } catch (e) {
    return [];
  }
}

async function functions() {
  const funs = await zshExec("print -rl -- ${(k)aliases} ${(k)functions}");
  return funs.split("\n").map((choice) => {
    const action = () => fzf.evalAfterExit(`LBUFFER=\${LBUFFER}${choice}`);
    const preview = () => zshExec(shellescape(["which", choice]));
    return { choice: `[zsh] ${choice}`, preview: preview, action: action };
  });
}

function sops(name: string) {
  async function sopsFiles() {
    const glob = await require("glob");
    const dir = common_node.resolveHome("~/secrets/");
    const res = await glob.sync(path.join(dir, "*.json"));
    return res as string[];
  }

  async function preview(file: string) {
    const jqQuery =
      'del(.sops) | [paths(scalars) as $p  | ($p | join("->"))] | join("\n")';
    const res = await execlib.exec("jq", [jqQuery, file]);
    return res.stdout;
  }

  async function itemsFromFile(file: string): Promise<fzf.FzfItem[]> {
    const jqQuery =
      '[paths(scalars) as $p  | {key: ($p | join("->")), value: getpath($p)}]';

    const res = await execlib.exec("sops", ["decrypt", file]);
    const res2 = await execlib.exec("jq", [jqQuery], { stdin: res.stdout });
    const secrets: { key: string; value: string }[] = JSON.parse(res2.stdout);
    const fzfItems = secrets.map((secret) =>
      c.id({
        choice: secret.key,
        preview: "******",
        action: () => execlib.exec("pbcopy", [], { stdin: secret.value }),
      }),
    );
    return fzfItems;
  }

  async function items() {
    const files = await sopsFiles();
    return files.map((file) =>
      fzf.lazySubtree(file, () => itemsFromFile(file)),
    );
  }

  return fzf.lazySubtree(name, items);
}

interface HomettyOptions {
  additionalItems?: fzf.FzfItem[];
  additions?: {
    websites?: fzf.FzfItem[];
  };
}

export const hometty = (options: HomettyOptions = {}) =>
  [
    fzf.lazySubtree("snippets", async () => {
      const more = await personalSnippets();
      return [
        fzf.sh_snippet('date +"%Y-%m-%d"', "datetime/today"),
        fzf.sh_snippet('date +"%Y-%m-%d %H:%M:%S"', "datetime/nnow"),
        fzf.sh_snippet('date +"%Y-%m-%d %H:%M"', "datetime/now"),
      ].concat(more);
    }),
    fzf.subtree(
      "websites",
      [
        fzf.website("google.com"),
        fzf.website("old.reddit.com"),
        fzf.website("xkcd.com"),
        fzf.website("jsvine.github.io/visidata-cheat-sheet/en/"),
        fzf.website("lazamar.co.uk/nix-versions/"),
      ].concat(options.additions?.websites ?? []),
    ),
    fzf.subtree("ff | favorite files", [
      fzf.cd("~/repos/tennysontbardwell/misc-projects"),
      fzf.cd("~/projects/dotfiles/zsh"),
      fzf.cd("~/repos/tennysontbardwell/misc-projects/scripts"),
    ]),
    fzf.lazySubtree("ss | scripts", async () => {
      const bash = await scripts(
        "~/repos/tennysontbardwell/misc-projects/scripts",
        "**/*.{sh,py}",
        "",
        async (name: string) => {
          await execlib.exec("chmod", ["+x", name]);
        },
      );
      const publicBash = await scripts(
        "~/repos/tennysontbardwell/public/scripts",
        "**/*.{sh,py}",
        "",
        async (name: string) => {
          await execlib.exec("chmod", ["+x", name]);
        },
      );
      const ts = await scripts(
        "~/repos/tennysontbardwell/tennyson.ts/build/src/app/scripts/",
        "**/*.js",
        "~/repos/tennysontbardwell/tennyson.ts/run-script.sh ",
      );
      const funcs = await functions();
      const res = bash.concat(publicBash, ts, funcs);
      return res;
    }),
    py_docs("python-docs"),
    sops("sops-secrets"),
    fzf.lazySubtree("repos", git.GithubRepo.fzfLocalRepos),
    fzf.command("ranger-fs", async () => {
      const ranger = await import("tennyson/app/ranger/index");
      const r = new ranger.Ranger(ranger.lsFiles);
      await r.run();
    }),
    fzf.subtree("commands", [
      fzf.command("node prompt", async () =>
        common_node.passthru("node", ["--enable-source-maps"]),
      ),
    ]),
  ].concat(options?.additionalItems ?? []);

export async function run(options?: HomettyOptions) {
  await fzf.richFzf(hometty(options));
}
