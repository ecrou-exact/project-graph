---
title: "Projects linked to Rulezet"
description: "How Rulezet connects to the other projects of its ecosystem. Arrow = who calls or uses whom. Checked against the code of each project (September 2026)."
graph:
  linkDistance: 330
  nodeTypes:
    project:
      label: "Project"
      color: "transparent"
      shape: "circle"
      size: 44
      imageFit: "contain"
      borderWidth: 0
      labelBackground: "none"
      labelSize: 17
      labelFont: "sans"
  edgeTypes:
    consumes:
      label: "uses Rulezet"
      color: "#3b63f3"
      width: 2
      direction: "forward"
      labelSize: 13
      labelColor: "#ffffff"
      labelBackground: "#3b63f3"
      labelFont: "sans"
    uses:
      label: "uses"
      color: "#0f9d8a"
      width: 2
      direction: "forward"
      labelSize: 13
      labelColor: "#ffffff"
      labelBackground: "#0f9d8a"
      labelFont: "sans"
---

Each project below is a page of this site. Its front matter describes it (`graph`) and says how it relates to the others (`graph.relations`); Hugo builds the graph from these pages.

{{< pivograph >}}
