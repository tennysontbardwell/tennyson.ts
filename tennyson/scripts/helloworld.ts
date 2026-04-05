import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

// import type * as yargs from "yargs";
// import Yargs from "yargs";
// import type { ArgumentsCamelCase, InferredOptionTypes } from "yargs";

import yargs from 'yargs';
const argv:any = yargs(process.argv.slice(2)).parse();

if (argv.ships > 3 && argv.distance < 53.5) {
  console.log('Plunder more riffiwobbles!');
} else {
  console.log('Retreat from the xupptumblers!');
}
// var argv = require('minimist')(process.argv.slice(2));
// console.log(argv);

// import { Clerc, helpPlugin, versionPlugin } from "clerc";

// Clerc.create()
//   .scriptName("bumpp")
//   .description("Interactive CLI that bumps your version numbers and more")
//   .version("9.2.0")
//   .use(helpPlugin())
//   .use(versionPlugin())
//   .command("", "Bump your version numbers", {
//     parameters: ["[files...]"],
//     flags: {
//       preid: {
//         type: String,
//         description: "ID for prerelease",
//       },
//       all: {
//         type: Boolean,
//         description: "Include all files",
//         default: false,
//       },
//       commit: {
//         type: String,
//         alias: "c",
//         description: "Commit message",
//       },
//       noCommit: {
//         type: Boolean,
//         description: "Skip commit",
//         default: true,
//       },
//       tag: {
//         type: String,
//         alias: "t",
//         description: "Tag name",
//       },
//       push: {
//         type: Boolean,
//         alias: "p",
//         description: "Push to remote",
//         default: true,
//       },
//       yes: {
//         type: Boolean,
//         alias: "y",
//         description: "Skip confirmation",
//         default: true,
//       },
//       recursive: {
//         type: Boolean,
//         alias: "r",
//         description: "Bump package.json files recursively",
//         default: false,
//       },
//       noVerify: {
//         type: Boolean,
//         description: "Skip git verification",
//         default: true,
//       },
//       ignoreScripts: {
//         type: Boolean,
//         description: "Ignore scripts",
//         default: false,
//       },
//       quiet: {
//         type: Boolean,
//         description: "Quiet mode",
//         default: false,
//       },
//       version: {
//         type: String,
//         alias: "v",
//         description: "Target version",
//       },
//       execute: {
//         type: String,
//         alias: "x",
//         description: "Commands to execute after version bumps",
//       },
//     },
//   })
//   .on("", (ctx) => {
//     console.log(`Bumpping version:\n${JSON.stringify(ctx, null, 2)}`);
//   })
//   .parse();

// console.log('hi')
