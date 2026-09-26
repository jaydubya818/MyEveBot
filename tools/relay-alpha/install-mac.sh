#!/bin/zsh
set -euo pipefail
umask 077

if [[ $# -ne 2 ]]; then
  print -u2 'Usage: install-mac.sh /path/to/alpha-credential.json /path/to/relay-delivery-key.json'
  exit 2
fi

worker_dir="$(cd "$(dirname "$0")" && pwd -P)"
repository_dir="$(cd "$worker_dir/../.." && pwd -P)"
support_dir="$HOME/Library/Application Support/Alpha Relay"
agent_file="$HOME/Library/LaunchAgents/com.jaywest.alpha-relay.plist"
node_bin="$(command -v node)"
mkdir -p "$support_dir" "$HOME/Library/LaunchAgents"
chmod 700 "$support_dir"
install -m 600 "$worker_dir/alpha-production.json" "$support_dir/config.json"
install -m 600 "$1" "$support_dir/credential.json"
install -m 600 "$2" "$support_dir/delivery-key.json"

python3 - "$agent_file" "$node_bin" "$worker_dir/worker.mjs" "$repository_dir" "$support_dir" <<'PY'
import plistlib
import sys
from pathlib import Path

agent_file, node_bin, worker, repo, support = sys.argv[1:]
values = {
    'Label': 'com.jaywest.alpha-relay',
    'ProgramArguments': [node_bin, '--import', 'tsx', worker],
    'WorkingDirectory': repo,
    'EnvironmentVariables': {
        'ALPHA_RELAY_CONFIG_FILE': f'{support}/config.json',
        'ALPHA_RELAY_CREDENTIAL_FILE': f'{support}/credential.json',
        'ALPHA_RELAY_PUBLIC_KEY_FILE': f'{support}/delivery-key.json',
        'ALPHA_RELAY_STATE_FILE': f'{support}/state.json',
    },
    'RunAtLoad': True,
    'KeepAlive': True,
    'StandardOutPath': f'{support}/stdout.log',
    'StandardErrorPath': f'{support}/stderr.log',
}
Path(agent_file).write_bytes(plistlib.dumps(values))
Path(agent_file).chmod(0o600)
PY

launchctl bootout "gui/$(id -u)/com.jaywest.alpha-relay" 2>/dev/null || true
for attempt in 1 2 3; do
  if launchctl bootstrap "gui/$(id -u)" "$agent_file"; then
    break
  fi
  if [[ "$attempt" -eq 3 ]]; then
    print -u2 'Alpha LaunchAgent could not start after three attempts.'
    exit 1
  fi
  sleep 1
done
launchctl kickstart -k "gui/$(id -u)/com.jaywest.alpha-relay"
launchctl print "gui/$(id -u)/com.jaywest.alpha-relay" | sed -n '1,20p'
