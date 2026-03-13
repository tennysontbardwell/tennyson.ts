export function rndAlphNum(length: number) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const rnd = Array.from({ length }, (_) =>
    chars.charAt(Math.floor(Math.random() * chars.length)),
  );
  return rnd.join("");
}

export function getRandomElement<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}
