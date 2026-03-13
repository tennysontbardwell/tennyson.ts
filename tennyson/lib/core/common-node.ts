import * as common from "tennyson/lib/core/common";
const c = common;

import * as os from "os";
import * as path_ from "path";
import { promises as fs } from "fs";
import * as fsSync from "fs";
import * as uuid from "uuid";

import * as stream from "stream";
import * as stream_chain from "stream-chain";
import * as stream_json from "stream-json";
import Assembler from "stream-json/Assembler.js";
import { finished } from "node:stream/promises";

import * as exec_ from "tennyson/lib/core/exec";
import * as process from "process";
export const exec = exec_;
export const path = path_;

export function resolveHome(path: string) {
  const filepath = path.split("/");
  if (filepath[0] === "~") {
    return [os.homedir()].concat(filepath.slice(1)).join("/");
  }
  return path;
}

export async function passthru(exe: string, args: string[]) {
  const child_process = await import("child_process");
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(exe, args, {
      stdio: "inherit",
    });
    const signals = {
      // SIGHUP: 1,
      SIGINT: 2,
      // SIGQUIT: 3,
      // SIGTERM: 15,
      // SIGUSR1: 10,
      // SIGUSR2: 12,
    };
    Object.entries(signals).every(([sig, num]) =>
      process.on(sig, () => child.kill(num)),
    );
    child.on("error", (error) => reject(error));
    child.on("close", (exitCode) => {
      // console.log("Exit code:", exitCode);
      // process.stdin.unpipe();
      resolve(exitCode);
    });
  });
}

export async function fsExists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

// https://kagi.com/assistant/92b7ca63-6a36-4458-9bd5-c9e53332c470
export async function parseBigJson<T = any>(filePath: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const pipeline = stream_chain.chain([
      fsSync.createReadStream(filePath, { encoding: "utf8" }),
      stream_json.parser(),
    ]);

    const asm = Assembler.connectTo(pipeline);
    asm.on("done", (asm) => resolve(asm.current as T));
  });
}

async function writeChunk(
  stream: stream.Writable,
  chunk: string,
): Promise<void> {
  // Attempt to write the chunk. If stream.write() returns false, the internal buffer is full.
  if (!stream.write(chunk, "utf8")) {
    // Wait for the 'drain' event before resolving the promise, allowing more data to be written.
    await new Promise<void>((resolve) => stream.once("drain", resolve));
  }
  // If stream.write() returns true, the chunk was accepted, and we can proceed.
}

// https://kagi.com/assistant/92b7ca63-6a36-4458-9bd5-c9e53332c470
export async function recursivelyWriteObjectToStream(
  data: any,
  stream: stream.Writable,
): Promise<void> {
  if (data === undefined) {
    // For standalone 'undefined' or if 'undefined' is explicitly passed.
    // JSON.stringify(undefined) returns undefined (no string output).
    // In a streaming context, writing "null" is a common way to represent it.
    await writeChunk(stream, "null");
    return;
  }
  if (data === null) {
    await writeChunk(stream, "null");
  } else if (typeof data === "string") {
    // Use JSON.stringify to ensure proper escaping and quoting of strings.
    await writeChunk(stream, JSON.stringify(data));
  } else if (typeof data === "number" || typeof data === "boolean") {
    await writeChunk(stream, String(data));
  } else if (Array.isArray(data)) {
    await writeChunk(stream, "[");
    for (let i = 0; i < data.length; i++) {
      if (i > 0) {
        await writeChunk(stream, ",");
      }
      // In JSON, 'undefined' in an array becomes 'null'.
      // Functions and Symbols in arrays also become 'null'.
      const element = data[i];
      if (
        element === undefined ||
        typeof element === "function" ||
        typeof element === "symbol"
      ) {
        await recursivelyWriteObjectToStream(null, stream);
      } else {
        await recursivelyWriteObjectToStream(element, stream);
      }
    }
    await writeChunk(stream, "]");
  } else if (typeof data === "object") {
    // Excludes null, which is handled above.
    await writeChunk(stream, "{");
    const keys = Object.keys(data);
    let firstPropertyWritten = false;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = (data as Record<string, any>)[key];

      // JSON.stringify omits keys with 'undefined', function, or symbol values.
      if (
        value !== undefined &&
        typeof value !== "function" &&
        typeof value !== "symbol"
      ) {
        if (firstPropertyWritten) {
          await writeChunk(stream, ",");
        }
        await writeChunk(stream, JSON.stringify(key)); // Keys are always strings in JSON.
        await writeChunk(stream, ":");
        await recursivelyWriteObjectToStream(value, stream);
        firstPropertyWritten = true;
      }
    }
    await writeChunk(stream, "}");
  } else {
    // This case handles types not explicitly covered, primarily top-level functions or symbols.
    // JSON.stringify would produce 'undefined' (no output) for these.
    // We write 'null' as a sensible default for a streaming context.
    await writeChunk(stream, "null");
  }
}

