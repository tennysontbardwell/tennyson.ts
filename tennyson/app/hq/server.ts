import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import * as http from "http";

import { Schema as S, Stream } from "effect";
import { Rpc } from "@effect/rpc";
import * as ws from "ws";

export const run = () => {
  const wss = new ws.WebSocketServer({ noServer: true });

  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/main-scratch-file")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          message: "success",
          url: req.url,
        }),
      );
    } else if (req.url?.startsWith("/echo")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "success",
            url: req.url,
          }),
        );
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Not found",
          message: "The path is not found",
          url: req.url,
        }),
      );
    }
  });

  server.on("upgrade", (request, socket, head) => {
    c.info("upgrade wanted");
    if (request.url?.startsWith("/ws")) {
      const auth = request.headers["authorization"];
      const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
      const allowed =
        token === "1234" &&
        ["localhost", "127.0.0.1"].includes(request.headers.origin ?? "");

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  return server.listen(3000);
};

Rpc.make("GetNumbers", {
  success: S.Number, // Succeed with a stream of users
  stream: true,
});

// // 3) bidirectional stream -> numbers (duplex)
// // Pseudo-API name: Rpc.DuplexRequest (you might see a different name in your version)
// export class BidiNumbers extends Rpc.DuplexRequest<BidiNumbers>()(
//   "BidiNumbers",
//   {
//     input: S.Number, // element schema coming from client
//     output: S.Number, // element schema sent by server
//     failure: S.Never,
//   },
// ) {}

// // Optional: a "service interface" type for clarity
// export interface DemoRpc {
//   getNumber: (_: GetNumber) => number;
//   streamStrings: (_: StreamStrings) => Stream.Stream<string>;
//   bidiNumbers: (_: Stream.Stream<number>) => Stream.Stream<number>;
// }
