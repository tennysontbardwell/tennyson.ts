import * as c from "tennyson/lib/core/common";
import * as rc from "tennyson/lib/web/react-common";

import * as keystack from './keystack'
import {DataFlicker, oneKRows} from './scratch-test-data'
import * as gg from './GrammarGraph'

import { Stream, Schedule, SubscriptionRef, pipe, Data } from "effect";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type Column,
  type Table,
} from "@tanstack/react-table";

import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useMemo,
  useImperativeHandle,
  type Ref,
  type KeyboardEvent,
  type RefObject,
} from "react";

import * as echarts from "echarts";

const EchartsBasic = (options: {
  dataset: any;
  dimensions: string[];
  encode: Record<"x" | "y", string> & Partial<Record<"z" | "c" | "s", string>>;
  ref?: RefObject<echarts.ECharts | null>;
}) => {
  const is3D = options.encode.z !== undefined;
  const x: echarts.EChartsOption = useMemo(
    () =>
      c.id({
        animationDuration: 0,
        animationDurationUpdate: 150,
        ...(is3D
          ? {
              xAxis3D: { name: options.encode.x, type: "value" },
              yAxis3D: { name: options.encode.y, type: "value" },
              zAxis3D: { name: options.encode.z, type: "value" },
              grid3D: {
                viewControl: {
                  projection: "orthographic",
                  autoRotate: true,
                  autoRotateSpeed: 3,
                },
              },
            }
          : {
              xAxis: { name: options.encode.x, type: "value" },
              yAxis: { name: options.encode.y, type: "value" },
            }),
        dataset: {
          dimensions: options.dimensions,
          source: options.dataset,
        },
        visualMap: [
          ...(options.encode.c !== undefined
            ? [
                {
                  min: Math.min(
                    ...options.dataset.map((d: any) => d[options.encode.c!]),
                  ),
                  max: Math.max(
                    ...options.dataset.map((d: any) => d[options.encode.c!]),
                  ),
                  orient: "vertical",
                  right: 0,
                  top: "center",
                  dimension: options.encode.c,
                  calculable: true,
                  inRange: {
                    color: ["#121122", "rgba(3,4,5,0.4)", "red"],
                  },
                },
              ]
            : []),
          ...(options.encode.s !== undefined
            ? [
                {
                  min: Math.min(
                    ...options.dataset.map((d: any) => d[options.encode.s!]),
                  ),
                  max: Math.max(
                    ...options.dataset.map((d: any) => d[options.encode.s!]),
                  ),
                  orient: "vertical",
                  right: 0,
                  top: "top",
                  dimension: options.encode.s,
                  calculable: true,
                  inRange: {
                    symbolSize: [5, 20],
                  },
                },
              ]
            : []),
        ],
        tooltip: {
          trigger: "item",
          formatter: (params: any) =>
            '<code style="white-space: pre;">' +
            JSON.stringify(params.data, null, 2) +
            "</code>",
        },
        series: [
          {
            type: is3D ? "scatter3D" : "scatter",
            encode: {
              x: options.encode.x,
              y: options.encode.y,
              ...(is3D ? { z: options.encode.z } : {}),
            },
          },
        ],
      } as any),
    [options.dataset, options.dimensions, options.encode],
  );
  return <rc.EChart option={x} is3D={is3D} ref={options.ref} />;
};

const tablestyle = `
table {
	text-align: left;
	border-collapse: collapse;
}

th,
caption {
	text-align: start;
}

table th {
	color: blue;
}

table:focus-within th {
	color: red;
}


thead {
	border-block-end: 2px solid;
	{/* background: whitesmoke; */}
}

tfoot {
	border-block: 2px solid;
	{/* background: whitesmoke; */}
}

th,
td {
	border: 1px solid lightgrey;
	padding: 0.25rem 0.75rem;
}

/* td:focus, */
td.selected
{
  background: red;
}

thead th:not(:first-child),
td {
	text-align: end;
}

th,
td {
	border: 1px solid;
}

table {
	--color: #d0d0f5;
}

thead,
tfoot {
	background: var(--color);
}

tbody tr:nth-child(even) {
	background: color-mix(in srgb, var(--color), transparent 60%);
}
        `;

