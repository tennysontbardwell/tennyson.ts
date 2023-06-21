import { Readable } from "stream";

export function concatStream(stream: Readable) {
  var content = "";
  stream.on("data", function (buf) {
    content += buf.toString();
  });
  return new Promise((resolve) => stream.on("end", () => resolve(content)));
}
