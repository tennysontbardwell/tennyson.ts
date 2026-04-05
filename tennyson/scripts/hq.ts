// hq.ts
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";

export async function main(args: string[]) {
  const HQ_TOKEN = randomBytes(20).toString("hex");
  const url = `http://localhost:2300/authpairing#token=${HQ_TOKEN}`;
  const run = (...args: string[]) =>
    spawn(args[0], args.slice(1), {
      stdio: "inherit",
      env: { ...process.env, HQ_TOKEN },
    });
  const openCmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  run("npx", "vite", "-c", "vite.config.ts", "--clearScreen", "false");
  run("yarn", "run", "run", "hq", "server", ...args);
  await setTimeout(1000);
  run(openCmd, url);
  await new Promise(() => {});
}

if (require.main === module) {
  main(process.argv.slice(2));
}
