const lookup = {
  B: Math.pow(1000, 0),
  KB: Math.pow(1000, 1),
  MB: Math.pow(1000, 2),
  GB: Math.pow(1000, 3),
  TB: Math.pow(1000, 4),
  PB: Math.pow(1000, 5),
  KiB: Math.pow(1024, 1),
  MiB: Math.pow(1024, 2),
  GiB: Math.pow(1024, 3),
  TiB: Math.pow(1024, 4),
  PiB: Math.pow(1024, 5),
};
export class Memory {
  readonly #bytes: number;

  constructor(bytes: number) {
    this.#bytes = bytes;
  }

  static parse(str: string) {
    const fail = () => {
      throw {
        message: "Memory constructed with invalid input.",
        input: str,
      };
    };
    const parts = str.split(" ");
    if (parts.length != 2) {
      fail();
    }
    const num = parseInt(parts[0]);
    const unit = parts[1];

    function getProperty<T, K extends keyof T>(o: T, propertyName: K): T[K] {
      return o[propertyName]; // o[propertyName] is of type T[K]
    }

    if (!(unit in lookup)) {
      fail();
    }
    const multiplier = lookup[unit as keyof typeof lookup];
    return new Memory(num * multiplier);
  }

  static ofBytes(bytes: number) {
    return new Memory(bytes);
  }

  static ofKB(num: number) {
    return new Memory(num * lookup.KB);
  }
  static ofMB(num: number) {
    return new Memory(num * lookup.MB);
  }
  static ofGB(num: number) {
    return new Memory(num * lookup.GB);
  }
  static ofTB(num: number) {
    return new Memory(num * lookup.TB);
  }
  static ofPB(num: number) {
    return new Memory(num * lookup.PB);
  }
  static ofKiB(num: number) {
    return new Memory(num * lookup.KiB);
  }
  static ofMiB(num: number) {
    return new Memory(num * lookup.MiB);
  }
  static ofGiB(num: number) {
    return new Memory(num * lookup.GiB);
  }
  static ofTiB(num: number) {
    return new Memory(num * lookup.TiB);
  }
  static ofPiB(num: number) {
    return new Memory(num * lookup.PiB);
  }

  toKB() {
    return this.#bytes / lookup.KB;
  }
  toMB() {
    return this.#bytes / lookup.MB;
  }
  toGB() {
    return this.#bytes / lookup.GB;
  }
  toTB() {
    return this.#bytes / lookup.TB;
  }
  toPB() {
    return this.#bytes / lookup.PB;
  }
  toKiB() {
    return this.#bytes / lookup.KiB;
  }
  toMiB() {
    return this.#bytes / lookup.MiB;
  }
  toGiB() {
    return this.#bytes / lookup.GiB;
  }
  toTiB() {
    return this.#bytes / lookup.TiB;
  }
  toPiB() {
    return this.#bytes / lookup.PiB;
  }
}
