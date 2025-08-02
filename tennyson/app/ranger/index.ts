import * as blessed from "blessed";
import { Widgets } from "blessed";
import * as fs from "fs";
import * as fsSync from 'fs';
import * as xml from "fast-xml-parser";
import * as common from "tennyson/lib/core/common";

export class StringArrayMap<T> {
  data: Map<string, T> = new Map();
  constructor() {}

  set(k: string[], v: T) {
    return this.data.set(JSON.stringify(k), v);
  }
  get(k: string[]): T | undefined {
    return this.data.get(JSON.stringify(k));
  }
}

class RangerScreen {
  readonly screen = blessed.screen({ smartCSR: true });
  readonly root = blessed.layout({
    layout: "inline",
    width: "shrink",
    height: "100%",
    parent: this.screen,
  });
  readonly header = blessed.text({
    top: 0,
    width: "100%",
    content: "Hello {bold}world{/bold}!",
    tags: true,
    style: {
      bg: "red",
    },
    parent: this.root,
  });

  mkCol(width: string): Widgets.BoxElement {
    return blessed.box({
      width: width,
      height: "shrink",
      parent: this.root,
    });
  }

  readonly col1 = this.mkCol("13%-1");
  readonly cola = this.mkCol("0%+1");
  readonly col2 = this.mkCol("40%-1");
  readonly colb = this.mkCol("0%+1");
  readonly col3 = this.mkCol("47%");

  constructor() {}

  detachAll() {
    [this.col1, this.col2, this.col3].map((col) =>
      col.children.map((child) => child.detach())
    );
  }
}

interface Dir {
  state: "dir";
  items: string[];
  node: Widgets.ListElement;
}
interface Leaf {
  state: "leaf";
  node: Widgets.TextElement;
}

class RangerNode<T extends Dir | Leaf> {
  readonly node: T;

  private constructor(node: T) {
    this.node = node;
  }

  static leaf(contents: string) {
    const node = blessed.text({});
    node.setContent(contents);
    return new RangerNode({ state: "leaf", node: node });
  }

  static dir(items: string[]) {
    if (items.length == 0) {
      throw "cannot construct 0 length RangerNode";
    }
    const node = blessed.list({
      width: "100%",
      height: "100%",
      scrollable: true,
      style: {
        selected: {
          bg: "white",
          fg: "black",
        },
      },
      items: items,
    });
    return new RangerNode({ state: "dir", node: node, items });
  }

  static auto(arg: string | string[]) {
    if (typeof arg == "string") {
      return RangerNode.leaf(arg);
    } else {
      return RangerNode.dir(arg);
    }
  }

  selected() {
    if (this.node.state == "dir") {
      return this.node.items[this.node.node.getScroll()];
    } else {
      return null;
    }
  }

  selectedExn() {
    const selected = this.selected();
    if (typeof selected === "string") {
      return selected;
    } else {
      throw "this Node is a leaf";
    }
  }
}

type ChildFunc =
  (path: string[]) => string[] | string | Promise<string[] | string>;

export class Ranger {
  readonly rangerScreen = new RangerScreen();
  readonly allNodes: StringArrayMap<RangerNode<Dir | Leaf>> =
    new StringArrayMap();
  readonly getChildrenFunc: ChildFunc;
  activePath: string[] = [];

  constructor(getChildrenFunc: ChildFunc) {
    this.getChildrenFunc = getChildrenFunc;
  }

