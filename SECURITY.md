# Security Policy

WhatLags is a **local** diagnostic agent. It is intended to bind only to `127.0.0.1` and to be driven from that same origin.

## Reporting a Vulnerability

Please report security issues privately to [vtblot@gmail.com](mailto:vtblot@gmail.com). Do not open a public GitHub issue for unpatched vulnerabilities.

Include:

- A short description of the issue and impact
- Steps to reproduce on a local agent
- Affected commit or version if known

## Scope notes

- Cloud metadata addresses stay blocked.
- Internet targets (public IPv4 / hostnames) are the default; RFC1918 and loopback require an explicit LAN opt-in in the UI.
- Local API writes (autostart, watch, journal) require a process-local token in addition to an Origin/Referer allowlist.
