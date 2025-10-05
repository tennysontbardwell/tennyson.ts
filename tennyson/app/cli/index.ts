import * as cli from "tennyson/lib/core/cli";
import * as common from "tennyson/lib/core/common";
import * as aicmd from "tennyson/lib/ai/cmd";
import * as infra_cmd from "tennyson/lib/infra/cmd";
import { jless, vdJson } from "tennyson/lib/core/common-node";

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

export const cmds: cli.Command[] = [
  aicmd.cmd,
  infra_cmd.Devbox.cmd,
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
    new ranger.Ranger(ranger.lsFiles);
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
    const shellescape = (await import("shell-escape")).default;
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
            cmdInTmux(`nvim ${shellescape([f])}`, "/");
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
    cli.group("test", [
      cli.flagsCommand(
        "perf-effect-quit",
        {
          platform: {
            alias: "p",
            describe: "Imports Node Platform",
            type: "string",
            choices: ['bun', 'node'],
            // choices: ["node"],
            required: false,
          },
        },
        async (args) => {
          const platformBun_ = () => import("@effect/platform-bun")
          const platformNode_ = () => import("@effect/platform-node");
          const effect_ = () => import("effect");

          const target = args.platform as 'bun' | 'node' | undefined
          // const target = args.platform as "node" | undefined;

          if (target === undefined) {
            const effect = await effect_();

            effect.Effect.log("Hello World").pipe(effect.Effect.runSync);
          } else if (target === "node") {
            const [effect, platformNode] = await Promise.all([
              effect_(),
              platformNode_(),
            ]);

            effect.Effect.log("Hello World").pipe(
              effect.Effect.provide(platformNode.NodeContext.layer),
              platformNode.NodeRuntime.runMain(),
            );

            } else if (target === 'bun') {
              const [effect, platformBun] =
                await Promise.all([effect_(), platformBun_()])

              effect.Effect.log("Hello World").pipe(
                effect.Effect.provide(platformBun.BunContext.layer),
                platformBun.BunRuntime.runMain()
              )
          } else {
            c.unreachable(target);
          }
        },
      ),
    ]),
  ]),
];
