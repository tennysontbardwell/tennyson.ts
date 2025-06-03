import { Ranger, StringArrayMap } from "tennyson/app/ranger/index";
import * as client_route_53 from "@aws-sdk/client-route-53";
import * as client_ec2 from "@aws-sdk/client-ec2";
import * as fs from "fs";

type Node =
  | {
      state: "leaf";
      name: string;
      contents: () => string;
    }
  | {
      state: "dir";
      name: string;
      contents: () => Node[];
    };

class RangerWrapper {
  readonly root: Node;
  readonly allNodes: StringArrayMap<Node> = new StringArrayMap();
  constructor(root: Node) {
    this.root = root;
  }
}

function lsFiles(path: string[]) {
  const path_ = "/" + path.join("/");
  const stats = fs.lstatSync(path_);
  if (stats.isFile()) {
    return fs.readFileSync(path_, { encoding: "utf-8" });
  } else if (stats.isDirectory()) {
    return fs.readdirSync(path_);
  } else {
    return [];
  }
}

// function awsRoot

const ranger = new Ranger(lsFiles);

// client_ec2.DescribeInstancesCommand()
