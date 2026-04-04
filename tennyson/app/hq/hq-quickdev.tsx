import * as c from "tennyson/lib/core/common";
import * as rc from "tennyson/lib/web/react-common";

import * as keystack from "./keystack";
import { oneKRows } from "./scratch-test-data";
import * as gg from "./GrammarGraph";
import { DataViewer } from "./DataViewer";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type Column,
  type Table,
} from "@tanstack/react-table";

import { useState, useRef, useMemo, type KeyboardEvent } from "react";

/* export const HQQuickDev = () => (
 *   <>
 *     <DataViewer
 *       data={oneKRows()}
 *       initialMapping={{
 *         x: "x",
 *         y: "y",
 *       }}
 *     />
 *   </>
 * ); */

export const HQQuickDev = () => {
  const promise = fetch("/api/main-scratch-file").then((res) => res.json());
  const children = useMemo(
    () => (data: any) => (
      <DataViewer
        data={data}
        initialMapping={{
          x: "x",
          y: "y",
        }}
      />
    ),
    [],
  );

  return <rc.PromiseResolver promise={promise} children={children} />;
};
