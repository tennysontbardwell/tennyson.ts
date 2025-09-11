import * as stream from "stream";
import * as readline from "readline";

export function concatStream(stream: stream.Readable) {
  var content = "";
  stream.on("data", function (buf) {
    content += buf.toString();
  });
  return new Promise((resolve) => stream.on("end", () => resolve(content)));
}

export const askQuestion = (query: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};
