// Write a short ts code block that converts an emoji to a jpeg and then adds it
// to a vcf file. Convert via the inkscape/imagemagick route above, and then
// insert via vcard-ts. Be terse in comments and code.

// import * as path from "path";
// import { promises as fs } from "fs";
// import * as common_node from "tennyson/lib/core/common-node";
// import { VCard } from "vcard-ts";

// async function main() {
//   const emoji = "🤓";
//   const outVcf = "contact.with-photo.vcf";

//   await common_node.withTempDir(async (dir) => {
//     const svg = path.join(dir, "e.svg");
//     const png = path.join(dir, "e.png");
//     const jpg = path.join(dir, "e.jpg");

//     await fs.writeFile(
//       svg,
//       `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="420">${emoji}</text></svg>`,
//     );

//     if (await common_node.passthru("inkscape", ["--export-type=png", "--export-filename", png, "-w", "512", "-h", "512", svg])) {
//       throw new Error("inkscape failed");
//     }
//     if (await common_node.passthru("magick", [png, "-background", "white", "-alpha", "remove", "-alpha", "off", jpg])) {
//       throw new Error("magick failed");
//     }

//     const b64 = (await fs.readFile(jpg)).toString("base64");

//     const card = new VCard();
//     card.firstName = "Forrest";
//     card.lastName = "Gump";
//     card.cellPhone = "+11115551212";

//     const vcf = card.getFormattedString();
//     const eol = vcf.includes("\r\n") ? "\r\n" : "\n";
//     const withPhoto = vcf.replace(
//       /(\r?\n)END:VCARD\s*$/m,
//       `${eol}PHOTO;ENCODING=b;TYPE=JPEG:${b64}$1END:VCARD`,
//     );

//     await fs.writeFile(outVcf, withPhoto);
//   });
// }

// main();
