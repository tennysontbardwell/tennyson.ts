import * as c from "tennyson/lib/core/common";
import * as rc from "tennyson/lib/web/react-common";

import * as keystack from "./keystack";
import * as gg from "./GrammarGraph";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
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

  const { dimensions, columns } = useMemo(() => {
    const dimensions = Object.keys(data[0]) as Dims[];
    const columns = Object.keys(data[0]).map((s) =>
      c.id({ accessorKey: s, header: s }),
    );
    return { dimensions, columns };
  }, [data]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tipOnFocus = useRef(false);
  const tipRow = (row: number | null) => {
    if (row === null) controlRef.current?.({ _tag: "HideTooltip" });
    else controlRef.current?.({ _tag: "ShowTooltip", dataId: row });
  };

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
    const colName = () =>
      table.getVisibleLeafColumns()[cursorRef.current.colIdx].id;

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
      "C-d": () => goRel(5, 0),
      "C-u": () => goRel(-5, 0),
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
      },
      r: () => setRefreshIdx(refreshIdxRef.current + 1),
      "SPC t": () => tipRow(cursorRef.current.rowIdx),
      "t t": () => {
        tipOnFocus.current = !tipOnFocus.current;
        if (tipOnFocus.current) tipRow(cursorRef.current.rowIdx);
        else tipRow(null);
      },
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
      if (keystack.presentKey(keystack_, keystack.keystrokeToString(e)))
        e.preventDefault();
    },
    [],
  );

  return (
    <div tabIndex={-1} onKeyDown={handleKeyDown}>
      <div style={{ width: "1200px", height: "600px" }}>
        <gg.Comp
          key={refreshIdx}
          data={data}
          dimensions={dimensions}
          dimensionMapping={dimMapping}
          controlRef={controlRef}
        />
      </div>
      <KeyboardTable table={table} cursor={cursor} goAbs={goAbs} />
    </div>
  );
}
