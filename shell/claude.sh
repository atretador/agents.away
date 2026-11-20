# shellcheck shell=bash
# Agents Away wrapper for bash and zsh (source this from ~/.bashrc or ~/.zshrc).
# Runs interactive Claude Code sessions inside the dedicated "agents-away" tmux socket so the
# Agents Away phone app can watch and answer them. Bypass once with `command claude …`,
# or set AWAY_NO_TMUX=1. Your normal tmux server and config are untouched.
claude() {
  if [ -n "${TMUX:-}" ] || [ -n "${AWAY_NO_TMUX:-}" ] || [ ! -t 0 ] || [ ! -t 1 ]; then
    command claude "$@"; return
  fi
  local a
  for a in "$@"; do
    case "$a" in -p|--print|-v|--version|-h|--help) command claude "$@"; return ;; esac
  done
  case "${1:-}" in
    mcp|config|doctor|update|install|plugin|plugins|setup-token|migrate-installer|auth) command claude "$@"; return ;;
  esac
  # AWAY_TMUX_SOCKET / AWAY_CONFIG_DIR: same overrides as the server (e.g. a separate test instance).
  local sock="${AWAY_TMUX_SOCKET:-agents-away}" conf="${AWAY_CONFIG_DIR:-$HOME/.config/agents-away}/tmux.conf" base name i=2 v val
  base=$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/^-+|-+$//g' | cut -c1-20)
  [ -n "$base" ] || base=home
  name="cc-$base"
  while tmux -L "$sock" -f "$conf" has-session -t "=$name" 2>/dev/null; do
    name="cc-$base-$i"; i=$((i + 1))
  done
  local envargs=()
  for v in PATH LANG LC_ALL DISPLAY WAYLAND_DISPLAY XDG_RUNTIME_DIR XDG_SESSION_TYPE XDG_CURRENT_DESKTOP \
           DBUS_SESSION_BUS_ADDRESS COLORTERM SSH_AUTH_SOCK EDITOR VISUAL; do
    eval "val=\${$v:-}"
    [ -n "$val" ] && envargs+=(-e "$v=$val")
  done
  # The real binary, not this function (bash: type -P, zsh: whence -p).
  local bin
  bin=$(type -P claude 2>/dev/null || whence -p claude 2>/dev/null)
  [ -n "$bin" ] || { echo "claude: not found on PATH" >&2; return 127; }
  # tmux expands #(...) in -c: double every "#" (a variable pattern, so bash and zsh read it the same).
  local hash='#'
  tmux -L "$sock" -f "$conf" new-session -s "$name" -c "${PWD//$hash/##}" "${envargs[@]}" -- "$bin" "$@"
}
