#!/usr/bin/env node

import * as c from "tennyson/lib/core/common";
import * as cli from "tennyson/lib/core/cli";

import { cmds } from "tennyson/app/cli";

cli.execute(cmds());
