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

## Terms-of-service rules (don't break these)

- Never read, copy or use Claude Code's credentials (`~/.claude/.credentials.json`, OAuth tokens) and
  never call Anthropic's API on the user's behalf: Agents Away only drives the official `claude` binary
  in a terminal.
- Every input to a session must come from the user (typed, tapped, or a review they answered). No
  auto-approve, auto-reply, scheduled or unattended prompts, and no headless `claude -p` runs on a
  subscription.
- Single user: no features for sharing access with other people.
- Don't use "Claude", "Claude Code", "Anthropic" or "OpenCode" in product, feature or theme names, or
  their logos; plain descriptive text ("works with Claude Code") is fine.

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
| `src/updates.ts` | Opt-in release check (`settings.updateCheck`, `agents-away updates`): GitHub latest release once a day, state in `DATA_DIR/update.json`, one push per newer version |
| `src/pi.ts` | pi support: live sessions from the extension's pid files (`CFG_DIR/pi/<pid>.json`), transcript lookup/parsing (`parsePiOne`, called from `parseLines`), titles, recent sessions |
| `pi/agents-away.ts` | The pi extension (installed to `~/.pi/agent/extensions/` by `agents-away hooks install`): writes the pid file, sends UserPromptSubmit/Stop hook events |
| `src/config.ts` | Paths, ports, config/secrets, settings defaults |
| `bin/agents-away` | CLI (Bun script): `hook`, `hooks`, `review`, `notify`, `pair`, `status`, `updates`, `attach` |
| `bin/agents-away-certs` | Creates the private CA and server certificate |
| `public/` | PWA: `index.html`, `app.js`, `app.css`, `sw.js` (push + notification actions), onboarding pages, icons |
| `public/i18n.js`, `public/i18n/*.js` | Phone UI translations (`tr`/`trn`); `public/page-i18n.js` translates `onboard.html` and `unpaired.html` |
| `shell/` | `claude` and `pi` wrappers (fish: `claude.fish`, `pi.fish`; bash/zsh: `claude.sh` has both) that start sessions in `tmux -L agents-away` |
| `skills/agents-away-review/` | Claude Code skill telling Claude how to use `agents-away review` |
| `install.sh`, `agents-away.service.in`, `tmux.conf` | Installation |
| `android/` | Optional Android app (Kotlin, Gradle): profiles for several PCs, each shown in a WebView of that PC's web app; see "Android app" below |

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
  `visible`, `ping`, `listen` (Android app: receive notifications). Server → client: `notify` (to listeners), `sessions`, `reviews`, `build` (triggers a client reload when
  the server's build id changes), `chat {reset|items, start, end}`, `older`, `term`, `queue`.
- **Answering prompts:** re-capture the pane and verify the menu is still there before sending keys.
  Choose options by moving the ❯ cursor with arrows, never by typing digits blindly.
- **AskUserQuestion (Claude Code):** `detectAskForm` (tmux.ts) recognises the form by its tab bar
  (`←  ☐ Colour  ☒ Sizes  ✔ Submit  →`, or ` ☐ Fruit` for one question), numbered options (`[ ]`/`[✔]`
  when multi-select), the last "Type something" row, the `Next`/`Submit` row of a multi-select, and
  `N. Chat about this` under a separator. `detectPrompt` ignores such forms (except the "Review your
  answers" step, which stays a normal prompt card), so the generic menu code never answers them.
  The questions come from the `PreToolUse` hook: current Claude Code only
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
  PostToolUse and PreToolUse (all tools). The CLI forwards it to the local API `/hook`. Install with `agents-away hooks install`.
- **Waiting** (`waitingOn` in subagents.ts): live sessions carry `waits [{kind: agent|shell, label,
  since}]`: running subagents plus background Bash commands (tool results starting "Command running in
  background with ID", "Command was manually backgrounded by user with ID", "…moved to the background
  (ID: …)"), until a `<task-notification>` for that id or a TaskStop. The phone lists them under a pending
  `Yield`; tool items with `until` (ScheduleWakeup delaySeconds, `sleep N`) get a countdown.
- **Approval cards** (`src/approval.ts`): PreToolUse/PostToolUse keep each session's started-but-unfinished
  tool calls; `toolForScreen` picks the one whose hint (command start, file name, "proceed" for plans)
  is on the screen and `describeTool` turns it into `prompt.tool {title, path, desc, md, code, diff,
  fields}`: plans as markdown, commands as code, edits as diffs. No match → the screen text as before.
  OpenCode: a permission's `source {messageID, id}` points at its tool part; `permissionTool`
  (opencode.ts, cached per request) maps it with `describeOcTool` (its tool names: shell/bash, edit
  {path, oldString, newString}, write, read, webfetch, execute, patch).
- **Reviews:** `agents-away review` long-polls `/review/:id/wait`. If it times out, the answer is later
  bracketed-pasted into the session as `[Phone review of "…" (id …)] …` (OpenCode: posted as a message;
  the CLI finds the session from `CLAUDE_CODE_SESSION_ID` / `OPENCODE_SESSION_ID`).
- **Skill:** `agents-away skill install|uninstall|status [--claude|--opencode]` copies
  `skills/agents-away-review` to `~/.claude/skills`; OpenCode loads that folder too, so it only gets its
  own copy (`~/.config/opencode/skills`) when it can't see the Claude one.
- **pi** (`kind: "pi"`): a terminal TUI like Claude Code, so it's matched to a tmux pane by tty and driven with
  the same `sendText`/`sendKeys`. pi writes no per-process file, so the extension keeps
  `CFG_DIR/pi/<pid>.json` (`{pid, sessionId, file, cwd, name, status busy|idle, model, context}`) up to date
  and runs `agents-away hook` with Claude-shaped events (`UserPromptSubmit` on `agent_start`, `Stop` on a
  normal `agent_end`; failed turns are retried by pi, so they don't notify). `listPiProcs()` believes a pid
  file only while `/proc/<pid>/cmdline` is a pi (stale files are deleted). Transcripts are
  `~/.pi/agent/sessions/--<cwd>--/<timestamp>_<id>.jsonl` (flat when `PI_CODING_AGENT_SESSION_DIR` is set; no
  file exists until the first message): lines `{"type":"message","message":{role: user|assistant|toolResult,
  content: text|thinking|toolCall|image blocks}}`; `toolCall.arguments` can be an object or a JSON string.
  `parseLines` dispatches on that prefix, so `readTail`, paging and watching work unchanged. No prompt/ask/
  background detection and no approval cards (pi has no permission prompts); new sessions run `pi [--model]
  [--session <id>] [prompt]` (pi has no `--`: a leading `-` or `@` in the prompt gets a space in front).
  The new-session picker uses `GET /api/pi/catalog` (`piCatalog`: `pi --list-models` offline, 60 s cache, pi's
  `settings.json` default, models of recent sessions); `/api/new` takes `piModel` (`provider/id`) and `piThinking`.
  pi writes its session file only once the first message is processed, so the server remembers that first
  message (`rememberFirst`/`pendingFirstMessage` in pi.ts; from `/api/new` keyed by tmux name, from the composer
  by session id) and serves it as a `pending` user item (and the card title) until the transcript has messages;
  `tickWatchers` then resets the chat from the real file.
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
- **Translations:** every user-facing string in `app.js` goes through `tr("English text", {vars})` or
  `trn(n, "{n} file", "{n} files")` from `public/i18n.js`, always with a string literal (the English text is the
  key). Add the same key to `public/i18n/es.js` and `public/i18n/pt-BR.js`: `tests/i18n.test.ts` fails on a
  missing or stale key, or a translation whose `{placeholders}` or HTML tags differ from the English.
  `bun tools/i18n-keys.ts` lists the keys. Escape user data before passing it as a var into HTML. Don't
  translate text that is sent to an agent or matched against Claude Code's screen; push notifications,
  `sw.js` and the CLI are English only. The language (`away.lang`: auto/en/es/pt-BR) is fixed per page
  load, so module-level constants may call `tr()`; changing it reloads the app.
- **Android app** (`android/app/src/main/java/io/github/atretador/agentsaway/`): a thin shell, no UI of
  its own beyond pairing/switching. `Profiles.kt` (one per PC: addresses, CA PEM + SHA-256, the
  `away_dev` cookie; SharedPreferences, no backup), `Trust.kt` (pinned CA: signature, validity, SAN of
  the address; Android's store is never used), `Pairing.kt` (`/pair?t=&fp=&n=` link → fetch
  `/agents-away-ca.crt`, compare with `fp`, redeem the code natively and keep the cookie),
  `MainActivity.kt` (WebView per profile, LRU of 3; `onReceivedSslError` applies the pin; the cookie is
  re-set on every switch because WebView cookies ignore the port), `NotifyService.kt` (foreground
  service, one OkHttp WebSocket per PC sending `{type: "listen"}`), `Notifier.kt`, `Receivers.kt`
  (notification actions call the same endpoints as `sw.js`). The web app detects it with
  `window.AwayNative` (`openProfiles`, `openNotificationSettings`, `serverInfo`, `themeColor`; checked
  against the WebView's current origin) and then skips the service worker and Web Push. Server side:
  `listen` makes `pushAll` (via `setPushTap`) send `{type: "notify", …payload}` to that socket, and on
  each `listen` the server replays what's still pending (`replay: true`; the app skips ones it already
  showed). `settings.profileName` names the PC (default: hostname); `agents-away pair` adds `fp` and
  `n` to the link. Build: `cd android && ./gradlew assembleDebug`; the version comes from `package.json`;
  CI (`.github/workflows/android.yml`) attaches a signed APK to the release on a `v*` tag.
- **Client state:** per-phone prefs in `localStorage` (`away.prefs`, `away.seen`, `away.mode`, `away.lang`).
  Bottom sheets go through `sheet()` (it pushes a history entry so Back closes them). Navigate with
  `nav()`, not `location.hash =`, while a sheet may be open.

## Releasing

Bump `version` in `package.json`, move the changelog entries into a `## X.Y.Z — date` section, commit, then
push a `vX.Y.Z` tag. The `release` job in `.github/workflows/android.yml` waits for the maintainer's approval
(GitHub environment `release`, the only place the signing key's secrets exist, usable by `v*` tags only),
then signs the APK and publishes the release with `tools/package.sh`'s downloads (server-min, server-full
with the APK in `prebuilt/`, the APK, `SHA256SUMS`) and that changelog section as notes. Keep third-party
actions pinned to commit SHAs. The server serves `DATA_DIR/android/agents-away.apk` (built locally with
`agents-away apk build`) or else `prebuilt/agents-away.apk`.

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
- **Tests:** `bun test` (in `tests/`, run by CI in `.github/workflows/ci.yml` with `bun run check`).
  `tests/setup.ts` is preloaded (bunfig.toml) and points config, data and `HOME` at a temp folder:
  tests must never touch the real `~/.claude` or `~/.config/agents-away`. Transcript lines are built
  with `tests/lines.ts`. Add a test when you change the parser, prompt/form detection, sign-in or the
  hooks installer. Never start a test server on the installed service's ports or tmux socket (use
  `AWAY_PORT`/`AWAY_LOCAL_PORT`/`AWAY_ONBOARD_PORT`/`AWAY_TMUX_SOCKET`).
- Verify UI changes in a phone-sized headless browser
  (Playwright, 390×844, `isMobile`, `hasTouch`). Sign the test browser in by opening a fresh link from
  `agents-away pair` (`/pair?t=…`); for curl, open one with `-c jar` and reuse the jar with `-b jar`
  (plus `--cacert ~/.config/agents-away/certs/ca.crt` and the `x-away: 1` header on POSTs). Remove test
  devices afterwards (⚙ → Sign-in, or `POST /api/devices/:id/signout`).
- **Demo mode:** `bun run demo` serves the real `public/` app on http://localhost:7450 with made-up
  sessions, chats, a diff, subagents, a question form and reviews (no real data; actions are no-ops). Use
  it for UI work. `bun run screenshots` starts its own demo server and rewrites `docs/screenshots/*.png`
  (needs a Chromium: `$CHROME`, Playwright's cache or one on PATH). When a feature should appear in the
  README, add its data to `tools/demo/server.ts`, a step to `tools/screenshots.ts` and a cell to the
  README gallery.
- The client reloads itself after a server restart (build id), so a restart is all a phone needs.
- POST endpoints require the `x-away: 1` header (CSRF guard). Local API calls need `x-away-token`.
- Don't break running sessions: restarting the service must never kill the `agents-away` tmux server
  (the unit uses `KillMode=process`; new tmux servers are started in their own systemd scope).
