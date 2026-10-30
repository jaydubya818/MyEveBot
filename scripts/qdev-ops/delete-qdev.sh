#!/usr/bin/env bash
# qdev-20261029-01 DESTRUCTIVE cleanup. Never the default rollback. DRY RUN unless --execute AND a delete approval that is
# separate from the activation approval AND a retention attestation. Acts only on EXACT recorded project IDs whose live name
# still matches; never selects by name prefix. The accounting and witness projects are NEVER deleted by this script.
set -euo pipefail
umask 077
source "$(cd "$(dirname "$0")" && pwd)/qdev-ops-common.sh"
EXEC=0; [[ "${1:-}" == "--execute" ]] && EXEC=1
if (( EXEC )); then
  [[ -n "${QDEV_DELETE_APPROVAL_REF:-}" ]] || die "REFUSED: QDEV_DELETE_APPROVAL_REF (separate from the activation approval) is required"
  f="${QDEV_RETENTION_CHECK_FILE:-}"
  [[ -n "$f" && -f "$f" && -n "${QDEV_RETENTION_CHECK_SHA256:-}" ]] || die "REFUSED: retention attestation file and QDEV_RETENTION_CHECK_SHA256 are required"
  [[ "$(python3 -c 'import sys,hashlib; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$f")" == "$QDEV_RETENTION_CHECK_SHA256" ]] || die "REFUSED: retention attestation hash mismatch"
fi
rows="$(inventory_ids)"
while IFS=$'\t' read -r service id name; do
  [[ -n "$id" ]] || continue
  if [[ "$service" == "accounting" || "$service" == "witness" ]]; then echo "RETAINED $name: evidence stores are never deleted by this script"; continue; fi
  got="$(neonctl projects get "$id" --org-id "$ORG" -o json | python3 -c 'import sys,json; p=json.load(sys.stdin).get("project",{}); print(p.get("id","")+"\t"+p.get("name",""))')"
  [[ "$got" == "$id"$'\t'"$name" ]] || die "REFUSED: recorded $service ($id) does not match the live resource" 7
  if (( EXEC )); then neonctl projects delete "$id" --org-id "$ORG" >/dev/null; echo "DELETED $name ($id)"; else echo "DRY-RUN: delete $name ($id)"; fi
done <<< "$rows"
