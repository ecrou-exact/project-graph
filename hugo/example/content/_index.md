---
title: "Pivograph on Hugo"
---

This site shows a graph of projects built by Hugo from its own pages, with the
[Pivograph component](https://github.com/ecrou-exact/project-graph/tree/main/hugo).

- **[Projects](projects/)**: every project linked to Rulezet is a page; its front matter says what it is and how it relates to the others. Hugo turns these pages into the graph's JSON.
- **[CIRCL](circl/)**: the GitHub organisations managed or co-managed by CIRCL, one page each, with its logo and GitHub facts.

Without JavaScript, each graph is shown as text: every node with its links, tags and details, and every relationship as a sentence. With JavaScript, the interactive graph comes first and the text is one click away.
