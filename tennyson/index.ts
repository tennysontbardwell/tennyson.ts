#!/usr/bin/env node

import * as cli from "tennyson/lib/core/cli";
import * as common from "tennyson/lib/core/common";

import { cmds } from "tennyson/app/cli";

cli.execute(cmds);