interface Nav<T extends string = string> {
  maxRow: number;
  visibleColumns: Column<T>[];
  rowIdx: number;
  colIdx: number;
  dimensionsMapping: gg.DimensionMapping<T>;
  setDimensionsMapping: (a: gg.DimensionMapping<T>) => void;
  focusCell: (row: number, col: number) => void;
}

namespace Nav {
  export const useNav = (
    table: Table<any>,
    onFocusCell: (a: { rowIdx: number; colIdx: number }) => void,
  ) => {
    /* const [cursor, setCursor] = useState({ rowIdx: 0, colIdx: 0 });
     * const cursorRef = rc.useLatest(cursor); */
    const [cursor, setCursor, cursorRef] = rc.useStateAndLatest({
      rowIdx: 0,
      colIdx: 0,
    });

    const go = (rowIdx: number, colIdx: number) => {
      setCursor({ rowIdx, colIdx });
      onFocusCell({ rowIdx, colIdx });
    };

    const goAbs = (rIdx?: number, cIdx?: number) => {
      const rCount = table.getRowCount();
      const cCount = table.getVisibleFlatColumns().length;
      const rowIdx =
        rIdx !== undefined ? c.posMod(rIdx, rCount) : cursorRef.current.rowIdx;
      const colIdx =
        cIdx !== undefined ? c.posMod(cIdx, cCount) : cursorRef.current.colIdx;
      go(rowIdx, colIdx);
    };

    const goRel = (dr: number, dc: number) => {
      const rCount = table.getRowCount();
      const cCount = table.getVisibleFlatColumns().length;
      const cur = cursorRef.current;
      const rowIdx = c.clamp(cur.rowIdx + dr, 0, rCount - 1);
      const colIdx = c.clamp(cur.colIdx + dc, 0, cCount - 1);
      go(rowIdx, colIdx);
    };

    return {
      cursor,
      cursorRef,
      goAbs,
      goRel,
    };
  };
}

/* const data = DataFlicker.dataA; */
const data = oneKRows();
const dimensions = ["x", "y", "z", "name"];
const columns = Object.keys(data[0]).map((s) =>
  c.id({ accessorKey: s, header: s }),
);

