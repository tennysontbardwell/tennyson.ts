export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export const add = (a: number, b: number) => a + b;

export const posMod = (a: number, b: number) => {
    const r = a % b;
    return r < 0 ? r + b : r;
  };

export function mean(values: number[]): number {
  return values.reduce(add, 0) / values.length;
}

export function stddev(values: number[], population = true): number {
  const avg = mean(values);
  const squareDiffs = values.map((v) => (v - avg) ** 2);
  const divisor = population ? values.length : values.length - 1;
  return Math.sqrt(squareDiffs.reduce(add, 0) / divisor);
}

const SI_PREFIXES = [
  { value: 1e30, symbol: "Q" }, // quetta
  { value: 1e27, symbol: "R" }, // ronna
  { value: 1e24, symbol: "Y" }, // yotta
  { value: 1e21, symbol: "Z" }, // zetta
  { value: 1e18, symbol: "E" }, // exa
  { value: 1e15, symbol: "P" }, // peta
  { value: 1e12, symbol: "T" }, // tera
  { value: 1e9, symbol: "G" }, // giga
  { value: 1e6, symbol: "M" }, // mega
  { value: 1e3, symbol: "k" }, // kilo
  { value: 1, symbol: "" },
  { value: 1e-3, symbol: "m" }, // milli
  { value: 1e-6, symbol: "μ" }, // micro
  { value: 1e-9, symbol: "n" }, // nano
  { value: 1e-12, symbol: "p" }, // pico
  { value: 1e-15, symbol: "f" }, // femto
  { value: 1e-18, symbol: "a" }, // atto
  { value: 1e-21, symbol: "z" }, // zepto
  { value: 1e-24, symbol: "y" }, // yocto
  { value: 1e-27, symbol: "r" }, // ronto
  { value: 1e-30, symbol: "q" }, // quecto
];

export function formatSI(
  value: number,
  decimals: number = 2,
  symbol?: string,
): string {
  if (value === 0) {
    if (symbol === undefined) return "0";
    else return `0 ${symbol}`;
  }
  if (!Number.isFinite(value)) {
    if (symbol === undefined) return String(value);
    else return `${String(value)} ${symbol}`;
  }

  const isNegative = value < 0;
  const absValue = Math.abs(value);

  // Find the appropriate SI prefix
  const prefix =
    SI_PREFIXES.find((p) => absValue >= p.value) ??
    SI_PREFIXES[SI_PREFIXES.length - 1];

  const scaled = absValue / prefix.value;
  const formatted = parseFloat(scaled.toFixed(decimals)).toString();

  return `${isNegative ? "-" : ""}${formatted}${prefix.symbol}${symbol ?? ""}`;
}
