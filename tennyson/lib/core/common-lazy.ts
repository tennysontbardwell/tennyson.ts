import stableStringify from "json-stable-stringify";

export class LazyMap<K, V> {
  private cache = new Map<K, V>();

  constructor(private generator: (key: K) => V) {}

  get(key: K): V {
    if (!this.cache.has(key)) {
      const value = this.generator(key);
      this.cache.set(key, value);
    }
    return this.cache.get(key)!;
  }
}

export function lazyGet<K, V>(map: Map<K, V>, key: K, get: () => V) {
  if (!map.has(key)) {
    const value = get();
    map.set(key, value);
  }
  return map.get(key)!;
}

export function lazyGetObj<O extends Object, K extends keyof O>(
  obj: Partial<O>,
  key: K,
  get: () => O[K],
): O[K] {
  if (!(key in obj)) obj[key] = get();
  return obj[key]!;
}

export function memo<T, R>(fn: (arg: T) => R): (arg: T) => R {
  const cache = new Map<string, R>();
  return (arg: T): R => lazyGet(cache, stableStringify(arg), () => fn(arg));
}

export function cache<T>(fun: () => T): () => T {
  var res: null | ["set", T] = null;
  return () => {
    if (res === null) {
      res = ["set", fun()];
    }
    return res[1];
  };
}

export function lazy<T extends NonNullable<any>>(f: () => Promise<T>) {
  return {
    data: null as null | Promise<T>,
    get() {
      if (this.data === null) {
        this.data = f();
      }
      return this.data;
    },
  };
}
