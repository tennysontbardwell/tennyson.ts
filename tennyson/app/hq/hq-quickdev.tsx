import * as c from "tennyson/lib/core/common";
import * as rc from "tennyson/lib/web/react-common";
import * as tpipe from "tennyson/lib/core/pipe";

import * as d3 from "d3";
import * as rx from "rxjs";
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
import ReactDOM from "react-dom/client";

import { fetchFileSystem } from "./ItemDisplay";
import type { RangerItem } from "./Ranger";
import { Ranger } from "./Ranger";
import * as echarts from "echarts";

namespace DataFlicker {
  export const dataA = [
    {
      name: "A",
      x: 1,
      y: 30,
      z: 5,
    },
    {
      name: "Z",
      x: 2,
      y: 20,
      z: 4,
    },
    {
      name: "C",
      x: 3,
      y: 10,
      z: 3,
    },
    {
      name: "F",
      x: 1.5,
      y: 10,
      z: 2,
    },
  ];

  const dataB = [
    ...dataA,
    {
      name: "D",
      x: 4,
      y: 0,
      z: 0,
    },
    {
      name: "E",
      x: 1.5,
      y: 20,
      z: 0,
    },
  ];

  export const stream = pipe(
    Schedule.spaced("30000 millis"),
    Stream.fromSchedule,
    Stream.map((i) => (i % 2 === 0 ? dataA : dataB)),
  );
}

const D3Flicker = () => {
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 500;
  const height = 500;
  const animation = 150;

  const data$ = useMemo(() => DataFlicker.stream, []);
  const data = rc.useStream(data$, DataFlicker.dataA);

  const inner = useMemo(() => {
    const x = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.x) ?? 0])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.y) ?? 0])
      .nice()
      .range([height, 0]);

    return { x, y };
  }, [data, width, height]);

  useLayoutEffect(() => {
    if (!svgRef.current) return;

    const { x, y } = inner;
    const svg = d3.select(svgRef.current);

    svg.attr("viewBox", `0 0 ${width + 50} ${height + 50}`);

    const g = svg
      .selectAll("g.chart-root")
      .data([null])
      .join("g")
      .attr("class", "chart-root")
      .attr("transform", `translate(${25},${25})`);

    g.selectAll<SVGGElement, null>("g.xaxis")
      .data([null])
      .join("g")
      .attr("class", "xaxis")
      .attr("transform", `translate(0,${height})`)
      .transition()
      .duration(animation)
      .call(d3.axisBottom(x));

    g.selectAll<SVGGElement, null>("g.yaxis")
      .data([null])
      .join("g")
      .attr("class", "yaxis")
      .transition()
      .duration(animation)
      .call(d3.axisLeft(y).ticks(5));

    g.selectAll<d3.BaseType, (typeof data)[number]>("circle")
      .data(data, (d) => d.name)
      .join("circle")
      .transition()
      .duration(animation)
      .attr("cx", (d) => x(d.x))
      .attr("cy", (d) => y(d.y))
      .attr("r", () => 5)
      .attr("fill", "#4f46e5");
  }, [data, width, height, inner]);

  return (
    <div>
      <p>Hi hi</p>
      <svg ref={svgRef} width={width + 50} height={height + 50} />
    </div>
  );
};

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

