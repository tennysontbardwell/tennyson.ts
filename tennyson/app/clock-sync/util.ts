import * as c from "tennyson/lib/core/common";

export function parseHex(hex: String) {
  try {
    const cleanedHex = hex.replace(/\s+/g, "").replace(/^0x/, "");
    const byteArray = new Uint8Array(
      cleanedHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    return new TextDecoder("utf-8").decode(byteArray);
  } catch (e) {
    c.log.error({ message: "error parsing hex", hex: hex });
    throw e;
  }
}
