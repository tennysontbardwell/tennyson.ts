import * as yargs from "yargs";
import { ArgumentsCamelCase, InferredOptionTypes } from "yargs";
import * as common from "tennyson/lib/core/common";

type SimpleCommandHandler<O extends { [key: string]: yargs.Options; }> =
  (args: ArgumentsCamelCase<InferredOptionTypes<O>>) =>
    void | Promise<void>;

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
    handler
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

export function command(
  name: string,
  command: () => Promise<void>)
  : Command {
  return flagsCommand(name, {} as const, command);
}


function getName(command: yargs.CommandModule) {
  if (command.command === undefined)
    return ''
  if (typeof command.command === 'string')
    return command.command
  return command.command[0];
}

export function group(
  name: string,
  commands: yargs.CommandModule<{}, any>[],
  describe?: string,
) {
  const sorted = commands.sort((a, b) =>
    getName(a).localeCompare(getName(b)));
  return <yargs.CommandModule>{
    command: name,
    describe: "",
    builder: function (yargs) {
      return sorted.reduce((accum, curr) => accum.command(curr), yargs);
    },
    handler: (args: any) => {
      yargs.showHelp();
    },
  }
};

export function lazyGroup(
  name: string,
  commands: () => Promise<yargs.CommandModule<{}, any>[]>,
  describe?: string,
) {
  return <yargs.CommandModule>{
    command: name,
    describe: "",
    builder: async function (yargs) {
      const resolvedCommands = await commands();
      const sorted = resolvedCommands.sort((a, b) =>
        getName(a).localeCompare(getName(b)));
      return sorted.reduce((accum, curr) => accum.command(curr), yargs);
    },
    handler: (args: any) => {
      yargs.showHelp();
    },
  }
};

function configuredYargs() {
  return yargs
    .demandCommand(1)
    .help("help")
    .strict()
    .wrap(null);
}

export async function execute(commands: Array<Command>) {
  const yargs =
    commands
      .sort((a, b) => getName(a).localeCompare(getName(b)))
      .reduce(
        (acc, curr) => acc.command(curr),
        configuredYargs());
  async function run() {
    yargs.argv;
  }
  run().catch((error) =>
    common.log.error("error in comand parsing function", error)
  );
}
