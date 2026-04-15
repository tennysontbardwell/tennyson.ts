export const id: <T>(a: T) => T = (x: any) => x;

export const const_ =
  <T>(x: T) =>
  (_: any) =>
    x;

export function unreachable(x: never): never {
  throw new Error(`Unreachable: ${x}`);
}

export function ignore(x: any) {}

export async function ignoreAsync(x: any) {
  await x;
}

export const inc = (a: number) => a + 1;

type Unary<I, O> = (input: I) => O;

type PipeOutput<
  Input,
  Fns extends readonly Unary<any, any>[],
> = Fns extends readonly []
  ? Input
  : Fns extends readonly [Unary<infer A, infer B>, ...infer Rest]
    ? Input extends A
      ? PipeOutput<B, Extract<Rest, readonly Unary<any, any>[]>>
      : never
    : Input;

export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, fn1: (input: A) => B): B;
export function pipe<A, B, C>(
  value: A,
  fn1: (input: A) => B,
  fn2: (input: B) => C,
): C;
export function pipe<A, B, C, D>(
  value: A,
  fn1: (input: A) => B,
  fn2: (input: B) => C,
  fn3: (input: C) => D,
): D;
export function pipe<A, B, C, D, E>(
  value: A,
  fn1: (input: A) => B,
  fn2: (input: B) => C,
  fn3: (input: C) => D,
  fn4: (input: D) => E,
): E;
export function pipe<Input, Fns extends readonly Unary<any, any>[]>(
  input: Input,
  ...fns: Fns
): PipeOutput<Input, Fns> {
  return (fns as readonly Unary<any, any>[]).reduce(
    (acc, fn) => fn(acc),
    input,
  ) as any;
}

export const not = (val: boolean) => !val;

export function compose<A, B>(ab: (a: A) => B): (a: A) => B;
export function compose<A, B, C>(bc: (b: B) => C, ab: (a: A) => B): (a: A) => C;
export function compose<A, B, C, D>(
  cd: (c: C) => D,
  bc: (b: B) => C,
  ab: (a: A) => B,
): (a: A) => D;
export function compose<A, B, C, D, E>(
  de: (d: D) => E,
  cd: (c: C) => D,
  bc: (b: B) => C,
  ab: (a: A) => B,
): (a: A) => E;
export function compose(...fns: ((arg: any) => any)[]) {
  return (x: any) => fns.reduceRight((v, f) => f(v), x);
}
