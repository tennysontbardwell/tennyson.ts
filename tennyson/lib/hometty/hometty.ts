import * as path from "path";
import shellescape from "shell-escape";
import * as fs from "fs/promises";

import * as fzf from "tennyson/lib/core/fzf";
import * as execlib from "tennyson/lib/core/exec";
import * as git from "tennyson/lib/unixplus/git";
import * as common from "tennyson/lib/core/common";
import * as common_node from "tennyson/lib/core/common-node";
import * as child_process from "child_process";
import * as wikidata from "tennyson/lib/random/wikidata";

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

export function vd(file: string, display?: string): fzf.FzfItem {
  const display_ = display ?? file;
  file = common_node.resolveHome(file);
  return {
    choice: display_,
    preview: () => fzf.displayPath(file),
    action: async () => common_node.passthru("vd", [file]),
  };
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
    websearch?: fzf.FzfItem[];
  };
}

export const hometty = (options: HomettyOptions = {}) => {
  const websites = [
    fzf.website("google.com"),
    fzf.website("google.com/maps"),
    fzf.website("old.reddit.com"),
    fzf.website("xkcd.com"),
    fzf.website("jsvine.github.io/visidata-cheat-sheet/en/"),
    fzf.website("lazamar.co.uk/nix-versions/"),
    fzf.website("query.wikidata.org/"),
    fzf.website("ucum.org/ucum", "Unified Code for Units of Measure"),
    fzf.website("www.worldatlas.com/"),
    fzf.website("www.allareacodes.com/"),
  ].concat(options.additions?.websites ?? []);

  const vdWikidata = (name: string, query: string) =>
    common.id({
      choice: name,
      preview: query,
      action: async () => wikidata.wikidataQueryAndView(query),
    });

  const datasets = [
    vd("~/repos/datasets/harmonized-system/data/harmonized-system.csv"),
    vd("~/repos/datasets/harmonized-system/data/sections.csv"),
    vd("~/repos/datasets/emojis/data/emojis.csv"),
    vd("~/repos/datasets/language-codes/data/language-codes-3b2.csv"),
    vd("~/repos/datasets/airport-codes/data/airport-codes.csv"),
    vd("~/repos/datasets/population/data/population.csv"),
    vd("~/repos/datasets/nasdaq-listings/data/nasdaq-listed-symbols.csv"),
    vd("~/repos/tennysontbardwell/public/ref/ascii.csv"),
    vd("~/repos/tennysontbardwell/public/ref/greek-alpha.csv"),
    vdWikidata("US ISO-3166-2 Codes", wikidata.US_ISO_3166_2_Codes),
    vdWikidata("ISO-3166-2 Codes", wikidata.ISO_3166_2_Codes),
    vdWikidata("ISO-3166-1 Codes", wikidata.ISO_3166_1_Codes),
    vdWikidata("ISO-9362 SWIFT/BIC Codes", wikidata.ISO_9362_SWIFT_BIC),
    vdWikidata("Telephone Country Code", wikidata.PHONE),
  ];

  const favFiles = [
    fzf.cd("~/repos/tennysontbardwell/misc-projects"),
    fzf.cd("~/projects/dotfiles/zsh"),
    fzf.cd("~/repos/tennysontbardwell/misc-projects/scripts"),
  ];

  const webSearch = [
    fzf.websearch("www.google.com/search?q={query}", "google"),
    fzf.websearch("www.google.com/maps/search/{query}", "google maps"),
    fzf.websearch(
      "web.archive.org/web/20250000000000*/{query}",
      "wb - wayback machine",
    ),
    fzf.websearch(
      "www.wolframalpha.com/input?i={query}",
      "wra | wolfram alpha",
    ),
    fzf.websearch("kagi.com/search?q={query}", "kagi"),
    fzf.websearch("wikipedia.org/w/index.php?search={query}", "wikipedia"),
    fzf.websearch("www.packagetrackr.com/track/{query}", "packagetrackr"),
    fzf.websearch("trakt.tv/search?query={query}", "trakt: media tracking"),
    fzf.websearch(
      "search.nixos.org/packages?query={query}",
      "nixos package search",
    ),
    fzf.websearch("www.wikidata.org/w/index.php?search={query}", "wikidata"),
    fzf.websearch(
      "www.matweb.com/search/QuickText.aspx?SearchText={query}",
      "material properties",
    ),
    fzf.websearch(
      "fdc.nal.usda.gov/food-search?query={query}",
      "FoodData Central",
    ),
    fzf.websearch(
      "webbook.nist.gov/cgi/cbook.cgi?Name={query}",
      "HIST Chemistry WebBook",
    ),
    fzf.websearch("howjsay.com/how-to-pronounce-{query}", "howjsay"),
    fzf.websearch("en.wiktionary.org/wiki/{query}"),
  ].concat(options.additions?.websearch ?? []);

  return [
    fzf.lazySubtree("snippets", async () => {
      const more = await personalSnippets();
      return [
        fzf.sh_snippet('date +"%Y-%m-%d"', "datetime/today"),
        fzf.sh_snippet('date +"%Y-%m-%d %H:%M:%S"', "datetime/nnow"),
        fzf.sh_snippet('date +"%Y-%m-%d %H:%M"', "datetime/now"),
      ].concat(more);
    }),
    fzf.subtree("websites", websites),
    fzf.subtree("web-search", webSearch),
    fzf.subtree("ff | favorite files", favFiles),
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
    fzf.subtree("datasets", datasets),
    ...(options?.additionalItems ?? []),
    ...websites,
    ...webSearch,
    ...favFiles,
  ];
};

export async function run(options?: HomettyOptions) {
  await fzf.richFzf(hometty(options));
}
