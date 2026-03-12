import * as cli from "tennyson/lib/core/cli";
import * as common from "tennyson/lib/core/common";
import * as aicmd from "tennyson/lib/ai/cmd";
import * as infra_cmd from "tennyson/lib/infra/cmd";
import * as unsorted from "tennyson/app/cli/unsorted";

const c = common;

async function electron() {
  // await common.passthru("zsh", ['-ic', 'find . | fzf']);
  const { app, BrowserWindow } = await import("electron");

  const createWindow = () => {
    const win = new BrowserWindow({ width: 800, height: 1500 });
    win.loadURL("https://google.com");
  };

  app.whenReady().then(() => {
    createWindow();
  });
}

async function quickdev() {
  const m = await import("./quickdev");
  m.quickdev();
}

export function cmds(
  options: {
    unsorted_cmds?: cli.Command[];
  } = {},
): cli.Command[] {
  return [
    aicmd.cmd,
    infra_cmd.Devbox.cmd,
    cli.lazyGroup("unsorted", async () => {
      return [...(await unsorted.cmds()), ...(options.unsorted_cmds ?? [])];
    }),
    cli.command("hometty-public", async () => {
      const hometty = await import("tennyson/lib/hometty/hometty");
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
      await fleetlib.Fleet.withFleet(2, async (fleet) => {
        common.log.info(
          await fleet.process({
            kind: "getCommand",
            url: "https://ipecho.net/plain",
          }),
        );
      });
    }),
    cli.command("ranger-fs", async () => {
      const ranger = await import("tennyson/app/ranger/index");
      const r = new ranger.Ranger(ranger.lsFiles);
      await r.run();
    }),
    cli.lazyGroup("scrape", async () => {
      const scraper = await import("tennyson/lib/web/scraper");
      return [
        cli.flagsCommand(
          "cssFetch",
          {
            url: { alias: "u", type: "string", required: true },
            cssSelector: { alias: "q", type: "string", required: true },
          },
          async (args) => {
            const cheerio = await import("cheerio");
            const net_util = await import("tennyson/lib/core/net-util");
            const res = await fetch(args.url);
            await net_util.checkResponseExn(res);
            const doc = cheerio.load(await res.text());
            c.info(
              doc.extract({
                results: [
                  {
                    selector: args.cssSelector,
                    value: "outerHTML",
                  },
                ],
              }),
            );
            // c.info(doc(args.cssSelector)[0])
            // c.info(doc(args.cssSelector).map(x => x.toString()))
            // await jless(doc(args.cssSelector).map(x => x.toString()))
            // const res1 = doc(args.cssSelector)
            // c.info(res1.toString())
            // const res = doc(args.cssSelector).find('li')
            // c.info(res.html())
            // c.info(doc(args.cssSelector).length)
            // // c.info(doc(args.cssSelector))
          },
        ),
      ];
    }),
    cli.lazyGroup("wayback", async () => {
      const wb = await import("tennyson/lib/web/waybackmachine");
      return wb.cmds;
    }),
    cli.lazyGroup("viewer", async () => {
      const cn = await import("tennyson/lib/core/common-node");
      const exec = await import("tennyson/lib/core/exec");
      const path = (await import("path")).default;
      const fs = await import("fs");
      const os = (await import("os")).default;
      const uuid = await import("uuid");

      return [
        cli.flagsCommand(
          "json [path]",
          {
            path: {
              type: "string",
            },
          },
          async (args) => {
            async function cmdInTmux(shCmd: string, pwd: string) {
              await exec.exec("tmux", [
                "new-window",
                "-c",
                pwd,
                "-t",
                "main",
                shCmd,
              ]);
              await exec.exec("osascript", [
                "-e",
                'tell application "iTerm" to activate',
              ]);
            }
            const view = async (f: string) =>
              cmdInTmux(`nvim ${c.shellescape(f)}`, "/");
            if (args.path === undefined) {
              const tempDir = path.join(os.tmpdir(), uuid.v4());
              await fs.promises.mkdir(tempDir);
              const f = path.join(tempDir, "input.json");

              const writeStream = fs.createWriteStream(f);

              const finished = new Promise<void>((resolve) => {
                writeStream.on("finish", () => {
                  resolve();
                });
              });
              writeStream.on("error", (err) => {
                throw err;
              });
              process.stdin.on("end", () => {
                writeStream.end();
              });

              process.stdin.pipe(writeStream);
              await finished;
              await view(f);
            } else {
              await view(args.path);
            }
          },
        ),
      ];
    }),
    cli.group("meta", [
      cli.lazyGroup("test", async () => {
        const effect_profile = await import(
          "tennyson/app/profile/effect-profile"
        );
        return [...effect_profile.cmds];
      }),
    ]),
  ];
}
