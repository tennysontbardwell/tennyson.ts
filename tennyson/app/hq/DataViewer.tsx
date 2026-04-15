import * as c from "tennyson/lib/core/common";
import * as rc from "tennyson/lib/web/react-common";

import * as keystack from "./keystack";
import * as gg from "./GrammarGraph";

import JsonView from "react18-json-view";
import "react18-json-view/src/style.css";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFacetedMinMaxValues,
  type Column,
  type Table,
} from "@tanstack/react-table";

import { useState, useRef, useMemo, type KeyboardEvent } from "react";
import { KeyboardTable } from "./KeyboardTable";

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

export function DataViewer<Dims extends string>(props: {
  data: Record<Dims, string | number>[];
  initialMapping: gg.DimensionMapping<Dims>;
}) {
  const { data } = props;

  const controlRef = useRef<((a: gg.Action) => void) | null>(null);

  const [format, setFormat] = useState(
    {} as Partial<
      Record<
        Dims,
        (a: string | number) => {
          text?: string | number;
          background?: string;
        }
      >
    >,
  );

  const { dimensions, columns } = useMemo(() => {
    const dimensions = Object.keys(data[0]) as Dims[];
    const columns = Object.keys(data[0]).map((s) => ({
      accessorKey: s,
      header: s,
      id: s,
    }));
    return { dimensions, columns };
  }, [data]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
  });

  const tipOnFocus = useRef(false);
  const tipRow = (row: number | null) => {
    if (row === null) controlRef.current?.({ _tag: "HideTooltip" });
    else
      controlRef.current?.({
        _tag: "ShowTooltip",
        dataId: table.getRowModel().rows[row].index,
      });
  };

  const [wrapFocusedRow, setFocusedRow] = useState(false);
  const [showGraph, setShowGraph] = useState(true);
  const [showTable, setShowTable] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [useGL, setUseGL] = useState(false);
  const [freq, setFreq] = useState(null as string | null);
  const pageSize = rc.useLatest(showGraph ? 11 : 31);

  const onFocusCell = useMemo(
    () => (cord: { rowIdx: number; colIdx: number }) => {
      if (tipOnFocus.current) tipRow(cord.rowIdx);
    },
    [data],
  );

  const { goAbs, goRel, cursor, cursorRef } = Nav.useNav(table, onFocusCell);
  const [refreshIdx, setRefreshIdx, refreshIdxRef] = rc.useStateAndLatest(0);
  const [dimMapping, setDimMapping] = useState<gg.DimensionMapping<Dims>>(
    props.initialMapping,
  );

  const setOneDimMapping = useMemo(
    () => (k: Exclude<keyof gg.DimensionMapping, "facet">, v: Dims | null) =>
      setDimMapping((state: gg.DimensionMapping<Dims>) => {
        if (["x", "y"].includes(k) && v === null) return state;
        const state_ = c.copyAndModify(state, (d) => {
          if (v === null) delete d[k];
          else d[k] = v;
        });
        if (
          state_.x == state_.y ||
          state_.x == state_.z ||
          state_.y == state_.z
        )
          return state;
        return state_;
      }),
    [setDimMapping],
  );

  const keystack_ = useMemo(() => {
    const cur = () => cursorRef.current;
    const curCol = () =>
      table.getVisibleLeafColumns()[cursorRef.current.colIdx];
    const colName = () => curCol().id;
    const setFormat_ = (
      fn:
        | undefined
        | ((a: string | number) => {
            text?: string | number;
            background?: string;
          }),
    ) =>
      setFormat((format) =>
        c.stripUndefined({
          ...format,
          [colName()]: fn,
        }),
      );
    const setFormatText = (
      fn: undefined | ((a: string | number) => string | number),
    ) => {
      setFormat_(fn ? (a: string | number) => ({ text: fn(a) }) : undefined);
    };
    const setFormatBackground = (
      fn: undefined | ((a: string | number) => string),
    ) => {
      setFormat_(
        fn ? (a: string | number) => ({ background: fn(a) }) : undefined,
      );
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
      "g h": () => goAbs(undefined, 0),
      "g l": () => goAbs(undefined, -1),
      "]": () =>
        table.getVisibleLeafColumns()[cur().colIdx].toggleSorting(true, false),
      "[": () =>
        table.getVisibleLeafColumns()[cur().colIdx].toggleSorting(false, false),
      "C-d": () => goRel(Math.floor(pageSize.current / 2), 0),
      "C-u": () => goRel(-Math.floor(pageSize.current / 2), 0),
      "s x": () => setOneDimMapping("x", colName() as Dims),
      "s y": () => setOneDimMapping("y", colName() as Dims),
      "s z": () => setOneDimMapping("z", colName() as Dims),
      "s c": () => setOneDimMapping("color", colName() as Dims),
      "s s": () => setOneDimMapping("size", colName() as Dims),
      "c x": () => setOneDimMapping("x", null),
      "c y": () => setOneDimMapping("y", null),
      "c z": () => setOneDimMapping("z", null),
      "c c": () => setOneDimMapping("color", null),
      "c s": () => setOneDimMapping("size", null),
      "g r": () => {
        setDimMapping(props.initialMapping);
        setRefreshIdx(refreshIdxRef.current + 1);
        setFormat({});
      },
      r: () => setRefreshIdx(refreshIdxRef.current + 1),
      "g t": () => tipRow(cursorRef.current.rowIdx),
      "g T": () => tipRow(null),
      "t t": () => {
        tipOnFocus.current = !tipOnFocus.current;
        if (tipOnFocus.current) tipRow(cursorRef.current.rowIdx);
        else tipRow(null);
      },
      "t f": () => setUseGL(c.not),
      "t s": () => setAutoRotate(c.not),
      "t e": () => setFocusedRow(c.not),
      "SPC t g": () => setShowGraph(c.not),
      "SPC t t": () => setShowTable(c.not),
      "f s": () => setFormatText(c.compose(c.formatSI, Number)),
      "f c": () => setFormatText(undefined),
      "f r": () => setFormatText(c.const_("<redacted>")),
      "f f": () =>
        setFormatBackground((a: string | number) =>
          rc.stringToColor(a.toString()),
        ),
      "f z": () => {
        const col = colName();
        const vals = table
          .getRowModel()
          .rows.map((row) => row.getValue(col) as number);
        const mean = c.mean(vals);
        const stddev = c.stddev(vals);
        setFormatText((a: string | number) =>
          ((Number(a) - mean) / stddev).toFixed(3),
        );
      },
      "f v": () => {
        const x = curCol().getFacetedMinMaxValues();
        if (!x) return;
        const [min, max] = x;
        const range = max - min;
        if (!range) return;
        setFormatBackground((i) => {
          const percentage = (100 * (Number(i) - min)) / range;
          return `linear-gradient(
              to right,
              rgba(59, 130, 246, 0.25) ${percentage}%,
              transparent ${percentage}%
            )`;
        });
      },
      F: () => setFreq((freq) => (freq === colName() ? null : colName())),
    };

    return {
      ...keystack.empty(),
      keymap: c.mapValues(moves, (command) =>
        c.id({ command, name: "unnamed" }),
      ),
    };
  }, []);

  const handleKeyDown = useMemo(
    () => (e: KeyboardEvent<any>) => {
      const key = keystack.keystrokeToString(e);
      if (key && keystack.presentKey(keystack_, key)) e.preventDefault();
    },
    [],
  );

  const handleGraphClick = useMemo(
    () => (e: echarts.ECElementEvent) => {
      if (e.dataIndex)
        goAbs(
          table.getRowModel().rows.findIndex((r) => r.index === e.dataIndex),
        );
    },
    [],
  );

  const frequency = useMemo(() => {
    if (freq === null) return {};
    const counts = {} as Record<KeyType, number>;
    table.getRowModel().rows.forEach((row) => {
      const k = row.getValue(freq) as KeyType;
      counts[k] = (counts[k] ?? 0) + 1;
    });

    const res = c.pipe(
      counts,
      Object.entries,
      (x) => x.sort((a, b) => a[1] - b[1]),
      (x) => x.reverse(),
    );
    if (res.length > 50)
      return {
        common: Object.fromEntries(res.slice(0, 10)),
        rare: Object.fromEntries(res.slice(-10)),
        all: Object.fromEntries(res),
      };
    else return Object.fromEntries(res);
  }, [freq, data]);

  return (
    <div tabIndex={-1} onKeyDown={handleKeyDown}>
      <div
        style={{
          width: "1200px",
          height: showTable ? "600px" : "850px",
          display: showGraph && freq === null ? "block" : "none",
        }}
      >
        <gg.Comp
          key={refreshIdx}
          data={data}
          dimensions={dimensions}
          dimensionMapping={dimMapping}
          controlRef={controlRef}
          onClickEvent={handleGraphClick}
          autoRotate={autoRotate}
          useGL={useGL}
        />
      </div>
      {freq === null ? (
        <></>
      ) : (
        <div style={{ width: "1200px", height: "600px", overflow: "scroll" }}>
          <JsonView
            src={frequency}
            collapsed={(x) => x.size > 30}
            collapseObjectsAfterLength={300}
          />
        </div>
      )}
      <div style={{ display: showTable ? "block" : "none" }}>
        <KeyboardTable
          table={table}
          cursor={cursor}
          wrapFocusedRow={wrapFocusedRow}
          goAbs={goAbs}
          format={format}
          pageSize={pageSize.current}
        />
      </div>
    </div>
  );
}
