# Installed by Agents Away. Runs interactive pi sessions inside the dedicated "agents-away" tmux
# socket so the Agents Away phone app can watch and answer them.
# Bypass once with `command pi …`, or set AWAY_NO_TMUX=1.
function pi --wraps pi --description 'pi in an Agents Away tmux session'
    if set -q TMUX; or set -q AWAY_NO_TMUX; or not status is-interactive; or not isatty stdin; or not isatty stdout
        command pi $argv
        return $status
    end
    for a in $argv
        if contains -- $a -p --print -v --version -h --help --mode
            command pi $argv
            return $status
        end
    end
    if test (count $argv) -gt 0; and contains -- $argv[1] install remove uninstall update list config
        command pi $argv
        return $status
    end
    # AWAY_TMUX_SOCKET / AWAY_CONFIG_DIR: same overrides as the server (e.g. a separate test instance).
    set -l sock agents-away
    set -q AWAY_TMUX_SOCKET; and set sock $AWAY_TMUX_SOCKET
    set -l conf ~/.config/agents-away/tmux.conf
    set -q AWAY_CONFIG_DIR; and set conf $AWAY_CONFIG_DIR/tmux.conf
    set -l base (string lower -- (basename $PWD) | string replace -ra '[^a-z0-9_-]+' '-' | string trim -c '-' | string sub -l 20)
    test -n "$base"; or set base home
    set -l name pi-$base
    set -l i 2
    while tmux -L $sock -f $conf has-session -t "=$name" 2>/dev/null
        set name pi-$base-$i
        set i (math $i + 1)
    end
    set -l envargs
    for v in PATH LANG LC_ALL DISPLAY WAYLAND_DISPLAY XDG_RUNTIME_DIR XDG_SESSION_TYPE XDG_CURRENT_DESKTOP DBUS_SESSION_BUS_ADDRESS COLORTERM SSH_AUTH_SOCK EDITOR VISUAL
        if set -q $v
            set -a envargs -e "$v="(string join : -- $$v)
        end
    end
    tmux -L $sock -f $conf new-session -s $name -c (string replace -a '#' '##' -- $PWD) $envargs -- (command -s pi) $argv
end
