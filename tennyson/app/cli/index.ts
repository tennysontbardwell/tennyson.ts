import * as cli from "tennyson/lib/core/cli";
import * as common from "tennyson/lib/core/common";
import * as aicmd from "tennyson/lib/ai/cmd";
import * as infra_cmd from "tennyson/lib/infra/cmd";
import { jless, vdJson } from "tennyson/lib/core/common-node";

const c = common;

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

import { FileSystem } from "@effect/platform"
import { Stream, Effect, Option, Schema, Queue, Sink } from "effect"
import { NodeContext, NodeRuntime } from "@effect/platform-node"

async function quickdev() {
  const program = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = "/Users/tennyson/Desktop/test.txt"
    yield* fs.access(path, { writable: true })

    const encoder = new TextEncoder();
    const stream = Stream.make("1", "2").pipe(
      Stream.map(s => encoder.encode(s))
    )

    const sink = fs.sink(path)

    yield* Stream.run(stream, sink)

    const committed$ = Sink.zipLeft
    return {
    }
  })

  NodeRuntime.runMain(program.pipe(Effect.provide(NodeContext.layer)))

  common.log.info('test14')
  // const readline = await import('readline');
  // const rl = readline.createInterface({
  //   input: process.stdin,
  //   output: process.stdout,
  //   terminal: false
  // });

  // let urlTemplate: string;

  // rl.on('line', (line: string) => {
  //   if (urlTemplate === undefined) {
  //     urlTemplate = line;
  //     return
  //   }
  //   const encodedQuery = encodeURIComponent(line);
  //   const resultUrl = urlTemplate.replace('{query}', encodedQuery);
  //   console.log(resultUrl);
  // });

  // rl.on('close', () => {
  //   process.exit(0);
  // });
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
  cli.lazyGroup("scrape", async () => {
    const scraper = await import("tennyson/lib/web/scraper");
    return [
      cli.flagsCommand(
        "cssFetch",
        {
          url: { alias: 'u', type: 'string', required: true },
          cssSelector: { alias: 'q', type: 'string', required: true },
        },
        async (args) => {
          const cheerio = await import('cheerio')
          const doc = await cheerio.fromURL(args.url)
          c.info(doc.extract({
            results: [{
              selector: args.cssSelector,
              value: "outerHTML"
            }]
          }))
          // c.info(doc(args.cssSelector)[0])
          // c.info(doc(args.cssSelector).map(x => x.toString()))
          // await jless(doc(args.cssSelector).map(x => x.toString()))
          // const res1 = doc(args.cssSelector)
          // c.info(res1.toString())
          // const res = doc(args.cssSelector).find('li')
          // c.info(res.html())
          // c.info(doc(args.cssSelector).length)
          // // c.info(doc(args.cssSelector))
        }
      )
    ]
  }),
  cli.lazyGroup("wayback", async () => {
    const wb = await import("tennyson/lib/web/waybackmachine");
    return wb.cmds;
  }),
];
