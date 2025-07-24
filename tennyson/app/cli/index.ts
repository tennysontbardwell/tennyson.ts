import * as cli from "tennyson/lib/core/cli";
import * as common from "tennyson/lib/core/common";
import * as aicmd from "tennyson/lib/ai/cmd";
import * as infra_cmd from "tennyson/lib/infra/cmd";
import { jless, vdJson } from "tennyson/lib/core/common-node";

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
}

export const cmds: cli.Command[] = [
  aicmd.cmd,
  infra_cmd.Devbox.cmd,
  cli.command("hometty", async () => {
    const hometty = await import("tennyson/app/scripts/hometty");
    await hometty.run();
  }),
  cli.command("api-run", async () => {
    const api = await import("tennyson/app/api");
    await api.run();
  }),
  cli.command("quickdev", () => quickdev()),
  cli.command("electron", () => electron()),
  cli.command("fleet-member", async () => {
    const fleet = await import("tennyson/lib/fleet");
    await fleet.Comms.becomeFleetMember();
  }),
  cli.command("fleet-test", async () => {
    const fleetlib = await import("tennyson/lib/fleet");
    await fleetlib.Fleet.withFleet(2, async fleet => {
      common.log.info(await fleet.process({
        kind: "getCommand",
        url: "https://ipecho.net/plain"
      }));
    });
  }),
  cli.command("ranger-fs", async () => {
    const ranger = await import("tennyson/app/ranger/index");
    new ranger.Ranger(ranger.lsFiles);
  }),
  cli.lazyGroup("wayback", async () => {
    const wb = await import("tennyson/lib/web/waybackmachine");
    return wb.cmds;
  }),
];
