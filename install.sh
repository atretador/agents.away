#!/usr/bin/env bash
# Agents Away installer (Linux, systemd user session). Safe to re-run: every step is idempotent.
#
#   ./install.sh               install / update
#   ./install.sh --no-shell    don't install the `claude` tmux wrapper into your shell
#   ./install.sh --uninstall   remove the service, hooks, wrapper, CLI link and skill
#                              (keeps ~/.config/agents-away and ~/.local/share/agents-away)
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CFG="${AWAY_CONFIG_DIR:-$HOME/.config/agents-away}"
BIN="$HOME/.local/bin"
UNIT="$HOME/.config/systemd/user/agents-away.service"
SKILL="$HOME/.claude/skills/agents-away-review"
SH_NAME=$(basename "$(getent passwd "$USER" | cut -d: -f7 2>/dev/null || echo "${SHELL:-bash}")")
RC_LINE="[ -f \"$CFG/claude.sh\" ] && . \"$CFG/claude.sh\"  # Agents Away: run claude inside tmux"

say()  { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  !\033[0m %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

shell_rc() { case "$SH_NAME" in zsh) echo "$HOME/.zshrc" ;; bash) echo "$HOME/.bashrc" ;; *) echo "" ;; esac; }

if [[ "${1:-}" == "--uninstall" ]]; then
  say "Stopping and removing the service"
  systemctl --user disable --now agents-away.service 2>/dev/null || true
  rm -f "$UNIT"; systemctl --user daemon-reload || true
  say "Removing Claude Code hooks"
  [[ -x "$ROOT/bin/agents-away" ]] && have bun && "$ROOT/bin/agents-away" hooks uninstall || true
  say "Removing the claude wrapper, CLI link and skill"
  rm -f "$HOME/.config/fish/functions/claude.fish" "$CFG/claude.sh"
  [[ -f "$HOME/.config/fish/functions/pi.fish" ]] && grep -q "Agents Away" "$HOME/.config/fish/functions/pi.fish" && rm -f "$HOME/.config/fish/functions/pi.fish"
  rc=$(shell_rc); [[ -n "$rc" && -f "$rc" ]] && sed -i '\|# Agents Away: run claude inside tmux$|d' "$rc"
  [[ -L "$BIN/agents-away" ]] && rm -f "$BIN/agents-away"
  [[ -L "$BIN/aa" && "$(readlink "$BIN/aa")" == "$ROOT/bin/agents-away" ]] && rm -f "$BIN/aa"
  if [[ -x "$ROOT/bin/agents-away" ]] && have bun; then "$ROOT/bin/agents-away" skill uninstall || true; else rm -rf "$SKILL"; fi
  say "Done. Config, certificates and reviews are kept in $CFG and ~/.local/share/agents-away (delete them by hand if you want)."
  exit 0
fi

NO_SHELL=0; [[ "${1:-}" == "--no-shell" ]] && NO_SHELL=1