export default function SimpleTable() {
  /* const data$ = useMemo(() => DataFlicker.stream, []);
   * const data = rc.useStream(data$, DataFlicker.dataA); */

  const ref = useRef<echarts.ECharts | null>(null);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tipOnFocus = useRef(true);
  const tipRow = (row: number) => {
    ref.current?.dispatchAction({
      type: "showTip",
      seriesIndex: 0,
      dataIndex: row,
    });
  };
  const onFocusCell = useMemo(
    () => (cord: { rowIdx: number; colIdx: number }) => {
      if (tipOnFocus.current) tipRow(cord.rowIdx);
    },
    [data],
  );

  const { goAbs, goRel, cursor, cursorRef } = Nav.useNav(table, onFocusCell);

  const [encode, setEncode, encodeRef] = rc.useStateAndLatest<
    Record<"x" | "y", string> & Partial<Record<"z" | "c" | "s", string>>
  >({ x: "x", y: "y" });

  const keystack_ = useMemo(() => {
    type TMP = "x" | "y" | "z" | "c" | "s";
    const cur = () => cursorRef.current;
    const colName = () =>
      table.getVisibleLeafColumns()[cursorRef.current.colIdx].id;
    const getEncode = (ks: TMP[]) => ks.map((k) => encodeRef.current[k]);

    const setEncode_ = (k: TMP, v: string | null) =>
      setEncode(
        c.copyAndModify(encodeRef.current, (d) => {
          if (v === null) delete d[k];
          else d[k] = v;
        }),
      );
    const checkAndSet = (val: string, to: TMP, check: TMP[]) => {
      if (!getEncode(check).find((x) => x === val))
        setEncode_(to, val);
    };
    const moves: Record<string, () => void> = {
      h: () => goRel(0, -1),
      ArrowLeft: () => goRel(0, -1),
      l: () => goRel(0, 1),
      ArrowRight: () => goRel(0, 1),
      j: () => goRel(1, 0),
      ArrowDown: () => goRel(1, 0),
      k: () => goRel(-1, 0),
      ArrowUp: () => goRel(-1, 0),
      "0": () => goAbs(undefined, 0),
      Home: () => goAbs(undefined, 0),
      $: () => goAbs(undefined, -1),
      End: () => goAbs(undefined, -1),
      G: () => goAbs(-1, undefined),
      "g g": () => goAbs(0, undefined),
      "]": () =>
        table.getVisibleLeafColumns()[cur().colIdx].toggleSorting(true, false),
      "[": () =>
        table.getVisibleLeafColumns()[cur().colIdx].toggleSorting(false, false),
      "C-d": () => goRel(5, 0),
      "C-u": () => goRel(-5, 0),
      "s x": () => checkAndSet(colName(), "x", ["y", "z"]),
      "s y": () => checkAndSet(colName(), "y", ["x", "z"]),
      "s z": () => checkAndSet(colName(), "z", ["x", "y"]),
      "s c": () => setEncode_("c", colName()),
      "s s": () => setEncode_("s", colName()),
      "c x": () => setEncode_("x", null),
      "c y": () => setEncode_("y", null),
      "c z": () => setEncode_("z", null),
      "c c": () => setEncode_("c", null),
      "c s": () => setEncode_("s", null),
      "SPC t": () => tipRow(cursorRef.current.rowIdx),
      "t t": () => {
        tipOnFocus.current = !tipOnFocus.current;
        if (!tipOnFocus.current)
          ref.current?.dispatchAction({
            type: "hideTip",
          });
      },
      r: () => setEncode({ x: "x", y: "y" }),
    };

    return {
      ...keystack.empty(),
      keymap: c.mapValues(moves, (command) =>
        c.id({ command, name: "unnamed" }),
      ),
    };
  }, []);

  const handleKeyDown = useMemo(
    () => (e: KeyboardEvent<HTMLTableElement>) => {
      if (keystack.presentKey(keystack_, keystack.keystrokeToString(e)))
        e.preventDefault();
    },
    [],
  );

  const rows = table.getRowModel().rows;
  const renderRange = (() => {
    const pageSize = 11;
    if (cursor.rowIdx < pageSize / 2) return { min: 0, max: pageSize };
    else if (cursor.rowIdx > rows.length - pageSize / 2)
      return { min: rows.length - pageSize, max: rows.length };
    return {
      min: Math.max(cursor.rowIdx - 5, 0),
      max: Math.min(cursor.rowIdx + 5 + 1, table.getRowModel().rows.length),
    };
  })();
  const rowsToRender = rows.slice(renderRange.min, renderRange.max);

  return (
    <>
      <div style={{ width: "800px", height: "600px" }}>
        <EchartsBasic
          dataset={data}
          dimensions={dimensions}
          encode={encode}
          ref={ref}
        />
      </div>
      <style>{tablestyle}</style>
      <table tabIndex={-1} onKeyDown={handleKeyDown}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th key={header.id}>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rowsToRender.map((row, i) => {
            const rId = i + renderRange.min;
            return (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell, cId) => (
                  <td
                    key={cell.id}
                    className={
                      rId === cursor.rowIdx && cId === cursor.colIdx
                        ? "selected"
                        : ""
                    }
                    onFocus={() => goAbs(rId, cId)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export const HQQuickDev = () => (
  <>
    {/* <D3Flicker /> */}
    {/* <EchartsFlicker /> */}
    <SimpleTable />
  </>
);
