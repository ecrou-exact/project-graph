---
title: "Flowintel"
description: "Case management and analyst workflow platform."
tags: ["case-management", "flowintel", "incident-response", "threatintel"]
weight: 7
graph:
  id: "flowintel"
  type: "project"
  github: "flowintel/flowintel"
  imageFit: "contain"
  githubInfo:
    fullName: "flowintel/flowintel"
    url: "https://github.com/flowintel/flowintel"
    description: "An open source platform to support analysts to organise their case and tasks"
    homepage: "https://flowintel.github.io/flowintel-doc "
    stars: 158
    forks: 26
    issues: 17
    language: "Python"
    license: "AGPL-3.0"
    topics: ["case-management", "flowintel", "incident-response", "threatintel"]
    archived: false
    pushedAt: "2026-09-23T12:23:49Z"
    fetchedAt: "2026-09-23T12:33:10.436Z"
  image: "logo.png"
  relations:
    - to: "rulezet"
      type: "consumes"
      label: "attaches rules to cases"
      description: "Flowintel has a Rulezet 'receive from' connector module: from a case, an analyst fetches a rule or bundle from a configured Rulezet instance and stores it on the case (title, format, content, version). Instances use an API key and optional SSL verification."
      details:
        protocol: "REST (X-API-KEY / Bearer)"
        endpoint: "GET /api/rule/public/detail/<id>"
        config: "RULEZET_VERIFY_SSL"
        code: ["flowintel: app/modules/receive_from/rulezet_rule.py", "flowintel: app/static/js/case/ModuleComponents/Rulezet.js"]
---
