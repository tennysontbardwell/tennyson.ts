import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import * as http from "http";
import * as fsSync from "fs";
import { pipeline } from "node:stream/promises";

import { Schema as S, Stream } from "effect";
import { Rpc } from "@effect/rpc";
import * as ws from "ws";

import { storageKey } from "./AuthPairing";

const authIsGood = (req: http.IncomingMessage) => {
  const cookies = req.headers.cookie?.split("; ").reduce(
    (acc, cookie) => {
      const [key, value] = cookie.split("=");
      acc[key] = value;
      return acc;
    },
    {} as Record<string, string>,
  );

  const token = cookies?.[storageKey];
  return token === process.env["HQ_TOKEN"];
};

function resJson(
  res: http.ServerResponse<http.IncomingMessage>,
  status: number,
  msg: any,
) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(msg));
}

export const run = (options: { mainScratchFile?: string }) => {
  const wss = new ws.WebSocketServer({ noServer: true });

  const server = http.createServer(async (req, res) => {
    const resJson_ = resJson.bind(null, res);
    if (!authIsGood(req)) {
      resJson_(401, { error: "Unauthorized" });
      return;
    }

    const urlpath = req.url?.replace(/\/+$/, "");

    const paths = {
      "/main-scratch-file": async () => {
        const path = options.mainScratchFile;
        if (!path)
          return resJson_(500, { message: "mainScratchFile path not found" });
        else if (!fsSync.existsSync(path))
          return resJson_(404, { message: "File not found" });
        else {
          try {
            res.writeHead(200, { "Content-Type": "application/json" });
            return await pipeline(fsSync.createReadStream(path), res);
          } catch (e: unknown) {
            c.error("Error while writing mainScratchFile", e);
          }
        }
      },
    } as Record<string, () => Promise<void>>;

    const resFn = urlpath ? paths[urlpath] : undefined;
    if (resFn) await resFn();
    else
      resJson_(404, {
        error: "Not found",
        message: "The path is not found",
        url: req.url,
      });
  });

  server.on("upgrade", (request, socket, head) => {
    c.info("upgrade wanted");
    if (request.url?.startsWith("/ws")) {
      if (!authIsGood(request)) {
        socket.write({ error: "Unauthorized" });
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  return server.listen(3000);
};
