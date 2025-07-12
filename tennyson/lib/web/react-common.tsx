import { useRef } from 'react';
import React, { useState, useEffect, ReactNode, useMemo } from 'react';
import * as echarts from 'echarts';

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
    // TODO remove this style
    <div style={{ height: "100vh", width: "100%" }} ref={chartRef} />
  );
}

export function PromiseResolver<T>(
  props: { promise: Promise<T>, children: (data: T) => ReactNode })
{
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