  async run() {
    this.allNodes.set([], RangerNode.auto(await this.getChildren([])));
    const screen = this.rangerScreen.screen;
    screen.key(["escape", "q", "C-c"], function (ch, key) {
      screen.destroy();
    });
    const this_ = this;
    function onKeyGeneral(
      key: string | string[],
      fun: () => (void | Promise<void>),
      onDirFun: (active: Widgets.ListElement) => void
    ) {
      screen.key(key, async function (ch, key) {
        await fun();
        const active = await this_.getActiveNode();
        const activeNode = active.node;
        if (activeNode.state == "dir") {
          onDirFun(activeNode.node);
          activeNode.node.select(activeNode.node.getScroll());
        }
        await this_.redraw();
        this_.rangerScreen.header.setContent(
          "/" + this_.activePath.join("/") + active.selected()
        );
        screen.render();
      });
    }
    const nop = () => {};
    function onKey(key: string | string[], fun: () => void | Promise<void>) {
      onKeyGeneral(key, fun, nop);
    }
    function onDirKey(
      key: string | string[],
      fun: (active: Widgets.ListElement) => void
    ) {
      onKeyGeneral(key, nop, fun);
    }

    onDirKey("j", (active) => active.down(1));
    onDirKey("k", (active) => active.up(1));
    onKey("h", () => this.popUnlessRoot());
    onKey("l", () => this.dive());
    onDirKey("g", (active) => active.select(0));
    onDirKey("S-g", (active) => active.select(active.getScrollHeight()));
    onDirKey("C-d", (active) =>
      active.down(Math.ceil(Number(active.height) / 2))
    );
    onDirKey("C-u", (active) =>
      active.up(Math.ceil(Number(active.height) / 2))
    );

    await this_.redraw();
    screen.render();
  }

  async getChildren(path: string[]) {
    try {
      return await this.getChildrenFunc(path);
    } catch {
      return [];
    }
  }

  async getNode(path: string[]) {
    const node = this.allNodes.get(path);
    if (node === undefined && path.length > 0) {
      const subcontents = await this.getChildren(path);
      if (typeof subcontents === "string" || subcontents.length > 0) {
        const newNode = RangerNode.auto(subcontents);
        this.allNodes.set(path, newNode);
        return newNode;
      }
    } else {
      return node;
    }
  }

  async getActiveNode() {
    const node = await this.getNode(this.activePath);
    if (node === null || node === undefined) {
      throw "active node should always exist";
    } else if (node.node.state == "leaf") {
      throw "active node should always be a dir";
    } else {
      return node;
    }
  }

  async redraw() {
    const prev =
      this.activePath.length > 0
        ? await this.getNode(this.activePath.slice(0, -1))
        : null;
    const curr = await this.getActiveNode();
    const nextPath = this.activePath.concat(curr.selectedExn());
    const next = await this.getNode(nextPath);
    this.rangerScreen.detachAll();
    this.rangerScreen.col2.append(curr.node.node);
    if (next !== undefined) {
      this.rangerScreen.col3.append(next.node.node);
    }
    if (prev !== undefined && prev !== null) {
      this.rangerScreen.col1.append(prev.node.node);
    }
  }

  async dive() {
    const selected = (await this.getActiveNode()).selected();
    if (selected === null) {
      return;
    }
    const newPath = this.activePath.concat(selected);
    const subcontents = await this.getChildren(newPath);
    if (typeof subcontents !== "string" && subcontents.length > 0) {
      this.activePath = newPath;
      this.allNodes.set(this.activePath, RangerNode.auto(subcontents));
    }
    this.redraw();
  }

  async popUnlessRoot() {
    this.activePath = this.activePath.slice(0, -1);
    await this.redraw();
  }
}

const parser = new xml.XMLParser();

function objLs(path: string[]) {
  var obj: any = {};
  path.forEach((name) => {
    obj = obj[name];
  });
  if (typeof obj === "object") {
    return Object.keys(obj);
  } else {
    return [String(obj)];
  }
}

export function lsFiles(path: string[]) {
  const path_ = "/" + path.join("/");
  const stats = fsSync.lstatSync(path_);
  if (stats.isFile()) {
    return fsSync.readFileSync(path_, { encoding: "utf-8" });
  } else if (stats.isDirectory()) {
    return fsSync.readdirSync(path_);
  } else {
    return [];
  }
}


// const ranger = new Ranger(lsFiles);
// const ranger = new Ranger(objLs);
