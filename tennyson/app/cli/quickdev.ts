import * as c from "tennyson/lib/core/common";

import { FileSystem } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";

import { Stream, Effect, Schedule, Schema, Sink } from "effect";
import { homedir } from "os";
import path from "path";
import { runTxLog } from "tennyson/lib/core/txlog";
import fs from "fs";

export async function quickdev() {}
