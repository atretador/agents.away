# Changelog

All notable changes to Agents Away. Versions follow [Semantic Versioning](https://semver.org/); while the
version is 0.x, minor releases may change behaviour or configuration.

## 0.3.0 — 2026-11-27

### pi
- [pi](https://pi.dev) sessions appear next to Claude Code and OpenCode ones: follow the chat (messages, tool
  calls, results, thinking), reply, interrupt, see the context %, get a "finished" notification, start new
  sessions (choosing the model and thinking level) and resume old ones. `agents-away hooks install` installs a small pi extension
  (`~/.pi/agent/extensions/agents-away.ts`) and the installer adds a `pi` wrapper that runs it in the
  `agents-away` tmux socket. pi has no permission prompts, so there are no approval cards; subagents and a
  terminal tab aren't supported yet.
- The installer no longer warns about a missing `claude` when `pi` or `opencode` is installed instead; the README now
  presents Claude Code, OpenCode and pi as equal, optional choices.

### Web app
- Every session card and session header now names its agent (Claude, OpenCode or pi) with a badge; before, only
  OpenCode and pi sessions had one. When sessions of more than one agent are running, a filter next to the
  session count (All · Claude · OpenCode · pi) narrows the list; it's remembered per phone.
- Images (in chats and in reviews) can be zoomed: pinch, double-tap or mouse wheel, and drag to pan. This now
  works inside the Android app too, where the browser's own pinch-zoom doesn't reach the viewer.

## 0.2.1 — 2026-11-27

### Fixed
- A PC whose page failed to start (server error, crashed page, script that never ran) left the Android
  app on a blank screen with no header, no way back and no way to switch PCs. The app now shows a
  "not responding" screen with **Retry** and **Switch PC** for server errors, a crashed page, or a page
  that stays blank for 10 seconds.
- The web app shows a message with **Reload** (and **Switch PC** in the Android app) when it can't
  start, and reloads itself after a minute.

## 0.2.0 — 2026-11-20

### Android app
- Optional Android app (APK from GitHub Releases, or built and served by your own PC) for using several PCs: one profile per PC, switch from
  the PC name in the header, launcher shortcuts per PC. Each profile shows that PC's own web app.
- Pairing by scanning or pasting the link from `agents-away pair`, with no CA install: the link now
  carries the CA's fingerprint and the app trusts that CA for that PC only. Pairing a PC over another
  address (LAN, VPN) adds it to the same profile; the app uses whichever answers.
- Notifications over the app's own connection to each PC, with no push service or other app: the PC
  sends its notification events down a WebSocket, and re-sends what's pending after a reconnect.
  **Allow** and **Approve** work from the notification.
- `agents-away apk build|status|remove`: build the Android app on the PC (signed with a key kept in
  `~/.config/agents-away/android`) and offer it on the setup page, with its SHA-256.

### Setup and pairing
- Releases come as three downloads: `server-min` (server and web app), `server-full` (plus the Android app,
  offered by the setup page without building it) and the APK alone, with `SHA256SUMS`.
- Setup page redone for phones: choose **Android app** (no certificate) or **Web app** (certificate), each
  with its own steps marked Required or Recommended; Android/iPhone preselected from the browser.
- `agents-away pair <interface|ip>` makes the QR codes for that address (e.g. `wg0` for a VPN) instead of
  the LAN one, and refuses addresses the HTTPS certificate doesn't cover (saying how to add them).

### Web app and server
- Languages: the phone app in English, Spanish or Brazilian Portuguese, following the phone's language
  or chosen under ⚙ → Appearance (per phone). Notifications and the CLI stay in English.
- `/btw` from the phone: the side answer opens in a modal (read from Claude Code's panel), and closing it
  closes the panel on the PC too.
- Waiting, explained: a pending `Yield` lists what it waits for (running subagents and background
  commands, with how long each has run); `ScheduleWakeup` and `sleep N` show a live countdown.
- **⚙ → This PC → Name** sets the name the Android app shows (default: the hostname).
- The question card shows up when you open a session from a notification after the phone slept.
- Optional update notifications (off by default): `agents-away updates on` checks GitHub once a day for
  a newer release and sends one notification that opens its release page; ⚙ shows it too.

## 0.1.0 — first release

The first public version: a self-hosted phone companion (PWA) for the Claude Code and OpenCode sessions
running on your Linux PC, served over your LAN or VPN.

### Sessions
- Sessions list with status (working / needs you / your turn), pin, mute, rename; swipe a card left to end
  a Claude Code session or archive an OpenCode one (with Undo); swipe inside a session to move between
  sessions (wraps around).
- Chat view from the live transcript: messages, tool calls and results, images, queued messages with
  **Send now**, a "while you were away" summary and a floating **Newest** button.
- Reply, attach photos/files, send keys, answer permission prompts and menus with one tap, answer
  Claude Code's multiple-choice questions (AskUserQuestion) and OpenCode's question forms.
- Structured approval cards: plans as formatted markdown, commands as code, edits as diffs, new files'
  content, web fetches' URLs, for Claude Code and OpenCode; one-line summaries in the sessions list and
  notifications.
- OpenCode: thinking models' reasoning as collapsed, expandable "Thinking" blocks.
- **Stop** button (Esc / interrupt) while the agent works, and **Run in background** (Claude Code's
  Ctrl+B) when a long-running command or subagent can be moved to the background.
- Terminal tab (live tmux pane, or OpenCode's own terminal), Changes tab (`git diff` of the session's repo).
- Session header: context-window % (with Claude Code's auto-compact threshold and Compact now) and the
  session's subagents, each readable as a read-only chat; clear finished subagents.
- Start and resume sessions from the phone with model, effort and permission mode (Claude Code) or
  model, variant and agent (OpenCode); command palette and quick replies; transcript search.

### Notifications and reviews
- Web Push when a session needs permission, asks a question or finishes, with **Allow** in the
  notification; quiet while you're typing at the PC.
- Image reviews: `agents-away review` (and the `agents-away-review` skill for Claude Code and OpenCode)
  sends screenshots to the phone for Approve / Request changes / Reject with a comment; withdraw,
  dismiss and clear history; swipeable image viewer.

### Security
- One-time pairing links (valid 10 minutes), per-device sign-ins that expire after a configurable period
  without use (1 day – 1 year, default 30 days), paired-device list with sign-out; only hashes of
  sign-ins are stored. HTTPS with a private CA generated on the PC, limited (name constraints) to private
  addresses and the PC's own names; `agents-away pair` prints its fingerprint to compare on the phone.
  The local API for hooks and the CLI listens on 127.0.0.1 only.
- Answers are tied to the prompt they were meant for: a stale notification's **Allow** can't approve a
  different prompt that has appeared since.
- Strict Content-Security-Policy and related headers; chat markdown can't carry styles, forms or
  external images; the WebSocket only accepts the app's own origin.
- Content an agent or a downloaded repo controls can't run commands: tmux formats in folder names are
  escaped, and the Changes tab ignores the repo's own git hooks, fsmonitor, diff drivers and filters.

### Setup and tooling
- `install.sh` (idempotent, `--uninstall`), `agents-away hooks install`, `agents-away skill install`,
  `claude` wrappers for fish and bash/zsh, systemd user service, `aa` alias.
- Themes: Auto, Warm Light, Warm Dark, Light, Dark, Black; accent colours and text size.
- Test suite (`bun test`), CI on GitHub Actions, demo mode with made-up data (`bun run demo`) and
  automated README screenshots (`bun run screenshots`).
