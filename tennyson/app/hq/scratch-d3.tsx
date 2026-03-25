import * as c from "tennyson/lib/core/common";
import * as rc from "tennyson/lib/web/react-common";

import {DataFlicker, oneKRows} from './scratch-test-data'

import * as d3 from "d3";

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
