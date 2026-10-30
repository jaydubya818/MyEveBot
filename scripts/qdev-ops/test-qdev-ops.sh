#!/usr/bin/env bash
# Mock-CLI tests for provision/rollback/delete. Uses a FAKE neonctl whose create output carries fake secret fields. No network,
# no real credentials, no real Neon. Run: ./test-qdev-ops.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$(mktemp -d "${TMPDIR:-/tmp}/qdev-ops-test.XXXXXX")" || exit 2           # scratch (temp location: must be refused as an operator store)
STORE_PARENT="${QDEV_OPS_TEST_STORE_PARENT:-$HOME}"
[[ "$STORE_PARENT" == /* && -d "$STORE_PARENT" ]] || exit 2
STORE="$(mktemp -d "$STORE_PARENT/.qdev-ops-test.XXXXXX")" || { rmdir "$W"; exit 2; }
[[ -n "$STORE" && -d "$STORE" ]] || exit 2
chmod 700 "$STORE"  # valid operator store (outside temp and cwd)
trap 'rm -rf "$W" "$STORE"' EXIT
SECRET="FAKE-SECRET-pw-9f3a"
export QDEV_NEON_ORG=org-qdev-fixture
mkdir -p "$W/bin"
cat > "$W/bin/neonctl" <<'MOCK'
#!/usr/bin/env python3
import sys,json,os
st=os.environ["MOCK_STATE"]; log=os.environ["MOCK_LOG"]
args=sys.argv[1:]; open(log,"a").write(" ".join(args)+"\n")
state=json.load(open(st)) if os.path.exists(st) else {"projects":[]}
def save(): json.dump(state,open(st,"w"))
if args[:2]==["projects","list"]: print("not-json" if os.environ.get("MOCK_BAD_LIST") else json.dumps({"projects":[{"id":p["id"],"name":p["name"]} for p in state["projects"]]}))
elif args[:2]==["projects","create"]:
    name=args[args.index("--name")+1]; plan=os.environ.get("MOCK_PLAN","free")
    p={"id":"proj-"+name.rsplit("-",1)[1]+"-1","name":name,"region_id":"aws-us-east-2","pg_version":17,"created_at":"2026-10-30T12:00:00Z","plan":plan}
    state["projects"].append(p); save()
    print(json.dumps({"project":p,"connection_uris":[{"connection_uri":"postgres://owner:"+os.environ["MOCK_SECRET"]+"@host/db"}],"databases":[],"roles":[{"name":"owner","password":os.environ["MOCK_SECRET"]}]}))
elif args[:2]==["projects","get"]:
    pid=args[2]; m=[p for p in state["projects"] if p["id"]==pid]
    if not m: sys.exit(1)
    print(json.dumps({"project":m[0]}))
elif args[:2]==["projects","delete"]:
    pid=args[2]; state["projects"]=[p for p in state["projects"] if p["id"]!=pid]; save(); print("{}")
else: sys.exit(9)
MOCK
chmod +x "$W/bin/neonctl"
export PATH="$W/bin:$PATH" MOCK_STATE="$W/state.json" MOCK_LOG="$W/calls.log" MOCK_SECRET="$SECRET"
export QDEV_INVENTORY="$W/inventory.json" QDEV_ROLLBACK_MANIFEST="$W/rollback.json"
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "PASS $1"; }
bad() { fail=$((fail+1)); echo "FAIL $1"; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
calls() { grep -c "^$1" "$MOCK_LOG" 2>/dev/null || true; }
reset() { [[ -n "$STORE" && -d "$STORE" ]] || exit 2; rm -f -- "$MOCK_STATE" "$MOCK_LOG" "$QDEV_INVENTORY" "$QDEV_ROLLBACK_MANIFEST" "$STORE"/*.create.json "$STORE"/.create.* 2>/dev/null; : > "$MOCK_LOG"; }

# 1 dry run
reset; out="$("$HERE/provision-qdev.sh" 2>&1)"
check "dry-run makes no create calls and writes nothing" '[[ "$(calls "projects create")" == 0 && ! -e "$QDEV_INVENTORY" && "$out" == *DRY-RUN* ]]'
# 2 approvals / store
reset; env -u QDEV_OWNER_APPROVAL_REF QDEV_OPERATOR_STORE="$STORE" "$HERE/provision-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "execute without approval ref is refused (exit 2, no calls)" '[[ $rc == 2 && "$(calls "projects")" == 0 ]]'
reset; QDEV_OWNER_APPROVAL_REF=ref "$HERE/provision-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "execute without an operator store is refused" '[[ $rc == 2 && "$(calls "projects")" == 0 ]]'
reset; QDEV_OWNER_APPROVAL_REF=ref QDEV_OPERATOR_STORE="$W" "$HERE/provision-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "a temp-location operator store is refused" '[[ $rc == 2 && "$(calls "projects")" == 0 ]]'
mkdir "$STORE/.open"; chmod 755 "$STORE/.open"
reset; QDEV_OWNER_APPROVAL_REF=ref QDEV_OPERATOR_STORE="$STORE/.open" "$HERE/provision-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "a non-700 operator store is refused" '[[ $rc == 2 && "$(calls "projects")" == 0 ]]'
rmdir "$STORE/.open"
# 3 execute
reset; env -u QDEV_NEON_ORG QDEV_OWNER_APPROVAL_REF=ref QDEV_OPERATOR_STORE="$STORE" "$HERE/provision-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "execute without an exact organization is refused before CLI calls" '[[ $rc == 2 && "$(calls "projects")" == 0 ]]'
reset; export QDEV_OWNER_APPROVAL_REF=ref QDEV_OPERATOR_STORE="$STORE"
out="$("$HERE/provision-qdev.sh" --execute 2>&1)"; rc=$?
check "execute creates exactly six projects, with no plan/upgrade flag" '[[ $rc == 0 && "$(calls "projects create")" == 6 ]] && ! grep -Eq -- "--plan|upgrade|launch" "$MOCK_LOG"'
check "agent-visible inventory is ID-only and has no credential material" '[[ -f "$QDEV_INVENTORY" ]] && ! grep -q "$SECRET" "$QDEV_INVENTORY" && ! grep -Eqi "postgres://|passw|connection_uri" "$QDEV_INVENTORY" && python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert len(d[\"resources\"])==6 and all(r[\"projectId\"] for r in d[\"resources\"])" "$QDEV_INVENTORY"'
check "stdout/stderr never print the create response or secret" '[[ "$out" != *"$SECRET"* && "$out" != *postgres://* ]]'
check "raw create responses live only in the 700 operator store as 600 files" '[[ "$(ls "$STORE"/*.create.json | wc -l | tr -d " ")" == 6 ]] && [[ "$(python3 -c "import os,stat,sys;print(format(stat.S_IMODE(os.stat(sys.argv[1]).st_mode),chr(111)))" "$STORE"/myeve-qdev-20261029-app.create.json)" == 600 ]] && grep -q "$SECRET" "$STORE"/myeve-qdev-20261029-app.create.json'
check "no secret was written to any temp location" '! grep -rqs "$SECRET" "$W" --include="*" --exclude="state.json" --exclude="bin"'
# 4 idempotence + decoy
python3 - <<PY
import json; s=json.load(open("$MOCK_STATE")); s["projects"].append({"id":"decoy-1","name":"myeve-qdev-20261029-app-extra"}); json.dump(s,open("$MOCK_STATE","w"))
PY
: > "$MOCK_LOG"; out="$("$HERE/provision-qdev.sh" --execute 2>&1)"
check "re-run skips existing exact names and creates nothing" '[[ "$(calls "projects create")" == 0 && "$out" == *"SKIP existing"* ]]'
reset; MOCK_BAD_LIST=1 "$HERE/provision-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "malformed project listing refuses creation" '[[ $rc != 0 && "$(calls "projects create")" == 0 ]]'
# 5 non-free plan stops
reset; MOCK_PLAN=launch "$HERE/provision-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "a reported non-Free plan stops after the first project (exit 3)" '[[ $rc == 3 && "$(calls "projects create")" == 1 ]]'
# An omitted plan is not evidence that the organization/project is Free.
reset; MOCK_PLAN=UNREPORTED "$HERE/provision-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "an unreported plan stops after the first project" '[[ $rc == 3 && "$(calls "projects create")" == 1 ]]'
# 6 rollback is non-destructive
reset; "$HERE/provision-qdev.sh" --execute >/dev/null 2>&1; : > "$MOCK_LOG"
"$HERE/rollback-qdev.sh" >/dev/null 2>&1; rc=$?
check "rollback records exact IDs and makes only read calls" '[[ $rc == 0 && "$(calls "projects delete")" == 0 && "$(calls "projects create")" == 0 && -f "$QDEV_ROLLBACK_MANIFEST" ]]'
check "rollback retains accounting/witness as evidence and everything else" 'python3 -c "import json,sys; d=json.load(open(sys.argv[1])); m={r[\"service\"]:r[\"disposition\"] for r in d[\"resources\"]}; assert m[\"accounting\"]==m[\"witness\"]==\"RETAIN_EVIDENCE\" and set(v for k,v in m.items() if k not in (\"accounting\",\"witness\"))=={\"RETAIN\"} and len(m)==6" "$QDEV_ROLLBACK_MANIFEST"'
python3 - <<PY
import json; s=json.load(open("$MOCK_STATE"))
for p in s["projects"]:
    if p["name"].endswith("-factory"): p["name"]="renamed"
json.dump(s,open("$MOCK_STATE","w"))
PY
"$HERE/rollback-qdev.sh" >/dev/null 2>&1; rc=$?
check "rollback refuses if a recorded ID no longer matches its recorded name" '[[ $rc == 7 ]]'
python3 - <<PY
import json; s=json.load(open("$MOCK_STATE"))
for p in s["projects"]:
    if p["name"]=="renamed": p["name"]="myeve-qdev-20261029-factory"
s["projects"].append({"id":"decoy-1","name":"myeve-qdev-20261029-app-extra"}); json.dump(s,open("$MOCK_STATE","w"))
PY
# Inventory classification is bound to the fixed service/name map, not a mutable label.
cp "$QDEV_INVENTORY" "$W/good-inventory.json"
python3 - "$QDEV_INVENTORY" <<'PYMISLABEL'
import sys,json
p=sys.argv[1]; d=json.load(open(p))
for r in d["resources"]:
    if r["service"]=="accounting": r["service"]="app"
json.dump(d,open(p,"w"))
PYMISLABEL
: > "$MOCK_LOG"; "$HERE/delete-qdev.sh" >/dev/null 2>&1; rc=$?
check "misclassified accounting is refused before any resource call" '[[ $rc != 0 && "$(calls "projects")" == 0 ]]'
: > "$MOCK_LOG"; PYTHONOPTIMIZE=1 "$HERE/delete-qdev.sh" >/dev/null 2>&1; rc=$?
check "inventory validation remains enforced with Python optimization" '[[ $rc != 0 && "$(calls "projects")" == 0 ]]'

cp "$W/good-inventory.json" "$QDEV_INVENTORY"
# 7 delete
: > "$MOCK_LOG"; "$HERE/delete-qdev.sh" >/dev/null 2>&1
check "delete dry-run deletes nothing" '[[ "$(calls "projects delete")" == 0 ]]'
QDEV_DELETE_APPROVAL_REF= "$HERE/delete-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "delete without its own approval is refused" '[[ $rc == 2 && "$(calls "projects delete")" == 0 ]]'
QDEV_DELETE_APPROVAL_REF=del "$HERE/delete-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "delete without a retention attestation is refused" '[[ $rc == 2 && "$(calls "projects delete")" == 0 ]]'
echo "retention exports hashed" > "$W/retention.txt"; h="$(python3 -c 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$W/retention.txt")"
QDEV_DELETE_APPROVAL_REF=del QDEV_RETENTION_CHECK_FILE="$W/retention.txt" QDEV_RETENTION_CHECK_SHA256=bad "$HERE/delete-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "delete with a wrong attestation hash is refused" '[[ $rc == 2 && "$(calls "projects delete")" == 0 ]]'
QDEV_DELETE_APPROVAL_REF=del QDEV_RETENTION_CHECK_FILE="$W/retention.txt" QDEV_RETENTION_CHECK_SHA256="$h" "$HERE/delete-qdev.sh" --execute >/dev/null 2>&1; rc=$?
check "approved delete removes only the four exact non-evidence IDs" '[[ $rc == 0 && "$(calls "projects delete")" == 4 ]] && ! grep -E "projects delete (decoy-1|proj-accounting|proj-witness)" "$MOCK_LOG" >/dev/null'
check "accounting, witness and the prefix decoy still exist" 'python3 -c "import json,sys; n={p[\"name\"] for p in json.load(open(sys.argv[1]))[\"projects\"]}; assert n=={\"myeve-qdev-20261029-accounting\",\"myeve-qdev-20261029-witness\",\"myeve-qdev-20261029-app-extra\"}, n" "$MOCK_STATE"'
"$HERE/teardown-qdev.sh" >/dev/null 2>&1; rc=$?
check "the superseded prefix-based teardown refuses to run" '[[ $rc == 2 ]]'
echo "---- passed=$pass failed=$fail"; (( fail == 0 ))
