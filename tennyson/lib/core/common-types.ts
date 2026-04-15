export type NotFunction<T> = T extends Function ? never : T;

export type F1<In, Out> = (a: In) => Out;

export type Modify<T, R> = Omit<T, keyof R> & R;

export type KeyType = string | number | symbol;

declare const __brand: unique symbol;

type Brand<B> = { [__brand]: B };
export type Branded<T, B> = T & Brand<B>;
export type BrandedString<B> = Branded<string, B>;

// export type NonUndefined<T> = {
//   [K in keyof T]: Exclude<T[K], undefined>;
// };

// export type StripUndefined<T> = {
//   Partial<{ [K in keyof T]: Exclude<T[K], undefined> } >
//   [K in keyof T as undefined extends T[K] ? never : K]: T[K];
// };

export type StripUndefined<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & Partial<{
  [K in keyof T]: Exclude<T[K], undefined>;
}>;

export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};
