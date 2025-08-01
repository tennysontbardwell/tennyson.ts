import * as common from "tennyson/lib/core/common";
import * as d3 from 'd3';
import React, { useState, useEffect } from 'react';
import {useRef} from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import {fetchFileSystem} from './ItemDisplay';
import type { RangerItem } from './Ranger';
import { Ranger } from './Ranger';
import * as echarts from 'echarts';

const tooltip = d3.select("body")
  .selectAll("#tooltip")
  .data([null])
  .join("div")
  .attr("id", "tooltip")
  .attr("class", "tooltip");

var svg1 = d3.select("#dataviz_area")
svg1.append("circle")
  .attr("cx", 2).attr("cy", 2).attr("r", 40).style("fill", "blue");
svg1.append("circle")
  .attr("cx", 140).attr("cy", 70).attr("r", 40).style("fill", "red");
svg1.append("circle")
  .attr("cx", 300).attr("cy", 100).attr("r", 40).style("fill", "green");

const margin = { top: 20, bottom: 40, left: 30, right: 20 };
const width = 800 - margin.left - margin.right;
const height = 600 - margin.top - margin.bottom;

// Creates sources <svg> element
const svg = d3
  .select("body")
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom);

// Group used to enforce margin
const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

const data = [
  {
    name: "Steve",
    age: 10,
    weight: 30,
    gender: "male",
  },
  {
    name: "Stan",
    age: 15,
    weight: 60,
    gender: "male",
  },
  {
    name: "Tom",
    age: 18,
    weight: 70,
    gender: "male",
  },
  {
    name: "Marie",
    age: 18,
    weight: 58,
    gender: "female",
  },
];

const color = d3.scaleOrdinal<"red"|"blue">().domain(["female", "male"]).range(["red", "blue"]);
const xscale = d3
  .scaleLinear()
  .domain([0, d3.max(data, (d) => d.age)!])
  .range([0, width]);
const yscale = d3
  .scaleLinear()
  .domain([0, d3.max(data, (d) => d.weight)!])
  .range([height, 0]);

const xaxis = d3.axisBottom(xscale).scale(xscale);
const yaxis = d3.axisLeft(yscale).scale(yscale);

g.append("g").classed("x.axis", true).attr("transform", `translate(0,${height})`).call(xaxis);
g.append("g").classed("y.axis", true).call(yaxis);
const group = g.append("g");

const marks = group
  .selectAll("circle")
  .data(data)
  .join(
    (enter) => {
      const marks_enter = enter.append("circle");
      marks_enter.attr("r", 5).append("title");
      return marks_enter;
    },
    (update) => update,
    (exit) => exit.remove()
  ).on("mouseover", function (event, d) {
    // Show tooltip
    tooltip
      .classed("visible", true)
      .html(`
          <strong>${d.name}</strong><br/>
          Age: ${d.age} years<br/>
          Weight: ${d.weight} lbs<br/>
          Gender: ${d.gender}
        `)
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 10) + "px");

    // Optional: highlight the circle
    d3.select(this)
      // .transition()
      // .duration(100)
      .attr("r", 7)
      .style("stroke", "black")
      .style("stroke-width", 2);
  }).on("mousemove", function (event, d) {
    // Update tooltip position as mouse moves
    tooltip
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 10) + "px");
  })
  .on("mouseout", function (event, d) {
    // Hide tooltip
    tooltip.classed("visible", false);

    // Reset circle appearance
    d3.select(this)
      // .transition()
      // .duration(100)
      .attr("r", 5)
      .style("stroke", "none");
  });

marks
  .style("fill", (d) => color(d.gender))
  .attr("cx", (d) => xscale(d.age))
  .attr("cy", (d) => yscale(d.weight));

marks.select("title").text((d) => d.name);

let items = [
  "thing 1",
  "thing 2",
  "thing 3",
  "thing 4",
  "thing 5",
];

let lst = d3.select("body")
  .append("li")
  .data(items)

// Find the root element from the HTML
const rootElement = document.getElementById('root');

let option = {
  xAxis: {
    type: 'category',
    data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  yAxis: {
    type: 'value'
  },
  series: [
    {
      data: [150, 230, 224, 218, 135, 147, 260],
      type: 'line',
      animationDuration: 200,
    }
  ]
};

let myManualChart = echarts.init(document.getElementById("manual-chart"));
myManualChart.setOption(option);

function Echart() {
  const ref: React.RefObject<null | HTMLDivElement> = useRef(null);

  useEffect(() => {
    let myChart = echarts.init(ref.current!);
    myChart.setOption(option);
  });

  return (
    <div style={{ height: "200px", width: "400px" }} ref={ref} />
  )
}

let sublist = (prefix: string): Array<RangerItem> => [
  {
    name: prefix + "A",
    subitems: async () => sublist(prefix + "A"),
    display: () => <App />
  },
  {
    name: prefix + "B",
    subitems: async () => sublist(prefix + "B"),
    display: () => <App />
  },
  {
    name: prefix + "C",
    subitems: async () => sublist(prefix + "C"),
    display: () => <Echart />
  },
]

// Ensure the element exists before trying to render
if (rootElement) {
  // Create a React root and render the App component
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
    <App />
    <Echart />
    <Ranger items={sublist("")} />
    <br/>
    </React.StrictMode>
  );
} else {
  console.error('Failed to find the root element');
}
