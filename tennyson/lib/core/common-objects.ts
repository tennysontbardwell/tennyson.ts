import type { KeyType, NonUndefined, StripUndefined } from "./common-types";

export function mapEntries<A, B, KIn extends KeyType, KOut extends KeyType>(
  obj: Record<KIn, A>,
  map: (v: [KIn, A]) => [KOut, B] | undefined,
): Record<KOut, B> {
  return Object.fromEntries(
    Object.entries(obj)
      .map((v: [string, unknown]) => map(v as [KIn, A]))
      .filter((x) => x !== undefined),
  ) as Record<KOut, B>;
}

export function mapValues<A, B, K extends KeyType>(
  obj: Record<K, A>,
  map: (v: A, k: K) => B | undefined,
): Record<K, B> {
  return mapEntries<A, B, K, K>(obj, ([k, v]) => {
    const v_ = map(v, k);
    return v_ !== undefined ? [k, v_] : undefined;
  });
}

export function stripUndefined<T extends Record<string, any>>(
  obj: T,
): NonUndefined<StripUndefined<T>> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined),
  ) as NonUndefined<StripUndefined<T>>;
}

export function groupByMulti<T>(lst: T[], keys: (elm: T) => string[]) {
  return lst.reduce(
    (accum, item) =>
      keys(item).reduce((accum, key) => {
        if (!accum[key]) accum[key] = [item];
        else accum[key].push(item);
        return accum;
      }, accum),
    {} as Record<string, T[]>,
  );
}

export function groupBy<T>(lst: T[], key: (elm: T) => string) {
  return lst.reduce(
    (accum, item) => {
      const key_ = key(item);
      if (!accum[key_]) accum[key_] = [item];
      else accum[key_].push(item);
      return accum;
    },
    {} as Record<string, T[]>,
  );
}

export function aListGroupBy<T>(
  lst: T[],
  key: (elm: T) => string,
): [string, T[]][] {
  const obj = groupBy(lst, key);
  return Object.keys(obj)
    .map((key) => [key, obj[key]] as [string, T[]])
    .sort(([a, _x], [b, _y]) => a.localeCompare(b));
}

export function aListGroupByMulti<T>(
  lst: T[],
  keys: (elm: T) => string[],
): [string, T[]][] {
  const obj = groupByMulti(lst, keys);
  return Object.keys(obj)
    .map((key) => [key, obj[key]] as [string, T[]])
    .sort(([a, _x], [b, _y]) => a.localeCompare(b));
}

export function objOfKeys<T, K extends string | number | symbol, D>(
  lst: readonly T[],
  data: (elm: T) => D,
  key: (elm: T) => K,
): Record<K, D> {
  return lst.reduce(
    (accum, item) => {
      accum[key(item)] = data(item);
      return accum;
    },
    {} as Record<K, D>,
  );
}

export function splitMap<K extends string | number | symbol, A, B>(
  array: A[],
  fn: (input: A) => [K, B],
): Record<K, B[]> {
  const res = {} as Record<K, B[]>;
  for (const item of array) {
    const [key, newItem] = fn(item);
    if (key in res) {
      res[key].push(newItem);
    } else {
      res[key] = [newItem];
    }
  }
  return res;
}

export function splitArray<K extends string | number | symbol, V>(
  array: V[],
  keyFn: (input: V) => K,
): Record<K, V[]> {
  return splitMap(array, (x) => [keyFn(x), x]);
}
