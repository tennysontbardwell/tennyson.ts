import type * as yargs from "yargs";
import Yargs from "yargs";
import type { ArgumentsCamelCase, InferredOptionTypes } from "yargs";
import * as common from "tennyson/lib/core/common";

type SimpleCommandHandler<
  O extends { [key: string]: yargs.Options },
  P extends { [key: string]: yargs.PositionalOptions } = {},
> = (
  args: ArgumentsCamelCase<InferredOptionTypes<O> & InferredOptionTypes<P>>,
) => void | Promise<void>;

export type Command = yargs.CommandModule<{}, any>;

export function flagsCommand<
  O extends { [key: string]: yargs.Options },
  P extends { [key: string]: yargs.PositionalOptions } = {},
>(
  name: string,
  options: O,
  handler: SimpleCommandHandler<O, P>,
  describe?: string,
  positionals?: P,
): yargs.CommandModule<
  {},
  yargs.InferredOptionTypes<O> & yargs.InferredOptionTypes<P>
> {
  const positionalParts = positionals
    ? Object.entries(positionals).map(([key, opts]) => {
        const optional =
          opts.demandOption === false || opts.default !== undefined;
        const array = opts.array ?? false;
        return [
          optional ? "[" : "<",
          key,
          array ? ".." : "",
          optional ? "]" : ">",
        ].join("");
      })
    : [];
  const command = [name, ...positionalParts].join(" ");
  return {
    command,
    describe: describe ?? "",
    builder: (yargs) => {
      if (positionals) {
        for (const [key, opts] of Object.entries(positionals)) {
          yargs.positional(key, opts);
        }
      }
      return yargs
        .parserConfiguration({ "unknown-options-as-args": true })
        .help(false)
        .options(options) as any;
    },
    handler,
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
