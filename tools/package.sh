#!/usr/bin/env bash
# Builds the release downloads from a git checkout (used by .github/workflows/android.yml on a version tag):
#   agents-away-server-min-vX.Y.Z.tar.gz   the server and web app (what install.sh needs), no Android sources
#   agents-away-server-full-vX.Y.Z.tar.gz  the same plus the signed Android app in prebuilt/, so the setup page
#                                          offers it right after install.sh (no Android SDK needed)
#   agents-away-vX.Y.Z.apk                 the signed Android app on its own
#   SHA256SUMS                             checksums of all of the above
# Usage: tools/package.sh <signed.apk> <out-dir>     (the version comes from package.json)
set -euo pipefail
apk=${1:?signed APK}; out=${2:?output dir}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
v=$(jq -r .version package.json)
[[ -f "$apk" ]] || { echo "no APK at $apk" >&2; exit 1; }
mkdir -p "$out"; out=$(cd "$out" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# What a server install needs (install.sh, the service, the CLI, the web app) plus the docs.
paths=(src public bin shell skills install.sh agents-away.service.in tmux.conf package.json bun.lock
  README.md LICENSE CHANGELOG.md SECURITY.md .gitignore)
dir="agents-away-$v"
git archive --format=tar --prefix="$dir/" HEAD -- "${paths[@]}" | tar -x -C "$tmp"
# Committed files only, so nothing local (node_modules, keys, build output) can slip in.

tar -C "$tmp" --owner=0 --group=0 --sort=name -czf "$out/agents-away-server-min-v$v.tar.gz" "$dir"

sha=$(sha256sum "$apk" | cut -d' ' -f1)
mkdir -p "$tmp/$dir/prebuilt"
cp "$apk" "$tmp/$dir/prebuilt/agents-away.apk"
printf '{"version":"%s","sha256":"%s","size":%d,"builtAt":%d}\n' "$v" "$sha" "$(stat -c %s "$apk")" "$(($(date +%s) * 1000))" \
  > "$tmp/$dir/prebuilt/agents-away.json"
tar -C "$tmp" --owner=0 --group=0 --sort=name -czf "$out/agents-away-server-full-v$v.tar.gz" "$dir"

cp "$apk" "$out/agents-away-v$v.apk"
(cd "$out" && sha256sum "agents-away-server-min-v$v.tar.gz" "agents-away-server-full-v$v.tar.gz" "agents-away-v$v.apk" > SHA256SUMS)
echo "Packaged $v in $out:"; (cd "$out" && ls -l --time-style=+ | tail -n +2 && cat SHA256SUMS)
