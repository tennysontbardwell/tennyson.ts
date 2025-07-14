import * as yargs from "yargs";
import * as common from "tennyson/lib/core/common";

export type TransformYargs = (yargs: yargs.Argv) => yargs.Argv;

// export type GeneralCommand = {
//   kind: "generalCommand",
//   fun: (yargs: yargs.Argv) => Promise<yargs.Argv>,
// }

export type SimpleCommand = {
  kind: "simpleCommand",
  name: string,
  command: () => Promise<void>,
};

export type CommandGroup = {
  kind: "commandGroup"
  name: string,
  commands: Array<Command>,
};

export function command(name: string, command: () => Promise<void>): SimpleCommand {
  return { kind: "simpleCommand", name, command }
}

export function group(name: string, commands: Array<Command>): CommandGroup {
  return { kind: "commandGroup", name, commands };
}

export type Command = SimpleCommand | CommandGroup | yargs.CommandModule<{}, {}>;

function configuredYargs() {
  return yargs
    .demandCommand(1)
    .help("help")
    .strict()
    .wrap(null);
}

function simple(name: string, cmd: () => Promise<void>, options?: { [key: string]: yargs.Options }) {
  return {
    command: name,
    describe: "",
    builder: options,
    handler: async (parsed: any) => {
      try {
        common.log.info("running " + name);
        await cmd();
      } catch (error) {
        common.log.fatal(error);
      }
    },
  };
}

function buildYargs(command: Command): yargs.CommandModule<{}, {}> {
  if (!('kind' in command)) {
    return command;
  }
  switch (command.kind) {
    case "simpleCommand":
      return simple(command.name, command.command);
    case "commandGroup":
      return {
        command: command.name,
        describe: "",
        builder: function(yargs) {
          const yargs_ = yargs;
          command.commands.reduce(
            (acc, curr) => acc.command(buildYargs(curr)),
            yargs_
          );
          return yargs;
        },
        handler: (args: any) => {},
      };
  }
}

export async function execute(commands: Array<Command>) {
  async function run() {
    const yargs = commands.reduce(
      (acc, curr) => acc.command(buildYargs(curr)),
      configuredYargs()
    );
    yargs.argv;
  }
  run().catch((error) =>
    common.log.error("error in comand parsing function", error)
  );
}