export async function writeBigJson(path: string, data: any) {
  const writeStream = fsSync.createWriteStream(path);
  await recursivelyWriteObjectToStream(data, writeStream);
  writeStream.end();
  await finished(writeStream);
}

export async function fsCacheResult<T extends NonNullable<any>>(
  path: string,
  f: () => Promise<T>,
): Promise<T> {
  if (await fsExists(path)) {
    return parseBigJson(path);
  } else {
    const res = await f();
    const writeStream = fsSync.createWriteStream(path);
    await recursivelyWriteObjectToStream(res, writeStream);
    return res;
  }
}

export function mkCachable<T extends NonNullable<any>>(
  path: string,
  f: () => Promise<T>,
) {
  return common.lazy(() => fsCacheResult(path, f));
}

export async function withTempDir<T>(f: (dir: string) => Promise<T>) {
  const tempDir = path.join(os.tmpdir(), uuid.v4());

  try {
    await fs.mkdir(tempDir);
    return await f(tempDir);
  } catch (error) {
    console.error("Error occurred:", error);
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true });
  }
}

export async function durableTempFile(filename: string) {
  const tempDir = path.join(os.tmpdir(), uuid.v4());
  await fs.mkdir(tempDir);
  return path.join(tempDir, filename);
}

export async function withTempFile<T>(
  filename: string,
  f: (file: string) => Promise<T>,
): Promise<T> {
  return await withTempDir(async (dir: string) => {
    const file = path.join(dir, filename);
    await fs.writeFile(file, "");
    return await f(file);
  });
}

async function dataExamineCommand(cmd: string, data: any) {
  await withTempDir(async (dir: string) => {
    const file = path.join(dir, "data.json");
    await writeBigJson(file, data);
    await passthru(cmd, [file]);
  });
}

export const jless = (data: any) => dataExamineCommand("jless", data);
export const nvim = (data: any) => dataExamineCommand("nvim", data);
export const vdJson = (data: any) => dataExamineCommand("vd", data);

export async function parseJsonFileToArray<T>(filePath: string): Promise<T[]> {
  const data = await fs.readFile(filePath, "utf-8");
  return data
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

export async function editorInput() {
  return await withTempFile("input.txt", async (f) => {
    await passthru(process.env["EDITOR"] ?? "vi", [f]);
    const content = (await fs.readFile(f)).toString();
    c.assert(content !== "" && content !== "\n");
    return content;
  });
}

export async function plotEchartCDN(options: any, extra?: string) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Plot</title>
    <style>
      html, body { height: 100%; margin: 0; }
      #chart { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="chart"></div>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
    <script>
      const options = ${JSON.stringify(options)};
      ${extra ?? ""};
      const el = document.getElementById("chart");
      const chart = echarts.init(el);
      chart.setOption(options);
      window.addEventListener("resize", () => chart.resize());
    </script>
  </body>
</html>
`;

  const filename = await durableTempFile("plot.html");
  await fs.writeFile(filename, html, "utf8");
  await exec.exec("open", [filename]);
  c.log.info("Wrote plot.html (open it in your browser).");
}

export const pathjoin = path.join;
