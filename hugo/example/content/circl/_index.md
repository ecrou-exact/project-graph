---
title: "CIRCL GitHub organisations"
linkTitle: "CIRCL"
description: "The GitHub organisations managed or co-managed by CIRCL, the CERT for the private sector, communes and non-governmental entities in Luxembourg, as listed on https://new.circl.lu/projects/github-organisations/. For each organisation: its logo, its description and website from GitHub, its most starred repository and its most used topics. GitHub data of 2026-09-23."
weight: 2
graph:
  linkDistance: 300
  nodeTypes:
    cert:
      label: "CERT"
      color: "#ffffff"
      shape: "circle"
      size: 70
      imageFit: "contain"
      borderColor: "#1c2b4a"
      borderWidth: 3
      labelSize: 22
      labelFont: "sans"
      labelBackground: "none"
    organisation:
      label: "GitHub organisation"
      color: "#ffffff"
      shape: "circle"
      size: 36
      imageFit: "contain"
      borderColor: "#c9d1e0"
      borderWidth: 2
      labelSize: 15
      labelFont: "sans"
      labelBackground: "none"
  edgeTypes:
    manages:
      label: "manages or co-manages"
      color: "#8aa0c8"
      width: 2
      direction: "forward"
      hideLabel: true
---

Each organisation below is a page of this site, with its logo and its GitHub facts in its front matter (`graph`); CIRCL's page lists the organisations it manages (`graph.relations`). Hugo builds the graph from these pages.

{{< pivograph >}}
