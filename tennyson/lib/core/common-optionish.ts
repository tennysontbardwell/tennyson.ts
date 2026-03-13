export type Option<A> = { _tag: "None" } | { _tag: "Some"; value: A };

export namespace Option {
  export const none: Option<never> = { _tag: "None" };

  export function some<A>(value: A): Option<A> {
    return { _tag: "Some", value };
  }

  export function map<A, B>(fa: Option<A>, f: (a: A) => B): Option<B> {
    return fa._tag === "Some" ? some(f(fa.value)) : none;
  }

  export const ofUndefined = <T>(value: T | undefined) =>
    value === undefined ? none : some(value);

  export const match = <A, B>(
    match: { none: () => B; some: (value: A) => B },
    data: Option<A>,
  ) => (data._tag === "None" ? match.none() : match.some(data.value));
}

export function getOrDefault<T>(list: T[], index: number, defaultValue: T): T {
  if (index >= 0 && index < list.length) {
    return list[index];
  }
  return defaultValue;
}

export function notEmpty<TValue>(
  value: TValue | null | undefined,
): value is TValue {
  return value !== null && value !== undefined;
}
