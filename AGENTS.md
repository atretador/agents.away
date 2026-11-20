# AGENTS.md — working on Agents Away

Agents Away is a self-hosted phone companion (PWA) for Claude Code and OpenCode sessions on a Linux PC.
User-facing docs: [README.md](README.md). This file is for coding agents changing the code.

## Stack and rules

- **Bun + TypeScript, no build step.** The server runs `src/server.ts` directly. The front end is a
  single vanilla ES module (`public/app.js`) plus `public/app.css`, served as-is. No framework and no
  bundler; keep it that way.
- Runtime dependencies: `sharp` (image variants), `web-push`, and `marked`, `dompurify` and `ansi_up`,
  which are served to the browser straight from `node_modules` under `/vendor/`. Add a dependency only
  when there is a strong reason.
- Linux + systemd user service only. External tools: `tmux`, `openssl`, optionally `rg`, `qrencode`,
  `opencode`.
- Nothing machine- or user-specific in the repo: no absolute home paths, IPs, hostnames, usernames
  or secrets. Paths come from `src/config.ts` (`HOME`, `CFG_DIR`, `DATA_DIR`, env overrides).
- Secrets live outside the repo: `~/.config/agents-away/config.json` (local API token, VAPID keys) and
  `devices.json` (hashed device sign-ins). The local token must never reach a phone. Never log or
  print them, or OpenCode's `~/.config/opencode/service.json` password.

## Layout

| Path | What |
|---|---|
| `src/server.ts` | HTTP/WebSocket server: three listeners (HTTPS app :7443, local API on 127.0.0.1:7442, onboarding :7440), session registry, watchers, REST endpoints, push decisions |
| `src/claude.ts` | Claude Code discovery (`~/.claude/sessions/*.json`), pid→tty→tmux pane matching, transcript JSONL parsing into chat items |
| `src/tmux.ts` | tmux wrapper: list panes, capture, send keys/text (bracketed paste), prompt/menu detection, new sessions |
| `src/opencode.ts` | OpenCode HTTP API client (sessions, messages, prompt, permissions, question forms, context %, child-session subagents, session terminals, SSE events, model catalog + recent models) |
| `src/reviews.ts` | Image reviews: storage, long-poll waiters |
| `src/images.ts` | WebP variants (360/800/1600) with an on-disk cache |
| `src/extras.ts` | Per-session prefs (name/pin/mute), git changes, transcript search (ripgrep) |
| `src/subagents.ts` | Context-window % (tail of the transcript) and subagents: `<project>/<sessionId>/subagents/agent-<id>.jsonl` + `.meta.json`, status from the meta file and the parent's `<task-notification>`s |
| `src/auth.ts` | Phone sign-in: one-time pairing codes (10 min), per-device sessions with sliding expiry (`settings.signInDays`), device list / sign-out |
| `src/push.ts` | Web Push subscriptions and sending |
| `src/config.ts` | Paths, ports, config/secrets, settings defaults |
| `bin/agents-away` | CLI (Bun script): `hook`, `hooks`, `review`, `notify`, `pair`, `status`, `attach` |
| `bin/agents-away-certs` | Creates the private CA and server certificate |
| `public/` | PWA: `index.html`, `app.js`, `app.css`, `sw.js` (push + notification actions), onboarding pages, icons |
| `shell/` | `claude` wrappers (fish, bash/zsh) that start sessions in `tmux -L agents-away` |
| `skills/agents-away-review/` | Claude Code skill telling Claude how to use `agents-away review` |
| `install.sh`, `agents-away.service.in`, `tmux.conf` | Installation |

## Key mechanics

