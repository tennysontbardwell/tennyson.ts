import { spawn, type ChildProcess } from "node:child_process";
import { exit } from "node:process";
import { createInterface } from "node:readline";

export const fail = (msg: string) => {
  console.log(msg);
  exit(1);
};
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

const children = new Set<ChildProcess>();

function cleanup() {
  for (const child of children) {
    child.kill("SIGTERM");
  }
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(130); // 128 + SIGINT(2)
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(143); // 128 + SIGTERM(15)
});

export const run2 = (...args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const label = args.join(" ");
    console.log(`┌ ${label}`);

    const child = spawn(args[0], args.slice(1), {
      stdio: ["inherit", "pipe", "pipe"],
    });

    children.add(child);

    const stdout = createInterface({ input: child.stdout! });
    const stderr = createInterface({ input: child.stderr! });

    stdout.on("line", (line) => console.log(`│ ${line}`));
    // stderr.on("line", (line) => console.error(`│ ${RED}${line}${RESET}`));
    stderr.on("line", (line) => console.error(`+ ${line}`));

    // wait for readline to flush before printing the footer
    const stdoutDone = new Promise<void>((r) => stdout.on("close", r));
    const stderrDone = new Promise<void>((r) => stderr.on("close", r));

    child.on("error", (err) => {
      console.log(`└ ${RED}Error: ${err.message}${RESET}`);
      reject(err);
    });

    child.on("close", (code) => {
      Promise.all([stdoutDone, stderrDone]).then(() => {
        if (code === 0) {
          console.log(`└ Completed`);
          resolve();
        } else {
          console.log(`└ ${RED}Failed with code ${code}${RESET}`);
          reject(new Error(`${label} exited with code ${code}`));
        }
      });
    });
  });
export const run = (...args: string[]) => {
  const child = spawn(args[0], args.slice(1), {
    stdio: "inherit",
  });

  const promise = new Promise<void>((resolve, reject) => {
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${args[0]} exited with code ${code}`));
    });

    child.on("error", reject);
  });

  return { child, promise };
};

const argv = process.argv.slice(2);

export const commands = {
  build: async () => {
    await run2("tsc", "--build");
    await run2("tsup");
    await run2("vitest", "--run");
  },
  hq: async () => {
    const hq = await import("./hq");
    hq.main(argv.slice(1));
  },
  "test:autoupdate": async () => {
    run("vitest", "-u", ".auto.test.ts");
  },
  clean: async () => {
    fail("Not tested yet");
    // await run2("rm", "-rf", "build", "bin");
  },
  watch: async () => {
    run("tsc", "--watch", "--preserveWatchOutput");
    run("tsup", "--watch");
    run("vitest");
  },
};

export async function runCommand(
  commands: Record<string, () => Promise<void>>,
) {
  const argv = process.argv.slice(2);
  if (argv.length === 0) fail("Require task name");
  const cmd = commands[argv[0]];
  if (cmd === undefined) fail("Command not recognized");
  else return await cmd();
}

if (require.main === module) {
  runCommand(commands);
}