const EchartsFlicker = () => {
  const data$ = useMemo(() => DataFlicker.stream, []);
  const data = rc.useStream(data$, DataFlicker.dataA);

  return (
    <div style={{ width: "500px", height: "500px" }}>
      <EchartsBasic
        dataset={data}
        dimensions={["x", "y", "z", "name"]}
        encode={{ x: "x", y: "y" }}
      />
    </div>
  );
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

namespace KeyStack {
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

  export const keystrokeToString = (e: React.KeyboardEvent) =>
    [
      e.ctrlKey ? "C-" : "",
      e.metaKey ? "D-" : "", // Command key
      e.altKey ? "M-" : "", // Alt/Meta key
      e.key,
    ].join("");

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

  /* export const hasKeymap = (name: string) =>
*   keymaps.find((x) => x.name === name) !== undefined;

* export const setKeymap = (name: string, keymap: Keymap | null) => {
*   clear();
*   keymaps = keymaps.filter((x) => x.name !== name);
*   if (keymap !== null) keymaps.push({ name, keymap });
*   merged = Object.assign(
*     {},
*     ...keymaps.map((map) =>
*       c.mapValues(map.keymap, (cmd) =>
*         c.id({
*           keymap: map.name,
*           ...cmd,
*         }),
*       ),
*     ),
*   );
* }; */
}

namespace GrammarGraph {
  export type Action = Data.TaggedEnum<{
    ShowTooltip: { dataId: number };
    HideTooltip: {};
  }>;

  export type DimensionMapping<T extends string = string> = {
    x?: T;
    y?: T;
    z?: T;
    color?: T;
    size?: T;
    symbol?: T;
    facet:
      | { type: "wrap"; var: T }
      | { type: "grid"; rowVar?: T; colVar?: T }
      | undefined;
  };

  const Comp = <T extends string>(props: {
    data: Record<T, string | number>[];
    dimensionMapping: DimensionMapping<T>;
    controlRef?: Ref<(a: Action) => void>;
  }) => {
    const ref = useRef<echarts.ECharts | null>(null);

    useImperativeHandle(props.controlRef, () => (a: Action) => {}, []);
  };
}

interface Nav<T extends string = string> {
  maxRow: number;
  visibleColumns: Column<T>[];
  rowIdx: number;
  colIdx: number;
  dimensionsMapping: GrammarGraph.DimensionMapping<T>;
  setDimensionsMapping: (a: GrammarGraph.DimensionMapping<T>) => void;
  focusCell: (row: number, col: number) => void;
}

namespace Nav {
  export const useNav = (
    table: Table<any>,
    onFocusCell: (a: { rowIdx: number; colIdx: number }) => void,
  ) => {
    const [cursor, setCursor] = useState({ rowIdx: 0, colIdx: 0 });
    const cursorRef = rc.useLatest(cursor);

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
      const rowIdx = c.clamp(cur.rowIdx + dr, 0, rCount);
      const colIdx = c.clamp(cur.colIdx + dc, 0, cCount);
      go(rowIdx, colIdx);
    };

    return {
      cursor,
      goAbs,
      goRel,
    };
  };

  const goRel = (t: () => Nav, dr: number, dc: number) => () =>
    t().focusCell(
      c.clamp(t().rowIdx + dr, 0, t().maxRow),
      c.clamp(t().colIdx + dc, 0, t().visibleColumns.length - 1),
    );
  const goAbs = (t: () => Nav, r_?: number, c_?: number) => () =>
    t().focusCell(
      r_ !== undefined ? c.posMod(r_, t().maxRow + 1) : t().rowIdx,
      c_ !== undefined ? c.posMod(c_, t().visibleColumns.length) : t().colIdx,
    );

  const colName = <T extends string>(t: Nav<T>) =>
    t.visibleColumns[t.colIdx].id as T;

  type SimpleMapping = "x" | "y" | "z" | "color" | "size" | "symbol";

  const getMap = <T extends string>(t: Nav<T>, ks: SimpleMapping[]) =>
    ks.map((k) => t.dimensionsMapping[k]);

  const setMap = <T extends string>(t: Nav<T>, k: SimpleMapping, v: T | null) =>
    t.setDimensionsMapping(
      c.copyAndModify(t.dimensionsMapping, (d) => {
        if (v === null) delete d[k];
        else d[k] = v;
      }),
    );

  const checkAndSet = <T extends string>(
    t: Nav<T>,
    val: T,
    to: SimpleMapping,
    check: SimpleMapping[],
  ) => {
    if (!getMap(t, check).find((x) => x === colName(t)))
      setMap<T>(t, to, colName(t));
  };

  const keymapForSimpleTable = (t: () => Nav) => {
    const moves: Record<string, () => void> = {
      h: goRel(t, 0, -1),
      ArrowLeft: goRel(t, 0, -1),
      l: goRel(t, 0, 1),
      ArrowRight: goRel(t, 0, 1),
      j: goRel(t, 1, 0),
      ArrowDown: goRel(t, 1, 0),
      k: goRel(t, -1, 0),
      ArrowUp: goRel(t, -1, 0),
      "0": goAbs(t, undefined, 0),
      Home: goAbs(t, undefined, 0),
      $: goAbs(t, undefined, -1),
      End: goAbs(t, undefined, -1),
      G: goAbs(t, -1, undefined),
      "g g": goAbs(t, 0, undefined),
    };

    return;
  };
}

const data = DataFlicker.dataA;
const columns = Object.keys(data[0]).map((s) =>
  c.id({ accessorKey: s, header: s }),
);

