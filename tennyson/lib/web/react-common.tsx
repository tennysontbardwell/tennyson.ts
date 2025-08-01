import { useRef } from 'react';
import type { ReactNode } from 'react';
import React, { useState, useEffect, useMemo } from 'react';
import * as echarts from 'echarts';
import { useReactTable, createColumnHelper, getCoreRowModel, flexRender }
  from '@tanstack/react-table';


export function EChart(props: {option: echarts.EChartsOption}) {
  const { option } = props;
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || chartInstance.current)
      return;

    chartInstance.current = echarts.init(chartRef.current);

    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (chartInstance.current && option) {
      chartInstance.current.setOption(option, true);
    }
  }, [option, chartInstance]);

  return (
    <div style={{ height: "100%", width: "100%" }} ref={chartRef} />
  );
}

export function PromiseResolver<T>(
  props: { promise: Promise<T>, children: (data: T) => ReactNode }) {
  const { promise, children } = props;
  const [{ data, error }, setState] =
    useState({
      data: null as null | T,
      error: null as null | Error,
    });

  useEffect(() => {
    let isMounted = true;
    setState({ data: null, error: null });

    promise
      .then(data => {
        if (isMounted)
          setState({ data: data, error: null });
      })
      .catch(error => {
        if (isMounted)
          setState({ data: null, error: error });
      });

    return () => { isMounted = false; };
  }, [promise]);

  if (error !== null)
    return <div>Error: {error?.message || 'Something went wrong'}</div>;
  else if (data !== null)
    return children(data);
  else
    return <div>Loading...</div>;
}

export function BasicTable<T>(
  props: { data: T[], columns: readonly (keyof T & string)[] }
) {
  const { data, columns } = props;

  const columnHelper = createColumnHelper<T>()
  const columns_ = columns.map(x => columnHelper.accessor(x as any, {}))

  const table = useReactTable({
    data,
    columns: columns_,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="p-2">
      {table.getRowModel().rows.length > 2000 && (
        <div className="mb-2 text-sm text-gray-600">
          Displaying 2000 of {table.getRowModel().rows.length} rows
        </div>
      )}
      <table className="trade-table">
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.slice(0, 2000).map(row => (
            <tr key={row.id}>
              {row.getVisibleCells().map(cell => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
