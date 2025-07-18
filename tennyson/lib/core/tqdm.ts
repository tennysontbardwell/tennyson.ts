/* =============================================================================

    Tsqdm.

    A TQDM-style progress bar for TypeScript and Deno.

    https://github.com/thesephist/tsqdm

============================================================================= */

type RenderBarOptions = {
  i: number;
  label?: string;
  size?: number;
  width: number;
  elapsed: number;
};

export type TqdmOptions = {
  label?: string;
  size?: number;
  width?: number;
};

const markers = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];
const filledMarker = markers.at(-1);

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  } else if (seconds < 3600) {
    return `${(seconds / 60).toFixed(2)}m`;
  } else {
    return `${(seconds / 3600).toFixed(2)}h`;
  }
}

// Update renderBarWithSize function
function renderBarWithSize({
  i,
  label,
  size,
  width,
  elapsed,
}: RenderBarOptions & { size: number }): string {
  const n = Math.max((i * 8 * width) / size, 0);
  const whole = Math.floor(n / 8);
  const rem = Math.round(n % 8);
  const bar = new Array(whole).fill(filledMarker).join("") + markers[rem];
  const gap = new Array(width - bar.length).fill(" ").join("");
  const rate = i / elapsed;
  const remaining = (size - i) / rate;
  const percent = (i / size) * 100;
  const graph = `${label ? label + ": " : ""}${percent.toFixed(
    1,
  )}% |${bar}${gap}| ${i}/${size} | ${formatTime(elapsed)}>${formatTime(remaining)} ${rate.toFixed(2)}it/s`;
  if (graph === "" && n > 0) {
    return "▏";
  }
  return graph;
}

// Update renderBarWithoutSize function
function renderBarWithoutSize({
  i,
  label,
  elapsed,
}: Omit<RenderBarOptions, "size">): string {
  const rate = i / elapsed;
  const graph = `${label ? label + ": " : ""}${i} | ${formatTime(elapsed)} ${rate.toFixed(2)}it/s`;
  if (graph === "" && i > 0) {
    return "▏";
  }
  return graph;
}

/**
 * TQDM bar rendering logic extracted out for easy testing and modularity.
 * Renders the full bar string given all necessary inputs.
 */
function renderBar({ size, ...options }: RenderBarOptions): string {
  if (size === undefined) {
    return renderBarWithoutSize({ ...options });
  }
  return renderBarWithSize({ size, ...options });
}

function* arrayToIterableIterator<T>(iter: T[]): IterableIterator<T> {
  yield* iter;
}

function isIterableIterator<T>(
  value: IterableIterator<T> | AsyncIterableIterator<T>,
): value is IterableIterator<T> {
  return (
    value != null &&
    typeof (value as IterableIterator<T>)[Symbol.iterator] === "function" &&
    typeof value.next === "function"
  );
}

async function* toAsyncIterableIterator<T>(
  iter: IterableIterator<T>,
): AsyncIterableIterator<T> {
  for (const it of iter) {
    yield it;
  }
}

function unreachable(x: never): never {
  throw new Error(`Unreachable: ${x}`);
}

class Writer {
  private runtime: "deno" | "node";
  private encoder = new globalThis.TextEncoder();

  constructor() {
    if ((globalThis as any).Deno) {
      this.runtime = "deno";
    } else if ((globalThis as any).process) {
      this.runtime = "node";
    } else {
      throw new Error("Unsupported runtime");
    }
  }

  async write(s: string): Promise<void> {
    if (this.runtime === "deno") {
      await (globalThis as any).Deno.stdout.write(this.encoder.encode(s));
    } else if (this.runtime === "node") {
      await (globalThis as any).process.stdout.write(s);
    } else {
      unreachable(this.runtime);
    }
  }
}

/**
 * A TQDM progress bar for an arbitrary `AsyncIterableIterator<T>`.
 *
 * Note that unlike in Python, here we need to manually specify the total size
 * of the iterable.
 */
export async function* tqdm<T>(
  iter: Array<T> | IterableIterator<T> | AsyncIterableIterator<T>,
  { label, size, width = 16 }: TqdmOptions = {},
): AsyncIterableIterator<T> {
  if (Array.isArray(iter)) {
    size = iter.length;
    iter = arrayToIterableIterator(iter);
  }
  if (isIterableIterator(iter)) {
    iter = toAsyncIterableIterator(iter);
  }

  const start = Date.now();
  const writer = new Writer();
  let i = 1;
  for await (const it of iter) {
    yield it;
    const elapsed = (Date.now() - start) / 1000;
    await writer.write(
      renderBar({ i, label, size, width, elapsed }) + "\x1b[1G",
    );
    i++;
  }
  void writer.write("\n");
}
