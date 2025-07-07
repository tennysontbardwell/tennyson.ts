// Fix module resolution for Electron
if (process.versions.electron) {
  console.log("ELECTRON SETUP");
  const Module = require('module');
  const path = require('path');

  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request: any, parent: any, isMain: any) {
    if (request.startsWith('tennyson/')) {
      const buildPath = path.join(__dirname, '..', '..', 'build');
      return originalResolveFilename.call(this, path.join(buildPath, request), parent, isMain);
    }
    return originalResolveFilename.call(this, request, parent, isMain);
  };
}

import * as yargs from "yargs";

import * as cli from "tennyson/lib/core/cli";
import * as common from "tennyson/lib/core/common";
import * as aicmd from "tennyson/lib/ai/cmd";
import * as infra_cmd from "tennyson/lib/infra/cmd";

async function askQuestion(query: string) {
  let readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

function simple(name: string, cmd: () => Promise<void>) {
  return {
    command: name,
    describe: "",
    handler: async (parsed: any) => {
      try {
        common.log.info("running " + name);
        await cmd();
      } catch (error) {
        common.log.fatal(error);
      }
    },
  };
}

async function electron() {
  // await common.passthru("zsh", ['-ic', 'find . | fzf']);
  const { app, BrowserWindow } = await import('electron');

  const createWindow = () => {
    const win = new BrowserWindow({ width: 800, height: 1500 });
    win.loadURL('https://google.com');
  }

  app.whenReady().then(() => {
    createWindow()
  })

}


async function quickdev() {
  // let aichat = await import("tennyson/lib/ai/aichat");
  // let exec = import("tennyson/lib/core/exec");
  // let host = import("tennyson/lib/infra/host");
  // let page = await aichat.webpage("https://www.rottentomatoes.com/")
  // let resp = await aichat.query({
  //   userText: "Read the TODO comment in /Users/tennyson/repos/tennysontbardwell/tennyson.ts/tennyson/lib/ai/aichat.ts and execute it. Write the results back to the file.",
  //   attachments: [],
  //   tools: [
  //     aichat.urlFetchTool,
  //     aichat.readFilesTool("/Users/tennyson/repos/tennysontbardwell/tennyson.ts/tennyson/lib/ai"),
  //     aichat.modifyFileTool("/Users/tennyson/repos/tennysontbardwell/tennyson.ts/tennyson/lib/ai")
  //   ],
  //   maxToolCalls: 3,
  // }, "/tmp/aitrace.json")
  // common.log.info(resp);
  let f = () => common.sleep(2000);
  await common.runInLimitedConcurrency([f, f, f, f, f], 5);
  common.log.info("done 1");
  await common.runInLimitedConcurrency([f, f, f, f, f], 1);
  common.log.info("done 2");
}

async function main() {
  await cli.execute([
    aicmd.cmd,
    infra_cmd.Devbox.cmd,
    cli.command("hometty", async () => {
      let hometty = await import("tennyson/app/scripts/hometty");
      await hometty.run();
    }),
    cli.command("api-run", async () => {
      let api = await import("tennyson/app/api");
      await api.run();
    }),
    cli.command("quickdev", () => quickdev()),
    cli.command("electron", () => electron()),
    cli.command("fleet-member", async () => {
      let fleet = await import("tennyson/lib/fleet");
      await fleet.Comms.becomeFleetMember();
    }),
  ]);
}

main().catch((error) =>
  common.log.error("error in comand parsing function", error)
);
