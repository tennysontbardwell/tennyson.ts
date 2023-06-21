import * as fzf from "src/lib/core/fzf";
import * as execlib from "src/lib/core/exec";
import * as common from "src/lib/core/common";
import * as path from "path";
import * as fs from "fs/promises";
import * as git from "src/lib/unixplus/git";

function cd(dir: string): fzf.FzfItem {
  dir = common.resolveHome(dir);
  const action = async () => {
    const outpath = process.env["BASH_EVAL_FILE"];
    if (typeof outpath === "string") {
      await execlib.ExecHelpers.putFile(execlib.exec, outpath, `cd ${dir}`);
    }
  };
  const preview = async () => {
    const files = await fs.readdir(dir);
    return files.map((x) => path.basename(x)).join("\n");
  };
  return { choice: dir, preview: preview, action: action };
}

function static_snippet(val: string, key?: string, preview?: string) {
  const choice = typeof key === "string" ? `${key} | ${val}` : val;
  preview = preview || val;
  const action = async () => execlib.exec("pbcopy", [], { stdin: val });
  return { choice: choice, preview: preview, action: action };
}

function sh_snippet(
  template: string,
  key?: string,
  preview?: fzf.LazyString
): fzf.FzfItem {
  const choice = typeof key === "string" ? `${key} | ${template}` : template;
  const runSnip = async () => execlib.sh(template).then((x) => x.stdout);
  const preview_ = preview || runSnip;
  const action = async () => {
    const val = await runSnip();
    execlib.exec("pbcopy", [], { stdin: val });
  };
  return { choice: choice, preview: preview_, action: action };
}

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
          await common.passthru("nvim", [path]);
        });
      return { choice: mod, preview: fetch, action: action };
    });
  };
  return fzf.lazySubtree(name, items, main_preview);
}

async function run() {
  const nop = async () => null;
  await fzf.richFzf([
    fzf.subtree("snippets", [
      sh_snippet('date +"%Y-%m-%d"', "datetime/today"),
      sh_snippet('date +"%Y-%m-%d %H:%M:%S"', "datetime/nnow"),
      sh_snippet('date +"%Y-%m-%d %H:%M"', "datetime/now"),
    ]),
    fzf.subtree("websites", [
      fzf.website("google.com"),
      fzf.website("old.reddit.com"),
      fzf.website("xkcd.com"),
      fzf.website("jsvine.github.io/visidata-cheat-sheet/en/"),
    ]),
    fzf.subtree("favorite files", [
      cd("~/projects/misc-projects"),
      cd("~/projects/dotfiles/zsh"),
    ]),
    py_docs("python-docs"),
    fzf.lazySubtree("repos", git.GithubRepo.fzfLocalRepos),
    fzf.subtree("commands", [
      fzf.command("node prompt", async () =>
        common.passthru("node", ["--enable-source-maps"])
      ),
    ]),
  ]);
}

if (require.main === module) {
  run();
}
