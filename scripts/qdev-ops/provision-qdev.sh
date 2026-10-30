#!/usr/bin/env bash
# qdev-20261029-01 non-production provisioning. DRY RUN unless --execute AND QDEV_OWNER_APPROVAL_REF AND QDEV_OPERATOR_STORE.
# Requires the exact runtime QDEV_NEON_ORG; no organization is embedded in source.
# Creates only: six Neon projects (PG17), created WITHOUT any plan/upgrade option (a Free project is never silently upgraded).
# Raw create responses (connection credentials) go ONLY to the operator store (mode 700 dir, 600 files, outside temp and
# outside the working directory). The coding-agent-visible resource-inventory.json is an ID-only allow-list record.
# Vercel projects/Blob are created by the operator step in the runbook.
set -euo pipefail
umask 077
source "$(cd "$(dirname "$0")" && pwd)/qdev-ops-common.sh"
EXEC=0; [[ "${1:-}" == "--execute" ]] && EXEC=1
if (( EXEC )); then
  [[ -n "${QDEV_OWNER_APPROVAL_REF:-}" ]] || die "REFUSED: QDEV_OWNER_APPROVAL_REF is required"
  require_org
  require_operator_store
fi
RECORDS=""; STOP=0
for s in $SERVICES; do
  name="$P-$s"
  create=(neonctl projects create --name "$name" --org-id "$ORG" --region-id "$REGION" --pg-version 17 -o json)
  if (( ! EXEC )); then echo "DRY-RUN: ${create[*]}"; continue; fi
  existing="$(neonctl projects list --org-id "$ORG" -o json | find_project_id "$name")"
  if [[ -n "$existing" ]]; then echo "SKIP existing $name ($existing); reconcile it via the inventory, never by re-creating"; continue; fi
  raw="$(mktemp "$OPERATOR_STORE/.create.XXXXXX")"
  if ! "${create[@]}" > "$raw"; then rm -f "$raw"; echo "STOP: create failed for $name (nothing further created)" >&2; STOP=5; break; fi
  chmod 600 "$raw"; mv "$raw" "$OPERATOR_STORE/$name.create.json"
  rc=0; rec="$(sanitize_create "$s" < "$OPERATOR_STORE/$name.create.json")" || rc=$?
  [[ -z "$rec" ]] || RECORDS="$RECORDS$rec"$'\n'
  echo "CREATED $name (credentials stay in the operator store; only IDs are recorded)"
  if (( rc == 3 )); then echo "STOP: $name has no positive Free-plan evidence; no further projects created. Review the exact organization and plan before proceeding." >&2; STOP=3; break; fi
  if (( rc != 0 )); then echo "STOP: could not record IDs for $name" >&2; STOP=4; break; fi
done
if (( EXEC )) && [[ -n "$RECORDS" ]]; then
  printf '%s' "$RECORDS" | python3 -c '
import sys,json,os
path,org,region=sys.argv[1:4]
inv=json.load(open(path)) if os.path.exists(path) else {"schema":"qdev-resource-inventory/v1","org":org,"region":region,"credentialsRecorded":False,"resources":[]}
known={r["projectId"] for r in inv["resources"]}
for line in sys.stdin.read().splitlines():
    r=json.loads(line)
    if r["projectId"] not in known: inv["resources"].append(r)
tmp=path+".tmp"; open(tmp,"w").write(json.dumps(inv,indent=2)+"\n"); os.replace(tmp,path)' "$INV" "$ORG" "$REGION"
  # Defense in depth: the agent-visible inventory must never contain connection material.
  if grep -Eqi 'postgres(ql)?://|passw|secret|token|connection_uri' "$INV"; then rm -f "$INV"; echo "STOP: inventory contained connection material and was removed" >&2; exit 6; fi
  echo "INVENTORY written (IDs only): $INV"
fi
exit "$STOP"
