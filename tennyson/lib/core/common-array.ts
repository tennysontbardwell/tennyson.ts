export const range = (a: number, b?: number) => {
  if (b === undefined) return Array.from({ length: a }, (_value, key) => key);
  return Array.from({ length: b - a }, (_value, key) => key + a);
};

export function toArray<T>(input: T[] | T): T[] {
  if (Array.isArray(input)) {
    return input; // It's already an array
  } else {
    return [input]; // Wrap the object in an array
  }
}

export function zip<T extends readonly (readonly unknown[])[]>(
  ...arrays: { [K in keyof T]: T[K] }
): { [K in keyof T]: T[K] extends (infer U)[] ? U : never }[] {
  const minLength = Math.min(...arrays.map((a) => a.length));

  return Array.from({ length: minLength }, (_, i) =>
    arrays.map((a) => a[i]),
  ) as { [K in keyof T]: T[K] extends (infer U)[] ? U : never }[];
}
