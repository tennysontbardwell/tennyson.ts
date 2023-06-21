import * as blessed from "blessed";
import { Widgets } from "blessed";
import * as fs from "fs";
import * as xml from 'fast-xml-parser'

class StringArrayMap<T> {
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

class RangerNode {
  readonly node: Widgets.ListElement;

  constructor(items: string[]) {
    this.node = blessed.list({
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
  }

  selected() {
    return this.node.getItem(this.node.getScroll()).getText();
  }
}

class Ranger {
  readonly rangerScreen = new RangerScreen();
  readonly allNodes: StringArrayMap<RangerNode> = new StringArrayMap();
  readonly getChildrenFunc: (path: string[]) => string[];
  activePath: string[] = [];

  constructor(getChildrenFunc: (path: string[]) => string[]) {
    this.getChildrenFunc = getChildrenFunc;
    this.allNodes.set([], new RangerNode(this.getChildren([])));
    const screen = this.rangerScreen.screen;
    screen.key(["escape", "q", "C-c"], function (ch, key) {
      screen.destroy();
    });
    const this_ = this;
    function onkey(
      key: string | string[],
      fun: (active: Widgets.ListElement) => void
    ) {
      screen.key(key, function (ch, key) {
        const active = this_.getActiveNode();
        fun(active.node);
        active.node.select(active.node.getScroll());
        this_.redraw();
        this_.rangerScreen.header.setContent(
          "/" + this_.activePath.join("/") + active.selected()
        );
        screen.render();
      });
    }

    onkey("j", (active) => active.down(1));
    onkey("k", (active) => active.up(1));
    onkey("h", (active) => this.popUnlessRoot());
    onkey("l", (active) => this.dive());
    onkey("g", (active) => active.select(0));
    onkey("S-g", (active) => active.select(active.getScrollHeight()));
    onkey("C-d", (active) => active.down(Math.ceil(Number(active.height) / 2)));
    onkey("C-u", (active) => active.up(Math.ceil(Number(active.height) / 2)));

    screen.render();
  }

  getChildren(path: string[]) {
    try {
      return this.getChildrenFunc(path);
    } catch {
      return [];
    }
  }

  getNode(path: string[]) {
    const node = this.allNodes.get(path);
    if (node === undefined && path.length > 0) {
      const items = this.getChildren(path);
      if (items.length > 0) {
        const newNode = new RangerNode(items);
        this.allNodes.set(path, newNode);
        return newNode;
      }
    } else {
      return node;
    }
  }

  getActiveNode() {
    const node = this.getNode(this.activePath);
    if (node === null || node === undefined) {
      throw "active node should always exist";
    } else {
      return node;
    }
  }

  redraw() {
    const prev =
      this.activePath.length > 0
        ? this.getNode(this.activePath.slice(0, -1))
        : null;
    const curr = this.getActiveNode();
    const next = this.getNode(
      this.activePath.concat(this.getActiveNode().selected())
    );
    this.rangerScreen.detachAll();
    this.rangerScreen.col2.append(curr.node);
    if (next !== undefined) {
      this.rangerScreen.col3.append(next.node);
    }
    if (prev !== undefined && prev !== null) {
      this.rangerScreen.col1.append(prev.node);
    }
  }

  dive() {
    const selected_ = this.getActiveNode().selected();
    const newPath = this.activePath.concat(selected_);
    const children = this.getChildren(newPath);
    if (children.length > 0) {
      this.activePath = newPath;
      this.allNodes.set(this.activePath, new RangerNode(children));
    }
    this.redraw();
  }

  popUnlessRoot() {
    this.activePath = this.activePath.slice(0, -1);
    this.redraw();
  }
}

function lsFiles(path: string[]) {
  const path_ = "/" + path.join("/");
  if (!fs.lstatSync(path_).isDirectory()) {
    return [];
  } else {
    return fs.readdirSync(path_);
  }
}

const parser = new xml.XMLParser();

function objLs(path: string[]) {
  var obj: any = {};
  path.forEach(name => {
    obj = obj[name];
  });
  if (typeof obj === 'object') {
    return Object.keys(obj);
  } else {
    return [String(obj)];
  }
}

const ranger = new Ranger(lsFiles);
// const ranger = new Ranger(objLs);
