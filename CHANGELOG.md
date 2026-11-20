# Changelog

All notable changes to Agents Away. Versions follow [Semantic Versioning](https://semver.org/); while the
version is 0.x, minor releases may change behaviour or configuration.

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
- `/btw` from the phone: the side answer opens in a modal (read from Claude Code's panel), and closing it
  closes the panel on the PC too.
- Waiting, explained: a pending `Yield` lists what it waits for (running subagents and background
  commands, with how long each has run); `ScheduleWakeup` and `sleep N` show a live countdown.
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
- `agents-away pair <interface|ip>` makes the QR codes for that address (e.g. `wg0` for a VPN) instead of
  the LAN one, and refuses addresses the HTTPS certificate doesn't cover (saying how to add them).
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
- Languages: the phone app in English, Spanish or Brazilian Portuguese, following the phone's language
  or chosen under ⚙ → Appearance (per phone). Notifications and the CLI stay in English.
- Test suite (`bun test`), CI on GitHub Actions, demo mode with made-up data (`bun run demo`) and
  automated README screenshots (`bun run screenshots`).
