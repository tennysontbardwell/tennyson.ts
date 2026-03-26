import * as c from "tennyson/lib/core/common";
import * as rc from "tennyson/lib/web/react-common";

import { Stream, Schedule, SubscriptionRef, pipe, Data } from "effect";

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
  facet?:
    | { type: "wrap"; var: T }
    | { type: "grid"; rowVar?: T; colVar?: T }
    | undefined;
};

export const Comp = <T extends string>(props: {
  data: readonly Record<T, string | number>[];
  dimensions: readonly T[];
  dimensionMapping: DimensionMapping<T>;
  controlRef?: Ref<(a: Action) => void>;
}) => {
  const ref = useRef<echarts.ECharts | null>(null);
  const mapping = props.dimensionMapping;
  const is3D = mapping.z !== undefined;

  const x: echarts.EChartsOption = useMemo(
    () =>
      c.id({
        animationDuration: 0,
        animationDurationUpdate: 0,
        /* grid: */
        /* mapping.c || mapping.s
         *   ? {
         *       right: 50,
         *     }
         *   : {right: 50}, */
        ...(is3D
          ? {
              xAxis3D: { name: mapping.x, type: "value" },
              yAxis3D: { name: mapping.y, type: "value" },
              zAxis3D: { name: mapping.z, type: "value" },
              grid3D: {
                viewControl: {
                  projection: "orthographic",
                  autoRotate: true,
                  autoRotateSpeed: 3,
                },
              },
            }
          : {
              xAxis: { name: mapping.x, type: "value" },
              yAxis: { name: mapping.y, type: "value" },
            }),
        dataset: {
          dimensions: props.dimensions,
          source: props.data,
        },
        visualMap: [
          ...(mapping.color !== undefined
            ? [
                {
                  min: Math.min(
                    ...props.data.map((d: any) => d[mapping.color!]),
                  ),
                  max: Math.max(
                    ...props.data.map((d: any) => d[mapping.color!]),
                  ),
                  orient: "vertical",
                  /* right: 0, */
                  top: "center",
                  dimension: mapping.color,
                  calculable: true,
                  inRange: {
                    color: ["#121122", "rgba(3,4,5,0.4)", "red"],
                  },
                },
              ]
            : []),
          ...(mapping.size !== undefined
            ? [
                {
                  min: Math.min(
                    ...props.data.map((d: any) => d[mapping.size!]),
                  ),
                  max: Math.max(
                    ...props.data.map((d: any) => d[mapping.size!]),
                  ),
                  orient: "vertical",
                  /* right: 0, */
                  top: "top",
                  dimension: mapping.size,
                  calculable: true,
                  inRange: {
                    symbolSize: [5, 20],
                  },
                },
              ]
            : []),
        ],
        dataZoom: [
          {
            type: "slider",
            xAxisIndex: 0,
            filterMode: "none",
          },
          {
            type: "slider",
            yAxisIndex: 0,
            filterMode: "none",
          },
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
              x: mapping.x,
              y: mapping.y,
              ...(is3D ? { z: mapping.z } : {}),
            },
          },
        ],
      } as any),
    [props.data, props.dimensions, mapping],
  );

  useImperativeHandle(
    props.controlRef,
    () => (a: Action) => {
      if (a._tag === "ShowTooltip")
        ref.current?.dispatchAction({
          type: "showTip",
          seriesIndex: 0,
          dataIndex: a.dataId,
        });
      else if (a._tag === "HideTooltip")
        ref.current?.dispatchAction({
          type: "hideTip",
        });
      else c.unreachable(a);
    },
    [],
  );

  return <rc.EChart option={x} is3D={is3D} ref={ref} />;
};
