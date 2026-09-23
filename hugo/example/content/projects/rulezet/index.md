---
title: "Rulezet"
description: "Community platform for sharing, reviewing and managing detection rules (YARA, Sigma, Suricata, Zeek, ...)."
tags: ["cti", "network-detection", "network-security", "threat-intelligence", "yara"]
weight: 1
graph:
  id: "rulezet"
  type: "project"
  size: 64
  url: "https://rulezet.org"
  github: "rulezet/rulezet-core"
  imageFit: "contain"
  githubInfo:
    fullName: "rulezet/rulezet-core"
    url: "https://github.com/rulezet/rulezet-core"
    description: "Rulezet is an open-source web platform for sharing, evaluating, improving, and managing cybersecurity detection rules (YARA, Sigma, Suricata, etc). It aims to foster collaboration among professionals and enthusiasts to improve the quality and reliability of detection rules. "
    homepage: "https://rulezet.org/docs/"
    stars: 55
    forks: 9
    issues: 14
    language: "Python"
    license: "AGPL-3.0"
    topics: ["cti", "network-detection", "network-security", "threat-intelligence", "yara"]
    archived: false
    pushedAt: "2026-09-21T12:45:58Z"
    fetchedAt: "2026-09-23T12:33:10.436Z"
  image: "logo.png"
  relations:
    - to: "rulezet"
      type: "uses"
      label: "federates with (Connector sync)"
      description: "A Rulezet instance pulls rules and bundles from another Rulezet instance through an admin-configured Connector. Each pull runs as a background connector_pull job that calls the remote sync API with an X-API-KEY header and imports rules and bundles with their tags, CVEs and ATT&CK techniques. Items are matched by UUID only. Soft mode skips existing rules, hard mode updates them in place. Pull only: nothing is pushed back to the source."
      details:
        protocol: "REST (X-API-KEY)"
        endpoints: ["/api/sync/manifest", "/api/sync/stats", "/api/sync/rules", "/api/sync/bundles"]
        modes: ["soft", "hard"]
        matching: "uuid"
        code: ["app/features/connector/connector_core.py", "app/api/connector/connector_sync_api.py"]
    - to: "vulnerability-lookup"
      type: "uses"
      label: "fetches CVE & EPSS data"
      description: "Rulezet uses Vulnerability-Lookup as its CVE reference. Every CVE shown on a rule or blog post links to its vulnerability.circl.lu page. A background job generates blog posts from CVE details and EPSS scores fetched from the Vulnerability-Lookup API, and a blog endpoint proxies CVE data from it to avoid browser CORS issues."
      details:
        protocol: "REST (public)"
        endpoints: ["/api/cve/<id>", "/api/epss/<id>", "/vuln/<id> (links)"]
        code: ["app/features/jobs/job_handlers.py", "app/features/blog/blog.py", "app/static/js/vulnerability/"]
    - to: "misp"
      type: "uses"
      label: "pushes rules as MISP events"
      description: "Admins register MISP servers in Rulezet (URL + API key, stored encrypted). A rule or bundle can be pushed as a MISP Object or a richer MISP Event (with tags and CVE attributes) through PyMISP, as a background misp_push job. Rules and bundles are also downloadable as MISP JSON, using the rulezet-metadata and rulezet-bundle object templates published in misp-objects."
      details:
        protocol: "REST via PyMISP (API key)"
        misp_objects: ["rulezet-metadata", "rulezet-bundle"]
        job: "misp_push"
        code: ["app/features/misp/misp_connector_core.py", "app/features/misp/rule/misp_object.py", "app/features/misp/bundle/misp_object.py"]
    - to: "misp"
      type: "uses"
      label: "imports taxonomies & galaxies"
      dashed: true
      description: "Rulezet embeds the MISP taxonomies and MISP galaxy repositories as git submodules and turns them into tags (TLP, PAP, threat actors, ...). An admin can refresh them with the update_misp_data background job, which runs git submodule update --remote."
      details:
        source: ["MISP/misp-taxonomies", "MISP/misp-galaxy"]
        job: "update_misp_data"
        code: ["app/features/tags/tags_core.py", "app/features/jobs/job_handlers.py", "app/modules/"]
      curve: "curved"
    - to: "cti-transmute"
      type: "uses"
      label: "converts MISP to STIX"
      description: "To show and export a rule in STIX, Rulezet builds the rule's MISP event and sends it to the CTI-Transmute conversion API, which returns the STIX bundle. The endpoint can be pointed to a self-hosted CTI-Transmute with CTI_TRANSMUTE_URL."
      details:
        protocol: "REST"
        endpoint: "https://cti-transmute.org/api/convert/misp_to_stix"
        config: "CTI_TRANSMUTE_URL"
        code: ["app/features/misp/misp_core.py", "app/features/rule/rule.py (/get_stix)"]
    - to: "velociraptor"
      type: "uses"
      label: "pushes detection artifacts"
      description: "Admins register Velociraptor servers in Rulezet with their API client config (mutual TLS certificates, stored encrypted). Rulezet turns a rule into a Velociraptor artifact and registers it on the server over gRPC with a VQL artifact_set() call, as a background job."
      details:
        protocol: "gRPC + mutual TLS (VQL)"
        vql: "SELECT artifact_set(...) FROM scope()"
        tested_with: "Velociraptor v0.77.1"
        code: ["app/features/velociraptor/velociraptor_core.py", "app/features/rule/exporters/velociraptor_exporter.py"]
    - to: "pivotick"
      type: "uses"
      label: "draws graphs with"
      description: "Rulezet embeds the Pivotick library to draw interactive graphs (e.g. on the rule detail page)."
      details:
        code: "app/modules/pivotick"
---
