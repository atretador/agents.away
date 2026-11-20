# Security policy

Agents Away lets a paired phone type into your agent sessions and approve the commands they want to
run, so a flaw in it can amount to running code on your PC. Reports are very welcome.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub:
[Security → Report a vulnerability](https://github.com/atretador/agents.away/security/advisories/new).

Include what you can of:

- what an attacker can do, and from where (same LAN, VPN peer, another local user, a web page the phone
  visits, a prompt-injected agent reply…);
- steps to reproduce, or a proof of concept;
- the version (`agents-away --version`) or commit, and your OS, browser and phone.

This is a one-person project maintained in spare time, so there's no formal SLA. You can expect an
acknowledgement within a week, a fix or a plan for one as soon as practical, and credit in the advisory
and changelog unless you'd rather stay anonymous. Please give a reasonable time for a fix before
disclosing publicly.

## Supported versions

Only the latest release and `main` get security fixes. Agents Away is pre-1.0; update by pulling `main`
and restarting the service.

## Scope

Agents Away is designed for a **trusted private network** (your home LAN or your own VPN); see the
warning and the [Security section](README.md#security) of the README. In scope, for example:

- signing in or using the API without a valid pairing link or device sign-in;
- reusing, guessing or extending pairing codes or device sessions beyond what they allow;
- cross-site attacks against the app (CSRF, XSS, clickjacking), including through content from agent
  transcripts, reviews or file names;
- reaching files or commands outside what the app is meant to expose (for example path traversal in
  file and image endpoints);
- the local API (127.0.0.1) being usable without its token, or the token, push keys or CA key leaking to
  a phone or the network;
- the private CA being usable to vouch for sites other than this PC;
- anything that makes Agents Away send input to a session that the user didn't type, tap or answer.

Out of scope, as the README states:

- running it exposed to the internet, or on a LAN you don't trust without a VPN;
- someone who already has a signed-in phone, a fresh pairing link, or access to your PC user account;
- missing hardening the README already lists as absent (rate limiting, audit log, user accounts);
- vulnerabilities in Claude Code, OpenCode, tmux, Bun or the browser itself (report those upstream).

Thanks for helping keep it safe.
