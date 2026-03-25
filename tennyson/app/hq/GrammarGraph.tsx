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