- **Session model:** each Claude session is `{id, status: working|attention|idle, tmux?: {socket, pane}, …}`.
  `canReply` is true only when the session is matched to a tmux pane (or it's OpenCode).
- **Context % and subagents:** live Claude sessions carry `context {pct, tokens, size, model}` and
  `agents {total, running}` (`/api/session/:id/info` too for past ones). Subagents are never sessions of
  their own; `/api/session/:id/agents` lists them, `/api/session/:id/agent/:aid?from|before` pages a
  subagent's chat (parsed with `sidechain = true`), shown read-only at `#/a/<sessionId>/<agentId>`.
- **Transcript parsing** (`parseLines`): only lines starting with `{"parentUuid"` plus queue-operation
  and ai-title lines are parsed. Every item carries its byte offset `o`, so the client can resume and
  page backwards (`older`). Keep results clipped (`1500` chars) because payload size is what makes
  session switching feel fast.
- **WebSocket protocol** (client → server): `watch {id, chat, term, from}`, `peek`, `older`,
  `visible`, `ping`. Server → client: `sessions`, `reviews`, `build` (triggers a client reload when
  the server's build id changes), `chat {reset|items, start, end}`, `older`, `term`, `queue`.
- **Answering prompts:** re-capture the pane and verify the menu is still there before sending keys.
  Choose options by moving the ❯ cursor with arrows, never by typing digits blindly.
- **AskUserQuestion (Claude Code):** `detectAskForm` (tmux.ts) recognises the form by its tab bar
  (`←  ☐ Colour  ☒ Sizes  ✔ Submit  →`, or ` ☐ Fruit` for one question), numbered options (`[ ]`/`[✔]`
  when multi-select), the last "Type something" row, the `Next`/`Submit` row of a multi-select, and
  `N. Chat about this` under a separator. `detectPrompt` ignores such forms (except the "Review your
  answers" step, which stays a normal prompt card), so the generic menu code never answers them.
  The questions come from the `PreToolUse` hook (matcher `AskUserQuestion`): current Claude Code only
  writes the `tool_use` line to the transcript once it's answered. Fallbacks: `pendingAsk` (transcript
  tail), then the screen alone (`ask.partial`: only the visible question, answered on its own).
  Sessions carry `ask {id, questions, current, partial, tabs}`; `POST /api/session/:id/ask
  {answers: [{pick: [n…], other?}]}` runs `answerAsk`, which re-captures after every step: Left/Right
  switch questions (only from a plain option row, so it first moves to option 1), Up/Down move, Enter
  picks a single-select option (and advances), Space toggles a multi-select option, pasting into the
  "Type something" row fills and selects it (`C-u` clears it), Enter on `Next`/`Submit` finishes a
  multi-select, and Enter on "Submit answers" confirms the review step. One-question single-select
  forms submit on Enter with no review step.
- **Hooks:** Claude Code runs `agents-away hook` (stdin JSON) on Notification, Stop, UserPromptSubmit,
  PostToolUse and PreToolUse (AskUserQuestion only). The CLI forwards it to the local API `/hook`. Install with `agents-away hooks install`.
- **Reviews:** `agents-away review` long-polls `/review/:id/wait`. If it times out, the answer is later
  bracketed-pasted into the session as `[Phone review of "…" (id …)] …` (OpenCode: posted as a message;
  the CLI finds the session from `CLAUDE_CODE_SESSION_ID` / `OPENCODE_SESSION_ID`).
- **Skill:** `agents-away skill install|uninstall|status [--claude|--opencode]` copies
  `skills/agents-away-review` to `~/.claude/skills`; OpenCode loads that folder too, so it only gets its
  own copy (`~/.config/opencode/skills`) when it can't see the Claude one.
- **OpenCode:** polled every 5 s plus the SSE `/api/event` stream. Chat sync diffs item signatures
  and sends either the new suffix or a reset. Its OpenAPI spec is at `/openapi.json` on its server.
  - *Question forms* (`question` tool, event `form.created`/`replied`/`cancelled`): pending ones from
    `GET /api/session/:id/form` become the session's `prompt` with a `form {id, title, fields}`
    (status `waiting`); the dock renders the fields (string ± options/custom, number/integer, boolean,
    multiselect, external link, `when` conditions). `POST /api/session/:id/form {formID, answer}` →
    `…/form/:formID/reply`; `{formID, cancel: true}` → `DELETE …/form/:formID`.
  - *Context %*: input + cache tokens of the latest assistant message vs the model's `limit.context`
    from `/api/model`. *Subagents*: child sessions (`GET /api/session?parentID=`), running from
    `/api/session/active`, linked to the parent's `subagent` tool call via `state.metadata.sessionID`;
    `/api/session/:id/agent/:childId?from=N&sig=H` resends everything (`reset`) when the hash of the
    phone's first N items no longer matches.
  - *Terminal tab*: the session's persistent PTYs (experimental `/api/experimental/session/:id/terminal`,
    the newest running one). Output = `persistent-pty/:id/snapshot` checkpoint with only SGR kept,
    ~1×/s while the tab is open; input (`term: true` on `/text` and `/keys`) attaches to
    `persistent-pty/:id/connect` (WebSocket, Basic auth), sends the bytes and detaches.
  - *Recent models*: OpenCode's `~/.local/state/opencode/model.json` (`recent`, `variant`), merged with
    the phone's picks (`prefs.oc.recent`) in the new-session sheet.
- **Client state:** per-phone prefs in `localStorage` (`away.prefs`, `away.seen`, `away.mode`).
  Bottom sheets go through `sheet()` (it pushes a history entry so Back closes them). Navigate with
  `nav()`, not `location.hash =`, while a sheet may be open.

## Developing

```bash
bun install
systemctl --user restart agents-away        # run the installed service with your changes
journalctl --user -u agents-away -f         # logs
# or run in the foreground (stop the service first):
systemctl --user stop agents-away && bun src/server.ts
```

- Type-check / syntax-check: `bun build src/server.ts --target bun --outdir /tmp/away-build` and
  `bun build public/app.js --no-bundle > /dev/null`.
- There is no automated test suite. Verify UI changes in a phone-sized headless browser
  (Playwright, 390×844, `isMobile`, `hasTouch`). Sign the test browser in by opening a fresh link from
  `agents-away pair` (`/pair?t=…`); for curl, open one with `-c jar` and reuse the jar with `-b jar`
  (plus `--cacert ~/.config/agents-away/certs/ca.crt` and the `x-away: 1` header on POSTs). Remove test
  devices afterwards (⚙ → Sign-in, or `POST /api/devices/:id/signout`).
- **Demo mode:** `bun tools/demo/server.ts` serves the real `public/` app on http://localhost:7450 with
  made-up sessions, chats, a diff and reviews (no real data, actions are no-ops). Use it for UI work and
  for the README screenshots: with it running, `bun add --no-save playwright-core` then
  `CHROME=<chromium path> bun tools/screenshots.ts` rewrites `docs/screenshots/*.png`. Update the demo
  data when a feature should appear in the screenshots.
- The client reloads itself after a server restart (build id), so a restart is all a phone needs.
- POST endpoints require the `x-away: 1` header (CSRF guard). Local API calls need `x-away-token`.
- Don't break running sessions: restarting the service must never kill the `agents-away` tmux server
  (the unit uses `KillMode=process`; new tmux servers are started in their own systemd scope).
