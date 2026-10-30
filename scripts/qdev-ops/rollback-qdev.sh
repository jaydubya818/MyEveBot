#!/usr/bin/env bash
# qdev-20261029-01 activation ROLLBACK. NON-DESTRUCTIVE: it never deletes, suspends or modifies anything.
# It verifies each EXACT recorded project ID still carries its recorded name (read-only `neonctl projects get`) and writes a
# retention manifest. Accounting, witness, history, logs, artifacts and uncertain/UNKNOWN resources are RETAINED.
# Destructive cleanup is a separate, separately approved action (delete-qdev.sh) after retention checks.
set -euo pipefail
umask 077
source "$(cd "$(dirname "$0")" && pwd)/qdev-ops-common.sh"
OUT="${QDEV_ROLLBACK_MANIFEST:-$HERE/rollback-retention.json}"
rows="$(inventory_ids)"
verified=""
while IFS=$'\t' read -r service id name; do
  [[ -n "$id" ]] || continue
  got="$(neonctl projects get "$id" --org-id "$ORG" -o json | python3 -c 'import sys,json; p=json.load(sys.stdin).get("project",{}); print(p.get("id","")+"\t"+p.get("name",""))')"
  [[ "$got" == "$id"$'\t'"$name" ]] || die "REFUSED: recorded $service ($id) does not match the live resource; investigate, retain everything" 7
  verified="$verified$service"$'\t'"$id"$'\t'"$name"$'\n'
done <<< "$rows"
printf '%s' "$verified" | python3 -c '
import sys,json
res=[]
for line in sys.stdin.read().splitlines():
    s,i,n=line.split("\t")
    res.append({"service":s,"projectId":i,"name":n,"disposition":"RETAIN_EVIDENCE" if s in ("accounting","witness") else "RETAIN"})
print(json.dumps({"schema":"qdev-rollback-retention/v1","resources":res,
 "operatorChecklist":[
  "Disable ingress/admission first (qdev routes, Relay qdev connection, Factory dispatch); leave all ledgers untouched",
  "Revoke the Relay qdev connection and developer grant",
  "Stop the local Factory worker profile used for qdev",
  "Export and hash accounting, witness and journal stores; retain logs and artifacts; keep UNKNOWN/uncertain resources",
  "Do NOT delete any Neon project or Vercel resource; deletion is delete-qdev.sh under its own approval"]},indent=2))' > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
echo "ROLLBACK plan recorded (nothing deleted or modified): $OUT"
