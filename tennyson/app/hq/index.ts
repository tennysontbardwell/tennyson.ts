import * as common from "tennyson/lib/core/common";
import * as d3 from 'd3';

console.log("test test test");

var svg = d3.select("#dataviz_area")
svg.append("circle")
  .attr("cx", 2).attr("cy", 2).attr("r", 40).style("fill", "blue");
svg.append("circle")
  .attr("cx", 140).attr("cy", 70).attr("r", 40).style("fill", "red");
svg.append("circle")
  .attr("cx", 300).attr("cy", 100).attr("r", 40).style("fill", "green");