export default function SimpleTable() {
  const data$ = useMemo(() => DataFlicker.stream, []);
  const data = rc.useStream(data$, DataFlicker.dataA);

  const ref = useRef<echarts.ECharts | null>(null);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  /* const [cursor, setCursor] = useState({ rowIndex: 0, colIndex: 0 }); */


  const onFocusCell = useMemo(
    () => (cord: { rowIdx: number; colIdx: number }) => {
      if (tipOnFocus.current)
        ref.current?.dispatchAction({
          type: "showTip",
          seriesIndex: 0,
          dataIndex: cord.rowIdx,
        });
    },
    [data],
  );

  const { goAbs, goRel, cursor } = Nav.useNav(table, onFocusCell);

  const focusCell = useMemo(
    () => (row: number, col: number) => {
      /* setCursor({ rowIndex: row, colIndex: col }); */
      goAbs(row, col)
      if (tipOnFocus.current)
        ref.current?.dispatchAction({
          type: "showTip",
          seriesIndex: 0,
          dataIndex: row,
        });
    },
    [data],
  );



  const [encode, setEncode] = useState({ x: "x", y: "y" } as Record<
    "x" | "y",
    string
  > &
    Partial<Record<"z" | "c" | "s", string>>);
  const dimensions = useMemo(() => ["x", "y", "z", "name"], []);

  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();

  const mkNav = () => {
    const maxRow = rows.length - 1;
    const maxCol = visibleColumns.length - 1;

    const goRel = (dr: number, dc: number) => () => {
      focusCell(
        c.clamp(cursor.rowIdx + dr, 0, maxRow),
        c.clamp(cursor.colIdx + dc, 0, maxCol),
      );
    };
    const goAbs = (r_?: number, c_?: number) => () => {
      focusCell(
        r_ !== undefined ? c.posMod(r_, maxRow + 1) : cursor.rowIdx,
        c_ !== undefined ? c.posMod(c_, maxCol + 1) : cursor.colIdx,
      );
    };
    return { goRel, goAbs, maxRow, maxCol, cursor, visibleColumns, encode };
  };

  const nav = useRef(mkNav());
  nav.current = mkNav();
  const tipOnFocus = useRef(true);

  const cellKey = (row: number, col: number) => `${row}:${col}`;


  const keystack = useMemo(() => {
    type TMP = "x" | "y" | "z" | "c" | "s";
    const n = () => nav.current;
    /* const goRel = (a: number, b: number) => () => nav.current.goRel(a, b)(); */
    const goAbs = (a?: number, b?: number) => () => nav.current.goAbs(a, b)();
    const colName = () => columns[n().cursor.colIdx].header;
    const getEncode = (ks: TMP[]) => ks.map((k) => n().encode[k]);
    const setEncode_ = (k: TMP, v: string | null) =>
      setEncode(
        c.copyAndModify(n().encode, (d) => {
          if (v === null) delete d[k];
          else d[k] = v;
        }),
      );
    const checkAndSet = (val: string, to: TMP, check: TMP[]) => {
      if (!getEncode(check).find((x) => x === colName()))
        setEncode_(to, colName());
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
      "0": goAbs(undefined, 0),
      Home: goAbs(undefined, 0),
      $: goAbs(undefined, -1),
      End: goAbs(undefined, -1),
      G: goAbs(-1, undefined),
      "g g": goAbs(0, undefined),
      "]": () =>
        n().visibleColumns[n().cursor.colIdx].toggleSorting(true, false),
      "[": () =>
        n().visibleColumns[n().cursor.colIdx].toggleSorting(false, false),
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
      ...KeyStack.empty(),
      keymap: c.mapValues(moves, (command) =>
        c.id({ command, name: "unnamed" }),
      ),
    };
  }, []);

  const handleKeyDown = useMemo(
    () => (e: KeyboardEvent<HTMLTableCellElement>) => {
      if (KeyStack.presentKey(keystack, KeyStack.keystrokeToString(e)))
        e.preventDefault();
    },
    [cursor, rows.length, visibleColumns.length, focusCell],
  );

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
      <table>
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
          {table.getRowModel().rows.map((row, rId) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell, cId) => (
                <td
                  id={cellKey(rId, cId)}
                  tabIndex={-1}
                  key={cell.id}
                  className={
                    rId === cursor.rowIdx && cId === cursor.colIdx
                      ? "selected"
                      : ""
                  }
                  onFocus={() => focusCell(rId, cId)}
                  onKeyDown={handleKeyDown}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
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
