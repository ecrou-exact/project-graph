---
title: "zsazsa"
description: "CTI program management and production platform built around MISP."
tags: ["cti", "misp"]
graph:
  id: "zsazsa"
  type: "project"
  github: "zsazsa-project/zsazsa"
  imageFit: "contain"
  githubInfo:
    fullName: "zsazsa-project/zsazsa"
    url: "https://github.com/zsazsa-project/zsazsa"
    description: "A CTI program management and production platform built around MISP"
    homepage: ""
    stars: 40
    forks: 8
    issues: 9
    language: "Python"
    license: "AGPL-3.0"
    topics: ["cti", "misp"]
    archived: false
    pushedAt: "2026-09-23T07:50:34Z"
    fetchedAt: "2026-09-23T12:33:10.436Z"
  image: "logo.png"
  relations:
    - to: "rulezet"
      type: "consumes"
      label: "looks up & validates rules"
      description: "zsazsa's vulnerability advisory and detection engineering wizards have a 'Search Rulezet' button that finds existing rules by CVE or MITRE ATT&CK technique, shown as 'Existing coverage (Rulezet)' in the product. zsazsa also calls Rulezet's validate endpoint to check a rule before a detection request can become Active. Its rule viewer reuses Rulezet's syntax highlighters."
      details:
        protocol: "REST (public)"
        endpoints: ["GET /api/rule/public/search_rules_by_cve", "GET /api/rule/public/search_rules_by_attack", "/api/rule/public/validate"]
        config: "RULEZET_URL"
        code: ["zsazsa: core/rulezet_lookup.py", "zsazsa: webapp/routes/api.py"]
---
