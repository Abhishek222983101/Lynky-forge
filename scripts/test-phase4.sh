#!/usr/bin/env bash
# Phase 4 E2E — simulates exact UI flows: RFQ form → quote → status machine → company 360
set -u
BASE="http://localhost:3001/api/v1"
PASS=0
FAIL=0

say()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS+1)); say "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); say "  ❌ $1"; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected [$3] got [$2])"; fi; }

TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"aarav@forge.demo","password":"ForgeOwner123!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
[ -n "$TOKEN" ] && ok "login" || { bad "login"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"
J='Content-Type: application/json'

jget(){ python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(\"d$1\"))" 2>/dev/null; }

say ""
say "=== 1. RFQ form flow — new company ==="
R=$(curl -s -X POST "$BASE/rfqs" -H "$AUTH" -H "$J" -d '{
  "partName":"Hydraulic Manifold Block","partNo":"MAN-7741","material":"EN24",
  "qty":120,"tolerance":"±0.02 mm","targetPrice":3200,"deadline":"2026-09-20",
  "drawingNotes":"Black oxide finish","source":"PHONE",
  "companyName":"Kirloskar Hydraulics","companyIndustry":"INDUSTRIAL","companyCity":"Kolhapur"}')
NEW_CO=$(echo "$R" | jget "['company']['id']")
NEW_DEAL=$(echo "$R" | jget "['deal']['id']")
NEW_RFQ=$(echo "$R" | jget "['rfq']['id']")
[ -n "$NEW_CO" ] && ok "new company created ($NEW_CO)" || { bad "new company"; echo "$R"; }
check "deal stage NEW_RFQ" "$(echo "$R" | jget "['deal']['stage']")" "NEW_RFQ"
check "deal value = 3200×120" "$(echo "$R" | jget "['deal']['value']")" "384000"

say ""
say "=== 2. RFQ form flow — existing company ==="
R2=$(curl -s -X POST "$BASE/rfqs" -H "$AUTH" -H "$J" -d "{
  \"partName\":\"Valve Body Casting\",\"partNo\":\"VLV-2210\",\"material\":\"Bronze\",
  \"qty\":300,\"tolerance\":\"±0.05 mm\",\"targetPrice\":980,\"deadline\":\"2026-10-01\",
  \"source\":\"WHATSAPP\",\"companyId\":\"$NEW_CO\"}")
check "existing company rfq ok" "$(echo "$R2" | jget "['company']['id']")" "$NEW_CO"
check "second deal created" "$(echo "$R2" | jget "['deal']['stage']")" "NEW_RFQ"

say ""
say "=== 3. Quote create on new deal (like quote detail page needs) ==="
Q=$(curl -s -X POST "$BASE/quotes" -H "$AUTH" -H "$J" -d "{
  \"dealId\":\"$NEW_DEAL\",
  \"lineItems\":[{\"description\":\"Manifold machining EN24\",\"qty\":120,\"unitPrice\":2800},{\"description\":\"Black oxide finishing\",\"qty\":120,\"unitPrice\":400}],
  \"terms\":[\"30% advance with PO\",\"Delivery 4 weeks from PO\",\"Prices ex-works Kolhapur\"],
  \"validUntil\":\"2026-09-30\"}")
QID=$(echo "$Q" | jget "['id']")
QNO=$(echo "$Q" | jget "['quoteNo']")
[ -n "$QID" ] && ok "quote created $QNO" || { bad "quote create"; echo "$Q"; }
check "server-side total = 120×2800+120×400" "$(echo "$Q" | jget "['totalAmount']")" "384000"

say ""
say "=== 4. Quote status machine (detail page actions) ==="
S=$(curl -s -X PATCH "$BASE/quotes/$QID/status" -H "$AUTH" -H "$J" -d '{"status":"SENT"}')
check "status SENT" "$(echo "$S" | jget "['quote']['status']")" "SENT"
TASKS_CREATED=$(echo "$S" | jget "len(['x'])" 2>/dev/null; echo "$S" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['tasksCreated']))" 2>/dev/null)
check "follow-up task auto-created" "$TASKS_CREATED" "1"
DEAL_STAGE=$(curl -s "$BASE/deals/$NEW_DEAL" -H "$AUTH" | jget "['stage']")
check "deal auto-advanced to QUOTE_SENT" "$DEAL_STAGE" "QUOTE_SENT"

say ""
say "=== 5. Invalid transitions rejected ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/quotes/$QID/status" -H "$AUTH" -H "$J" -d '{"status":"DRAFT"}')
check "SENT→DRAFT blocked" "$CODE" "400"

say ""
say "=== 6. Company 360 on new company (exact frontend query) ==="
C360=$(curl -s "$BASE/companies/$NEW_CO?include=deals,contacts,activities,tasks" -H "$AUTH")
check "360 deals count" "$(echo "$C360" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['deals']))")" "2"
ACT_COUNT=$(echo "$C360" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('activities',[])))")
[ "$ACT_COUNT" -ge 1 ] && ok "360 has activities ($ACT_COUNT)" || bad "360 activities empty"

say ""
say "=== 7. Frontend hook queries (exact) ==="
check "companies list" "$(curl -s "$BASE/companies" -H "$AUTH" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))' | python3 -c "import sys;n=int(sys.stdin.read());print('ok' if n>=1 else 'empty')")" "ok"
check "rfqs list" "$(curl -s "$BASE/rfqs?limit=200" -H "$AUTH" | jget "['total']" | python3 -c "import sys;n=int(sys.stdin.read());print('ok' if n>=10 else 'low')")" "ok"
QD=$(curl -s "$BASE/quotes/$QID" -H "$AUTH")
check "quote detail has rfq" "$(echo "$QD" | jget "['deal']['rfq']['partNo']")" "MAN-7741"
check "quote detail lineItems" "$(echo "$QD" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['lineItems']))")" "2"
check "quote detail terms" "$(echo "$QD" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['terms']))")" "3"

say ""
say "=== 8. Phase 2/3 regression ==="
check "dashboard ok" "$(curl -s "$BASE/dashboard" -H "$AUTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok' if 'pipelineValue' in d else 'bad')")" "ok"
check "deals list ok" "$(curl -s "$BASE/deals?limit=200&sort=updatedAt&order=desc" -H "$AUTH" | jget "['total']" | python3 -c "import sys;n=int(sys.stdin.read());print('ok' if n>=12 else 'low')")" "ok"
check "tasks list ok" "$(curl -s "$BASE/tasks?limit=5" -H "$AUTH" | python3 -c "import sys,json;print('ok' if json.load(sys.stdin)['total']>=1 else 'empty')")" "ok"

say ""
say "==================================="
say "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ] && say "ALL GREEN" || say "FAILURES PRESENT"
exit $FAIL
