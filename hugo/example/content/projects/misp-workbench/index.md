---
title: "MISP-Workbench"
description: "Analyst workbench around MISP data, with hunts over external sources."
tags: ["misp", "threat-hunting", "threat-intelligence"]
weight: 8
graph:
  id: "misp-workbench"
  type: "project"
  github: "MISP/misp-workbench"
  imageFit: "contain"
  githubInfo:
    fullName: "MISP/misp-workbench"
    url: "https://github.com/MISP/misp-workbench"
    description: "Built for the frontlines of cyber defense, our next-generation MISP empowers edge deployments and threat hunters with fast, lightweight, and actionable intelligence, anytime, anywhere."
    homepage: "https://misp-workbench.readthedocs.io/en/latest/"
    stars: 31
    forks: 6
    issues: 8
    language: "Python"
    license: "AGPL-3.0"
    topics: ["misp", "threat-hunting", "threat-intelligence"]
    archived: false
    pushedAt: "2026-09-23T12:29:19Z"
    fetchedAt: "2026-09-23T12:33:10.436Z"
  image: "logo.png"
  relations:
    - to: "rulezet"
      type: "consumes"
      label: "hunts rules by CVE"
      description: "MISP-Workbench has a 'Rulezet vuln check' hunt type: given a vulnerability id (e.g. CVE-2021-44228), it looks up the matching detection rules on rulezet.org."
      details:
        protocol: "REST (public)"
        endpoint: "GET /api/rule/public/search_rules_by_cve?cve_ids=..."
        hunt_type: "rulezet"
        code: ["misp-workbench: api/app/services/rulezet.py", "misp-workbench: docs/features/hunts.md"]
---
