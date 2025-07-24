#!/usr/bin/env node

// Fix module resolution for Electron
if (process.versions.electron) {
  console.log("ELECTRON SETUP");
  const Module = require('module');
  const path = require('path');

  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request: any, parent: any, isMain: any) {
    if (request.startsWith('tennyson/')) {
      const buildPath = path.join(__dirname, '..', '..', 'build');
      return originalResolveFilename.call(this, path.join(buildPath, request), parent, isMain);
    }
    return originalResolveFilename.call(this, request, parent, isMain);
  };
}

import * as cli from "tennyson/lib/core/cli";
import * as common from "tennyson/lib/core/common";

import { cmds } from 'tennyson/app/cli';

cli.execute(cmds);