say "Checking requirements"
missing=()
for c in bun tmux openssl systemctl; do have "$c" || missing+=("$c"); done
if ((${#missing[@]})); then
  echo "Missing: ${missing[*]}. Install them first (bun: https://bun.sh)." >&2; exit 1
fi
have claude   || warn "claude (Claude Code) isn't on PATH — Agents Away will have nothing to show until it is."
have rg       || warn "ripgrep (rg) not found — transcript search in the app won't work."
have qrencode || warn "qrencode not found — 'agents-away pair' will print links instead of QR codes."
have opencode || echo "    (OpenCode not found — optional; OpenCode sessions appear automatically if you install it.)"

say "Installing dependencies"
(cd "$ROOT" && bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null)

say "Certificates"
if [[ -f "$CFG/certs/server.crt" ]]; then echo "    already present ($CFG/certs) — run bin/agents-away-certs again if your IP changes"
else "$ROOT/bin/agents-away-certs"; fi

say "Config"
mkdir -p "$CFG" "$BIN"
[[ -f "$CFG/tmux.conf" ]] || cp "$ROOT/tmux.conf" "$CFG/tmux.conf"
ln -sfn "$ROOT/bin/agents-away" "$BIN/agents-away"
# Short alias, unless something else already owns the name.
if [[ ! -e "$BIN/aa" || -L "$BIN/aa" && "$(readlink "$BIN/aa")" == "$ROOT/bin/agents-away" ]] && ! { have aa && [[ "$(command -v aa)" != "$BIN/aa" ]]; }; then
  ln -sfn "$ROOT/bin/agents-away" "$BIN/aa"
else warn "'aa' is already taken on this system — use the full 'agents-away' command."; fi
echo "    agents-away CLI (alias aa) → $BIN/agents-away"
case ":$PATH:" in *":$BIN:"*) ;; *) warn "$BIN is not on your PATH; add it so hooks and 'agents-away' work." ;; esac

say "Claude Code hooks"
"$ROOT/bin/agents-away" hooks install

say "agents-away-review skill (lets Claude Code / OpenCode send you images to approve)"
"$ROOT/bin/agents-away" skill install

if ((NO_SHELL)); then
  say "Skipping the claude → tmux wrapper (--no-shell)"
else
  say "claude → tmux wrapper for $SH_NAME"
  case "$SH_NAME" in
    fish)
      mkdir -p "$HOME/.config/fish/functions"
      if [[ -f "$HOME/.config/fish/functions/claude.fish" ]] && ! grep -q "Agents Away" "$HOME/.config/fish/functions/claude.fish"; then
        warn "~/.config/fish/functions/claude.fish exists and isn't Agents Away's — left alone. See shell/claude.fish."
      else cp "$ROOT/shell/claude.fish" "$HOME/.config/fish/functions/claude.fish"; echo "    installed ~/.config/fish/functions/claude.fish"; fi
      # pi (https://pi.dev), only if it's installed
      if command -v pi >/dev/null 2>&1; then
        if [[ -f "$HOME/.config/fish/functions/pi.fish" ]] && ! grep -q "Agents Away" "$HOME/.config/fish/functions/pi.fish"; then
          warn "~/.config/fish/functions/pi.fish exists and isn't Agents Away's — left alone. See shell/pi.fish."
        else cp "$ROOT/shell/pi.fish" "$HOME/.config/fish/functions/pi.fish"; echo "    installed ~/.config/fish/functions/pi.fish"; fi
      fi ;;
    bash|zsh)
      cp "$ROOT/shell/claude.sh" "$CFG/claude.sh"
      rc=$(shell_rc); touch "$rc"
      grep -qF "# Agents Away: run claude inside tmux" "$rc" || echo "$RC_LINE" >> "$rc"
      echo "    sourced from $rc (open a new terminal)" ;;
    *) warn "Unknown shell '$SH_NAME' — start sessions with: tmux -L agents-away -f $CFG/tmux.conf new -- claude" ;;
  esac
fi

say "systemd user service"
mkdir -p "$(dirname "$UNIT")"
sed -e "s|@BUN@|$(command -v bun)|" -e "s|@ROOT@|$ROOT|g" -e "s|@HOME@|$HOME|" -e "s|@PATH@|$BIN:$PATH|" \
  "$ROOT/agents-away.service.in" > "$UNIT"
systemctl --user daemon-reload
systemctl --user enable agents-away.service >/dev/null 2>&1
systemctl --user restart agents-away.service
sleep 2
if systemctl --user is-active --quiet agents-away.service; then echo "    running"; else
  warn "service failed to start — see: journalctl --user -u agents-away -n 50"; exit 1; fi
if ! loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q yes; then
  echo "    tip: 'loginctl enable-linger $USER' keeps Agents Away running while you're logged out"
fi

cat <<MSG

$(printf '\033[1;32mAgents Away is installed.\033[0m')

$(printf '\033[1;33m')Security: Agents Away is for a trusted private network (home LAN or your own VPN), and securing
that network is up to you. A paired phone can type into your sessions and approve commands.
Never expose ports 7443/7440 to the internet; use a VPN (WireGuard, Tailscale) to reach it
from outside.$(printf '\033[0m')

Next:
  1. Allow the ports from your LAN/VPN only if you run a firewall: 7443/tcp (app) and 7440/tcp (setup page).
     e.g. ufw:  sudo ufw allow from 192.168.0.0/16 to any port 7440,7443 proto tcp
  2. Run   agents-away pair   and follow it on your phone (install the CA, then open the pairing link).
  3. Start Claude Code in a new terminal as usual — sessions show up in the app.
MSG
