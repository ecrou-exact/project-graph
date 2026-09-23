---
title: "AIL"
description: "Analysis of Information Leaks framework: collects and analyses unstructured data, with YARA trackers and retro hunts."
tags: ["ail-framework", "darkweb", "darkweb-scraping", "data-mining", "information-extraction", "information-security", "leak"]
graph:
  id: "ail"
  type: "project"
  url: "https://www.ail-project.org"
  github: "ail-project/ail-framework"
  imageFit: "contain"
  githubInfo:
    fullName: "ail-project/ail-framework"
    url: "https://github.com/ail-project/ail-framework"
    description: "AIL framework - Analysis Information Leak framework"
    homepage: ""
    stars: 1018
    forks: 145
    issues: 136
    language: "Python"
    license: "AGPL-3.0"
    topics: ["ail-framework", "darkweb", "darkweb-scraping", "data-mining", "information-extraction", "information-security", "leak"]
    archived: false
    pushedAt: "2026-09-22T15:19:25Z"
    fetchedAt: "2026-09-23T12:33:10.436Z"
  image: "logo.png"
  relations:
    - to: "rulezet"
      type: "consumes"
      label: "imports YARA rules"
      description: "In AIL's tracker and retro hunt forms, an analyst can search Rulezet and paste a rulezet.org rule URL. AIL extracts the rule id, fetches the rule from Rulezet's public API and imports it as a YARA tracker (only YARA rules are accepted). Each AIL user can also store a Rulezet API key in their profile."
      details:
        protocol: "REST"
        endpoint: "GET /api/rule/public/detail/<id>"
        formats: "yara"
        code: ["ail-framework: var/www/blueprints/hunters.py", "ail-framework: bin/lib/ail_users.py"]
---
