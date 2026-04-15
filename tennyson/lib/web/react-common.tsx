import * as c from "tennyson/lib/core/common";

import { useRef } from "react";
import type { JSX, ReactNode, RefObject } from "react";
import React, { useState, useLayoutEffect, useEffect, useMemo } from "react";

import * as rx from "rxjs";

import * as echarts from "echarts";
import {
  useReactTable,
  createColumnHelper,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import "echarts-gl";

import { Effect, Either, Option, pipe, Stream, Fiber } from "effect";

export function EChart(props: {
  option: echarts.EChartsOption;
  ref?: RefObject<echarts.ECharts | null> | undefined;
  onClickEvent?: ((e: echarts.ECElementEvent) => void) | undefined;
}) {
  const { option } = props;
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || chartInstance.current) return;

    chartInstance.current = echarts.init(chartRef.current);
    if (props.ref) props.ref.current = chartInstance.current;

    const resizeObserver = new ResizeObserver(() => {
      if (chartInstance.current && !chartInstance.current.isDisposed())
        chartInstance.current.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartInstance.current && !chartInstance.current.isDisposed()) {
        chartInstance.current.dispose();
        chartInstance.current = null;
        if (props.ref) props.ref.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const chart = chartInstance.current;
    const handler = props.onClickEvent;
    if (!chart || !handler) return;
    chart.on("click", handler);

    return () => {
      if (!chart.isDisposed()) chart.off("click", handler);
    };
  }, [props.onClickEvent, chartInstance.current]);

  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart) return;
    chart.setOption(option, { replaceMerge: ["visualMap"] });
  }, [option, chartInstance.current]);

  return <div style={{ height: "100%", width: "100%" }} ref={chartRef} />;
}

export function usePromise<T>(
  promise: Promise<T>,
): Option.Option<Either.Either<T, any>> {
  const [state, setState] = useState(
    Option.none() as Option.Option<Either.Either<T, any>>,
  );
  useEffect(() => {
    promise
      .then((val) => setState(Option.some(Either.right(val))))
      .catch((err) => setState(Option.some(Either.left(err))));
  }, [promise]);

  return state;
}

export function useSafePromise<T>(promise: Promise<T>): Option.Option<T> {
  const res = usePromise(promise);
  return Option.map(res, Either.getOrThrow);
}

export function useEffectTS<A, B>(
  effect: Effect.Effect<A, B>,
): Option.Option<Either.Either<A, B>> {
  const promise = useMemo(
    () => effect.pipe(Effect.either, Effect.runPromise),
    [effect],
  );

  return useSafePromise(promise);
}

export function useStream<T>(
  stream: Stream.Stream<T, never, never>,
  initialValue: T,
): T {
  const [value, setValue] = useState<T>(initialValue);

  useLayoutEffect(() => {
    const fiber = Effect.runFork(
      pipe(
        stream,
        Stream.runForEach((value) => Effect.sync(() => setValue(value))),
      ),
    );

    return () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [stream]);

  return value;
}

export function PromiseResolver<T>(props: {
  promise: Promise<T>;
  children: (data: T) => ReactNode;
}) {
  const { promise, children } = props;
  const [{ data, error }, setState] = useState({
    data: null as null | T,
    error: null as null | Error,
  });

  useLayoutEffect(() => {
    let isMounted = true;
    setState({ data: null, error: null });

    promise
      .then((data) => {
        if (isMounted) setState({ data: data, error: null });
      })
      .catch((error) => {
        if (isMounted) setState({ data: null, error: error });
      });

    return () => {
      isMounted = false;
    };
  }, [promise]);

  if (error !== null)
    return <div>Error: {error?.message || "Something went wrong"}</div>;
  else if (data !== null) return children(data);
  else return <div>Loading...</div>;
}

export function useObservable<T>(
  source$: rx.Observable<T>,
  initialValue: T,
): T {
  const [value, setValue] = useState<T>(initialValue);

  useLayoutEffect(() => {
    const subscription = source$.subscribe({
      next: (x) => {
        setValue(x);
      },
      error: (error) => console.error("Observable error:", error),
    });

    return () => subscription.unsubscribe();
  }, [source$]);

  return value;
}

/* export function useConstWithCleanup<T>(
 *   create: () => T,
 *   cleanup: (obj: T) => void,
 * ) {
 *   const ref = useRef<T>(null);
 *
 *   useEffect(() => {
 *     ref.current = create();
 *     return () => cleanup(ref.current as T);
 *   }, []);
 *
 *   return ref.current as T;
 * } */

export function BasicTable<T>({
  data,
  columns,
  maxRows,
}: {
  data: T[];
  columns: readonly (keyof T & string)[];
  maxRows?: number;
}) {
  maxRows = maxRows ?? 2000;

  const columnHelper = createColumnHelper<T>();
  const columns_ = columns.map((x) => columnHelper.accessor(x as any, {}));

  const table = useReactTable({
    data,
    columns: columns_,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="p-2">
      {table.getRowModel().rows.length > maxRows && (
        <div className="mb-2 text-sm text-gray-600">
          Displaying {maxRows} of {table.getRowModel().rows.length} rows
        </div>
      )}
      <table className="trade-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table
            .getRowModel()
            .rows.slice(0, maxRows)
            .map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function useCounter() {
  const [state, setState] = useState(0);
  const inc = setState(c.inc);
  return [state, inc];
}

export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useStateAndLatest<T>(value: T) {
  const [state, setState] = useState(value);
  const latest = useLatest(state);
  return [state, setState, latest] as const;
}

export function stringToColor(str: string): string {
  let hash = 77;

  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x45d9f3b);
  hash ^= hash >>> 16;

  const hue = ((hash % 360) + 360) % 360; // 0–359
  return `hsl(${hue}, 70%, 50%)`;
}
