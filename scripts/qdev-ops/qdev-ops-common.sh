#!/usr/bin/env bash
# Shared helpers for the qdev-20261029-01 operations scripts. Sourced, never executed.
# No script here talks to any service except through `neonctl`, and none prints a create/connection response.
ORG="${QDEV_NEON_ORG:-}"
REGION=aws-us-east-2
P=myeve-qdev-20261029
SERVICES="app factory relay missioncontrol accounting witness"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INV="${QDEV_INVENTORY:-$HERE/resource-inventory.json}"

die() { echo "$1" >&2; exit "${2:-2}"; }
require_org() {
  [[ "$ORG" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$ ]] || die "REFUSED: exact QDEV_NEON_ORG is required"
}

# The operator store holds raw create responses (connection credentials). It must be an existing,
# owner-only directory outside any temp location and outside the coding-agent workspace/inventory dir.
require_operator_store() {
  local s="${QDEV_OPERATOR_STORE:-}"
  [[ -n "$s" && "$s" == /* && -d "$s" ]] || die "REFUSED: QDEV_OPERATOR_STORE must be an existing absolute directory"
  s="$(cd "$s" && pwd -P)"
  local metadata
  metadata="$(python3 - "$s" <<'PYSTAT'
import os,stat,sys
s=os.stat(sys.argv[1]);print(format(stat.S_IMODE(s.st_mode),"o"),s.st_uid)
PYSTAT
)" || die "REFUSED: operator store metadata unavailable"
  [[ "$metadata" == "700 $(id -u)" ]] || die "REFUSED: QDEV_OPERATOR_STORE must be mode 700 and owned by the operator"
  case "$s/" in
    /tmp/*|/private/tmp/*|/var/folders/*|/private/var/folders/*|"$HERE"/*|"$(pwd -P)"/*) die "REFUSED: QDEV_OPERATOR_STORE must not be a temp location or inside the working/inventory directory" ;;
  esac
  OPERATOR_STORE="$s"
}

# Exact-name lookup (never a prefix match). Prints the project id or nothing.
find_project_id() { # name, list-json-on-stdin
  python3 -c '
import sys,json
name=sys.argv[1]
try:
    data=json.load(sys.stdin)
    if not isinstance(data,dict) or not isinstance(data.get("projects"),list): raise ValueError()
    matches=[p for p in data["projects"] if isinstance(p,dict) and p.get("name")==name]
    if len(matches)>1: raise ValueError()
    if matches:
        import re
        pid=matches[0].get("id")
        if not isinstance(pid,str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{2,63}",pid): raise ValueError()
        print(pid)
except Exception:
    sys.exit("REFUSED: project listing is unavailable, malformed or ambiguous; create nothing")' "$1"
}

# Reduces a raw create response to an allow-listed, ID-only record. Anything else is dropped.
sanitize_create() { # service, stdin: raw json -> stdout: one json object; exit 3 if reported plan is not free
  python3 -c '
import sys,json,re
service=sys.argv[1]
raw=json.load(sys.stdin); p=raw.get("project",{})
def s(v,pat):
    return v if isinstance(v,str) and re.fullmatch(pat,v) else None
rec={"service":service,"projectId":s(p.get("id"),r"[A-Za-z0-9_-]{3,64}"),"name":s(p.get("name"),r"[A-Za-z0-9_.-]{3,100}"),
     "region":s(p.get("region_id"),r"[a-z0-9-]{3,40}"),"pgVersion":p.get("pg_version") if isinstance(p.get("pg_version"),int) else None,
     "createdAt":s(p.get("created_at"),r"[0-9T:.+Z-]{10,40}"),"plan":(p.get("plan") if isinstance(p.get("plan"),str) and re.fullmatch(r"[A-Za-z0-9_-]{1,32}",p.get("plan")) else "UNREPORTED")}
if not rec["projectId"] or not rec["name"]: sys.exit(4)
print(json.dumps(rec))
sys.exit(3 if rec["plan"] not in ("free","Free","FREE") else 0)' "$1"
}

inventory_ids() { # prints validated "service<TAB>projectId<TAB>name" per recorded resource
  require_org
  [[ -f "$INV" ]] || die "REFUSED: resource inventory not found (nothing recorded to act on)"
  # Validate the ENTIRE inventory before any caller acts on a row. The service/name relationship is fixed here;
  # a mutable service label cannot reclassify accounting or witness as a deletable application resource.
  python3 - "$INV" "$ORG" "$REGION" "$P" <<'PYVALIDATE'
import sys,json,re
try:
    path,org,region,prefix=sys.argv[1:]
    d=json.load(open(path))
    def require(condition):
        if not condition: raise ValueError()
    require(d.get("schema")=="qdev-resource-inventory/v1" and d.get("org")==org and d.get("region")==region)
    rows=d["resources"]; require(isinstance(rows,list))
    allowed={"app","factory","relay","missioncontrol","accounting","witness"}
    ids=set(); services=set(); validated=[]
    for r in rows:
        service=r["service"]; pid=r["projectId"]; name=r["name"]
        require(isinstance(service,str) and service in allowed and service not in services)
        require(isinstance(pid,str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{2,63}",pid) and pid not in ids)
        require(name==prefix+"-"+service)
        services.add(service); ids.add(pid); validated.append((service,pid,name))
except Exception:
    sys.exit("REFUSED: inventory scope, resource binding or uniqueness is invalid; retain everything")
for row in validated: print("\t".join(row))
PYVALIDATE
}
