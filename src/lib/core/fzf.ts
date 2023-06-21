import * as common from "src/lib/core/common";
import * as execlib from "src/lib/core/exec";
import * as fs from "fs/promises";
import * as http from "http";
import process from "process";
import shellescape from "shell-escape";

export async function fzf(
  choices: Array<string>,
  preview: ((choice: string) => string) | ((choice: string) => Promise<string>),
  action: (choice: string) => Promise<any> = async (_) => null
) {
  const location = "fzf";
  // const location_ = await execlib.exec("/bin/zsh", ["-ic", "which fzf"]);
  // const location = location_.stdout.replace(/\n$/, '');
  const requestListener = async function (
    req: http.IncomingMessage,
    res: http.ServerResponse
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
      await execlib.ExecHelpers.putFile(execlib.exec, in_, choicesStr);
      const preview = `--preview 'curl --silent ${host}:${port} --data-raw {}'`;
      await common.passthru("/bin/bash", [
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
  const action = (choice: string) => {
    const action = choices_.get(choice)?.action || (async () => null);
    return action();
  };
  await fzf([...choices_.keys()], preview, action);
}

export function website(url: string, name?: string) {
  const choice = typeof name === "string" ? `${url} | ${name}` : url;
  return {
    choice: choice,
    preview: url,
    action: async () => execlib.sh(`open ${url}`),
  };
}

export function lazySubtree(
  name: string,
  items: () => Promise<Array<FzfItem>>,
  preview?: LazyString
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
  preview?: LazyString
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
    await fs.writeFile(p, cmd);
  }
}

export function cd(dir: string, display?: string) {
  const display_ = display === undefined ? dir : display;
  return {
    choice: display_,
    preview: dir,
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
