import * as c from "tennyson/lib/core/common";

type KeyCmd = { name: string; command: () => void };
type Keymap = Record<string, KeyCmd>;

interface KeyStack {
  keymap: Keymap;
  stack: string[];
  timer: NodeJS.Timeout | null;
}

export const empty = () =>
  c.id({
    keymap: {},
    stack: [],
    timer: null,
  });

export const keystrokeToString = (e: React.KeyboardEvent) => {
  const remap: Record<string, string> = {
    " ": "SPC",
  };
  return [
    e.ctrlKey ? "C-" : "",
    e.metaKey ? "D-" : "", // Command key
    e.altKey ? "M-" : "", // Alt/Meta key
    remap[e.key] ?? e.key,
  ].join("");
};

export const clear = (t: KeyStack) => {
  t.timer && clearTimeout(t.timer);
  t.stack = [];
};

export const presentKey = (t: KeyStack, key: string) => {
  t.timer && clearTimeout(t.timer);
  t.stack.push(key);
  const name = t.stack.join(" ");
  const cmd = t.keymap[name];
  if (cmd !== undefined) {
    clear(t);
    cmd.command();
    return true;
  } else if (Object.keys(t.keymap).find((x) => x.startsWith(name + " "))) {
    t.timer = setTimeout(() => clear(t), 1000);
    return true;
  } else {
    clear(t);
    return false;
  }
};
