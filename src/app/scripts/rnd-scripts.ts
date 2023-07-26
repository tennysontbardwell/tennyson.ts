import * as fzf from "src/lib/core/fzf";
import * as execlib from "src/lib/core/exec";
import * as path from "path";
import * as git from "src/lib/unixplus/git";
import * as fs from "fs/promises";
import * as common from "src/lib/core/common";

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

const nop = async () => null;

async function run() {
  await fzf.richFzf([
    fzf.subtree("snippets", [
      fzf.sh_snippet('date +"%Y-%m-%d"', "datetime/today"),
      fzf.sh_snippet('date +"%Y-%m-%d %H:%M:%S"', "datetime/nnow"),
      fzf.sh_snippet('date +"%Y-%m-%d %H:%M"', "datetime/now"),
    ]),
    fzf.subtree("websites", [
      fzf.website("google.com"),
      fzf.website("old.reddit.com"),
      fzf.website("xkcd.com"),
      fzf.website("jsvine.github.io/visidata-cheat-sheet/en/"),
    ]),
    fzf.subtree("ff | favorite files", [
      fzf.cd("~/projects/misc-projects"),
      fzf.cd("~/projects/dotfiles/zsh"),
      fzf.cd("~/projects/misc-projects/scripts"),
    ]),
    fzf.lazySubtree("ss | scripts", async () => {
      const glob: any = await require("glob");
      const dir = common.resolveHome("~/projects/misc-projects/scripts");
      const scripts: Array<string> = glob.sync(`${dir}/**/*.{sh,py}`);
      return scripts.map((name: string) => {
        const choice = path.relative(dir, name);
        const action = async () =>
          {
            await execlib.exec('chmod', ['+x', name]);
            await fzf.evalAfterExit("LBUFFER=${LBUFFER}".concat(name));
          }
        const preview = () => fzf.displayPath(name);
        return { choice: choice, action: action, preview: preview };
      });
    }),
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
