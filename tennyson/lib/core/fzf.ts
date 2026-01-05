import * as common from "tennyson/lib/core/common";
import * as common_node from "tennyson/lib/core/common-node";
import * as execlib from "tennyson/lib/core/exec";
import * as fs from "fs/promises";
import * as http from "http";
import * as path from "path";
import process from "process";
import shellescape from "shell-escape";

interface FzfMenu {
  choices: Array<string>;
  preview: ((choice: string) => string) | ((choice: string) => Promise<string>);
  action: (choice: string) => Promise<any>;
}

export async function fzf(menu: FzfMenu) {
  const { choices, preview, action } = menu;
  const location = "fzf";
  // const location_ = await execlib.exec("/bin/zsh", ["-ic", "which fzf"]);
  // const location = location_.stdout.replace(/\n$/, '');
  const requestListener = async function (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
    res.writeHead(200);
    const input = await execlib.readableToString(req);
    try {
      const output: string = await preview(input);
      res.end(output);
    } catch (e) {
      const j = JSON.stringify(e, null, 2);
      res.end(j);
    }
  };
  const server = http.createServer(requestListener);
  const host = "localhost";
  await new Promise((res) => server.listen(0, host, () => res(null)));
  const address = server.address();
  try {
    if (address === null || typeof address == "string") {
      throw "no port on server: " + address;
    }
    const port = address.port;
    await execlib.ExecHelpers.withTempDir(execlib.exec, async (path) => {
      const in_ = path + "/in";
      const out = path + "/out";

      const choicesStr = choices.map((x) => x.replace("\n", "\\n")).join("\n");
      await fs.writeFile(in_, choicesStr);
      const preview = `--preview 'curl --silent ${host}:${port} --data-raw {}'`;
      await common_node.passthru("/usr/bin/env", [
        "-S",
        "bash",
        "-c",
        `${location} ${preview} < ${in_} > ${out}`,
      ]);
      const data = await fs
        .readFile(out, { encoding: "utf8" })
        .then((x) => x.trim());
      if (data != "") {
        action(data);
      }
    });
  } finally {
    server.close();
  }
}

export type LazyString =
  | string
  | (() => string)
  | (() => Promise<string>)
  | (() => string | Promise<string>);

export async function evalLazy(val: LazyString) {
  return typeof val === "string" ? val : val();
}

export interface FzfItem {
  choice: string;
  preview: LazyString;
  action: () => Promise<any>;
}

export async function richFzf(choices: Array<FzfItem>) {
  const choices_ = new Map(choices.map((x) => [x.choice, x]));
  const preview = async (choice: string) => {
    var res = choices_.get(choice)?.preview || "";
    try {
      return evalLazy(res);
    } catch (e) {
      return "exception";
    }
  };
  const action = async (choice: string) => {
    const action = choices_.get(choice)?.action || (async () => null);
    try {
      return await action();
    } catch (e: any) {
      common.log.fatal(e);
      throw e;
    }
  };
  await fzf({ choices: [...choices_.keys()], preview, action });
}

export function website(url: string, name?: string): FzfItem {
  const choice = typeof name === "string" ? `${name} | ${url}` : url;
  return {
    choice: choice,
    preview: url,
    action: async () => execlib.sh(`open "https://${url}"`),
  };
}

// TODO websearch("https://www.google.com/search?q={query}", "google") causes a
// prompt to be shown via readline, the contents of that prompt gets http escaped,
// put into the url at {query} and then opened
export function websearch(
  urlWithQueryTemplate: string,
  name?: string,
): FzfItem {
  const choice =
    typeof name === "string"
      ? `${name} | ${urlWithQueryTemplate}`
      : urlWithQueryTemplate;
  return {
    choice: choice,
    preview: urlWithQueryTemplate,
    action: async () => {
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const query = await new Promise<string>((resolve) => {
        rl.question("Search query: ", (answer) => {
          rl.close();
          resolve(answer);
        });
      });

      const encodedQuery = encodeURIComponent(query);
      const url = urlWithQueryTemplate.replace("{query}", encodedQuery);
      await execlib.sh(`open "https://${url}"`);
    },
  };
}

export function lazySubtree(
  name: string,
  items: () => Promise<Array<FzfItem>>,
  preview?: LazyString,
) {
  // const items_ = common.cache(items);
  const items_ = items;
  async function defaultPreview() {
    const choices = await items_();
    return choices.map((x) => x.choice).join("\n") || "";
  }
  const preview_ = preview === undefined ? defaultPreview : preview;
  return {
    choice: name,
    preview: preview_,
    action: async () => {
      const choices = await items_();
      await richFzf(choices);
    },
  };
}

export function subtree(
  name: string,
  items: Array<FzfItem>,
  preview?: LazyString,
) {
  if (preview === undefined) {
    preview = items.map((x) => x.choice).join("\n") || "";
  }
  return {
    choice: name,
    preview: preview,
    action: async () => richFzf(items),
  };
}

export async function evalAfterExit(cmd: string) {
  const p = process.env["BASH_EVAL_FILE"];
  if (p !== undefined) {
    await fs.writeFile(p, `${cmd}\n`);
  }
}

export async function displayPath(path_: string): Promise<string> {
  const stats = await fs.stat(path_);
  if (stats.isFile()) {
    return fs.readFile(path_, { encoding: "utf8" });
  } else if (stats.isDirectory()) {
    return (await fs.readdir(path_)).join("\n");
  } else {
    return "not dir or file";
  }
}

export function cd(dir: string, display?: string): FzfItem {
  const display_ = display === undefined ? dir : display;
  dir = common_node.resolveHome(dir);
  return {
    choice: display_,
    preview: () => displayPath(dir),
    action: async () => evalAfterExit(shellescape(["cd", dir])),
  };
}

export function command(name: string, action: () => Promise<any>) {
  return {
    choice: name,
    preview: "",
    action: action,
  };
}

export function static_snippet(val: string, key?: string, preview?: string) {
  const choice = typeof key === "string" ? `${key} | ${val}` : val;
  preview = preview || val;
  const action = async () => execlib.exec("pbcopy", [], { stdin: val });
  return { choice: choice, preview: preview, action: action };
}

export function sh_snippet(
  template: string,
  key?: string,
  preview?: LazyString,
): FzfItem {
  const choice = typeof key === "string" ? `${key} | ${template}` : template;
  const runSnip = async () => execlib.sh(template).then((x) => x.stdout);
  const preview_ = preview || runSnip;
  const action = async () => {
    const val = await runSnip();
    execlib.exec("pbcopy", [], { stdin: val });
  };
  return { choice: choice, preview: preview_, action: action };
}
