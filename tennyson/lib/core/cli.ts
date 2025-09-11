import type * as yargs from "yargs";
import Yargs from "yargs";
import type { ArgumentsCamelCase, InferredOptionTypes } from "yargs";
import * as common from "tennyson/lib/core/common";

type SimpleCommandHandler<O extends { [key: string]: yargs.Options }> = (
  args: ArgumentsCamelCase<InferredOptionTypes<O>>,
) => void | Promise<void>;

export type Command = yargs.CommandModule<{}, any>;

export function flagsCommand<O extends { [key: string]: yargs.Options }>(
  name: string,
  options: O,
  handler: SimpleCommandHandler<O>,
  describe?: string,
): yargs.CommandModule<{}, yargs.InferredOptionTypes<O>> {
  return {
    command: name,
    describe: describe ?? "",
    builder: options,
    handler,
    // async (argv: O) => {
    //   try {
    //     common.log.info("running " + name);
    //     await handler(argv);
    //   } catch (error) {
    //     common.log.fatal(error);
    //   }
    // },
  };
}

export function command(name: string, command: () => Promise<void>): Command {
  return flagsCommand(name, {} as const, command);
}

function getName(command: yargs.CommandModule) {
  if (command.command === undefined) return "";
  if (typeof command.command === "string") return command.command;
  return command.command[0];
}

export function group(
  name: string,
  commands: yargs.CommandModule<{}, any>[],
  describe?: string,
) {
  const sorted = commands.sort((a, b) => getName(a).localeCompare(getName(b)));
  return <yargs.CommandModule>{
    command: name,
    describe: describe ?? "",
    builder: function (yargs) {
      return sorted
        .reduce((accum, curr) => accum.command(curr), yargs)
        .demandCommand(1);
    },
    handler: (args: any) => {
      configuredYargs().showHelp();
    },
  };
}

export function lazyGroup(
  name: string,
  commands: () => Promise<yargs.CommandModule<{}, any>[]>,
  describe?: string,
) {
  const builder = async (yargs: yargs.Argv<{}>) => {
    const resolvedCommands = await commands();
    const sorted = resolvedCommands.sort((a, b) =>
      getName(a).localeCompare(getName(b)),
    );
    return sorted
      .reduce((accum, curr) => accum.command(curr), yargs)
      .demandCommand(1);
  };
  return <yargs.CommandModule>{
    command: name,
    describe: describe || "",
    builder,
    handler: (args: any) => {},
  };
}

function configuredYargs() {
  return Yargs(process.argv.slice(2))
    .demandCommand(1)
    .help("help")
    .strict()
    .wrap(null);
}

export async function execute(
  commands: Array<Command>,
  options?: {
    scriptName?: string;
  },
) {
  const yargs = commands
    .sort((a, b) => getName(a).localeCompare(getName(b)))
    .reduce((acc, curr) => acc.command(curr), configuredYargs())
    .completion();
  const yargs_ = options?.scriptName
    ? yargs.scriptName(options.scriptName)
    : yargs;
  try {
    await yargs_.parse();
  } catch (error) {
    common.log.error("Error in command parsing/execution", error);
    process.exit(1);
  }
}
