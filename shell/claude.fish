# Installed by Agents Away. Runs interactive Claude Code sessions inside the dedicated "agents-away" tmux
# socket so the Agents Away phone app can watch and answer them.
# Bypass once with `command claude …`, or set AWAY_NO_TMUX=1.
function claude --wraps claude --description 'Claude Code in a Agents Away tmux session'
    if set -q TMUX; or set -q AWAY_NO_TMUX; or not status is-interactive; or not isatty stdin; or not isatty stdout
        command claude $argv
        return $status
    end
    for a in $argv
        if contains -- $a -p --print -v --version -h --help
            command claude $argv
            return $status
        end
    end
    if test (count $argv) -gt 0; and contains -- $argv[1] mcp config doctor update install plugin plugins setup-token migrate-installer auth
        command claude $argv
        return $status
    end
    set -l conf ~/.config/agents-away/tmux.conf
    set -l base (string lower -- (basename $PWD) | string replace -ra '[^a-z0-9_-]+' '-' | string trim -c '-' | string sub -l 20)
    test -n "$base"; or set base home
    set -l name cc-$base
    set -l i 2
    while tmux -L agents-away -f $conf has-session -t "=$name" 2>/dev/null
        set name cc-$base-$i
        set i (math $i + 1)
    end
    set -l envargs
    for v in PATH LANG LC_ALL DISPLAY WAYLAND_DISPLAY XDG_RUNTIME_DIR XDG_SESSION_TYPE XDG_CURRENT_DESKTOP DBUS_SESSION_BUS_ADDRESS COLORTERM SSH_AUTH_SOCK EDITOR VISUAL
        if set -q $v
            set -a envargs -e "$v="(string join : -- $$v)
        end
    end
    tmux -L agents-away -f $conf new-session -s $name -c $PWD $envargs -- (command -s claude) $argv
end
