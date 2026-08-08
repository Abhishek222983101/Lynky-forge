#!/usr/bin/env bash
# Lynky Forge — Phase 2 end-to-end API test suite
# Runs the full CRM flow against localhost:3001 and asserts on responses.
set -u
BASE="http://localhost:3001/api/v1"
PASS=0; FAIL=0
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1" 2>/dev/null; }

check() { # name, exit_code
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "  PASS  $1";
  else FAIL=$((FAIL+1)); echo "  FAIL  $1"; fi
}

echo "=== 0. AUTH ==="
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"aarav@forge.demo","password":"ForgeOwner123!"}' | J "d['accessToken']")
[ -n "$TOKEN" ]; check "owner login returns JWT" "$?"
AUTH="Authorization: Bearer $TOKEN"

UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" $BASE/companies)
[ "$UNAUTH" = "401" ]; check "no token → 401" "$?"

echo "=== 1. COMPANIES ==="
CO1=$(curl -s -X POST $BASE/companies -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Maruti Components Pvt Ltd","industry":"AUTOMOTIVE","city":"Gurugram","size":"200-500","annualPotential":4500000,"source":"TRADE_SHOW","tags":["tier-1","oem"]}')
CO1_ID=$(echo "$CO1" | J "d['id']")
[ -n "$CO1_ID" ]; check "create company" "$?"

CO2=$(curl -s -X POST $BASE/companies -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Vertex Aerospace Systems","industry":"AEROSPACE","city":"Bengaluru"}')
CO2_ID=$(echo "$CO2" | J "d['id']")
[ -n "$CO2_ID" ]; check "create second company" "$?"

LIST=$(curl -s "$BASE/companies" -H "$AUTH")
echo "$LIST" | grep -q "Maruti Components"; check "list contains company" "$?"

SEARCH=$(curl -s "$BASE/companies?q=maruti" -H "$AUTH")
echo "$SEARCH" | grep -q "Maruti Components" && echo "$SEARCH" | grep -qv "Vertex"; check "search filter q=" "$?"

IND=$(curl -s "$BASE/companies?industry=AEROSPACE" -H "$AUTH")
echo "$IND" | grep -q "Vertex" && echo "$IND" | grep -qv "Maruti"; check "industry filter" "$?"

PATCH=$(curl -s -X PATCH $BASE/companies/$CO1_ID -H 'Content-Type: application/json' -H "$AUTH" -d '{"city":"Manesar"}')
echo "$PATCH" | grep -q "Manesar"; check "update company" "$?"

echo "=== 2. CONTACTS ==="
CT1=$(curl -s -X POST $BASE/companies/$CO1_ID/contacts -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Rajesh Iyer","role":"Head of Procurement","phone":"+91-98111-22334","email":"rajesh@maruticomp.in","isPrimary":true}')
CT1_ID=$(echo "$CT1" | J "d['id']")
[ -n "$CT1_ID" ]; check "add primary contact" "$?"

CT2=$(curl -s -X POST $BASE/companies/$CO1_ID/contacts -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Sunita Rao","role":"Quality Manager","isPrimary":true}')
CT2_ID=$(echo "$CT2" | J "d['id']")
CTS=$(curl -s "$BASE/companies/$CO1_ID/contacts" -H "$AUTH")
OLD_PRIMARY=$(echo "$CTS" | python3 -c "import sys,json;d=json.load(sys.stdin);print([c['isPrimary'] for c in d if c['id']=='$CT1_ID'][0])")
NEW_PRIMARY=$(echo "$CTS" | python3 -c "import sys,json;d=json.load(sys.stdin);print([c['isPrimary'] for c in d if c['id']=='$CT2_ID'][0])")
[ "$OLD_PRIMARY" = "False" ] && [ "$NEW_PRIMARY" = "True" ]; check "primary demotion on new primary" "$?"

CTP=$(curl -s -X PATCH $BASE/contacts/$CT2_ID -H 'Content-Type: application/json' -H "$AUTH" -d '{"role":"Sr. Quality Manager"}')
echo "$CTP" | grep -q "Sr. Quality Manager"; check "patch contact" "$?"

echo "=== 3. DEALS ==="
D1=$(curl -s -X POST $BASE/deals -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"title\":\"Maruti — CNC Bracket BRK-5532\",\"companyId\":\"$CO1_ID\",\"contactId\":\"$CT1_ID\",\"value\":385000,\"expectedClose\":\"2026-09-15\",\"source\":\"TRADE_SHOW\",\"leadScore\":\"HOT\"}")
D1_ID=$(echo "$D1" | J "d['id']")
[ "$(echo "$D1" | J "d['stage']")" = "NEW_RFQ" ]; check "create deal defaults to NEW_RFQ" "$?"

D2=$(curl -s -X POST $BASE/deals -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"title\":\"Vertex — SS304 Shaft SHFT-2024-018\",\"companyId\":\"$CO2_ID\",\"value\":620000,\"leadScore\":\"WARM\"}")
D2_ID=$(echo "$D2" | J "d['id']")
[ -n "$D2_ID" ]; check "create second deal" "$?"

DLIST=$(curl -s "$BASE/deals" -H "$AUTH")
[ "$(echo "$DLIST" | J "d['total']")" = "2" ]; check "deals list pagination envelope" "$?"
echo "$DLIST" | grep -q "Maruti Components"; check "deals list includes company" "$?"

DS=$(curl -s "$BASE/deals?stage=NEW_RFQ" -H "$AUTH")
[ "$(echo "$DS" | J "d['total']")" = "2" ]; check "stage filter" "$?"

DC=$(curl -s "$BASE/deals?companyId=$CO1_ID" -H "$AUTH")
[ "$(echo "$DC" | J "d['total']")" = "1" ]; check "companyId filter" "$?"

DONE=$(curl -s "$BASE/deals/$D1_ID" -H "$AUTH")
echo "$DONE" | grep -q "Rajesh Iyer"; check "deal detail includes contact" "$?"

echo "=== 4. STAGE MOVE ==="
SM1=$(curl -s -X PATCH $BASE/deals/$D1_ID/stage -H 'Content-Type: application/json' -H "$AUTH" -d '{"stage":"CONTACTED"}')
[ "$(echo "$SM1" | J "d['deal']['stage']")" = "CONTACTED" ]; check "move NEW_RFQ→CONTACTED" "$?"
[ "$(echo "$SM1" | J "d['activity']['type']")" = "STAGE_CHANGE" ]; check "stage change activity logged" "$?"

SMERR=$(curl -s -X PATCH $BASE/deals/$D1_ID/stage -H 'Content-Type: application/json' -H "$AUTH" -d '{"stage":"LOST"}')
echo "$SMERR" | grep -qi "lostReason"; check "LOST without reason → 400" "$?"

SMSAME=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH $BASE/deals/$D1_ID/stage -H 'Content-Type: application/json' -H "$AUTH" -d '{"stage":"CONTACTED"}')
[ "$SMSAME" = "400" ]; check "same-stage move → 400" "$?"

echo "=== 5. RFQ INTAKE ==="
R1=$(curl -s -X POST $BASE/rfqs -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"partName":"CNC Bracket","partNo":"BRK-5532","material":"Aluminium 6061","qty":250,"tolerance":"±0.05mm","targetPrice":1540,"deadline":"2026-09-01","drawingNotes":"Anodized finish, chamfer all edges","source":"EMAIL","companyName":"Shakti Fabricators","companyIndustry":"INDUSTRIAL","companyCity":"Pune"}')
R1_ID=$(echo "$R1" | J "d['rfq']['id']")
R1_DEAL=$(echo "$R1" | J "d['deal']['id']")
[ -n "$R1_ID" ] && [ -n "$R1_DEAL" ]; check "rfq creates deal + company in one tx" "$?"
[ "$(echo "$R1" | J "d['deal']['stage']")" = "NEW_RFQ" ]; check "rfq deal starts at NEW_RFQ" "$?"
[ "$(echo "$R1" | J "d['deal']['value']")" = "385000" ]; check "rfq deal value = targetPrice×qty" "$?"

R2=$(curl -s -X POST $BASE/rfqs -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"partName\":\"Flange\",\"partNo\":\"FL-1200\",\"material\":\"SS316L\",\"qty\":80,\"tolerance\":\"±0.1mm\",\"deadline\":\"2026-08-25\",\"source\":\"WEBSITE\",\"companyId\":\"$CO1_ID\"}")
[ -n "$(echo "$R2" | J "d['rfq']['id']")" ]; check "rfq with existing companyId" "$?"

RERR=$(curl -s -X POST $BASE/rfqs -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"partName":"X","partNo":"X-1","material":"MS","qty":10,"deadline":"2026-09-01","source":"EMAIL"}')
echo "$RERR" | grep -qi "company"; check "rfq without company → validation error" "$?"

RLIST=$(curl -s "$BASE/rfqs" -H "$AUTH")
[ "$(echo "$RLIST" | J "d['total']")" = "2" ]; check "rfqs list" "$?"

echo "=== 6. QUOTES ==="
Q1=$(curl -s -X POST $BASE/quotes -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"dealId\":\"$D1_ID\",\"lineItems\":[{\"description\":\"CNC machining — BRK-5532\",\"qty\":250,\"unitPrice\":1180},{\"description\":\"Anodizing + finishing\",\"qty\":250,\"unitPrice\":360}],\"terms\":[\"50% advance, 50% on dispatch\",\"Delivery: 4 weeks from PO\"],\"validUntil\":\"2026-09-30\"}")
Q1_ID=$(echo "$Q1" | J "d['id']")
Q1_NO=$(echo "$Q1" | J "d['quoteNo']")
[ "$Q1_NO" = "Q-2026-0001" ]; check "quoteNo auto-generates Q-2026-0001" "$?"
[ "$(echo "$Q1" | J "d['totalAmount']")" = "385000.00" ] || [ "$(echo "$Q1" | J "d['totalAmount']")" = "385000" ]; check "total computed server-side (250×1180 + 250×360)" "$?"

QDUP=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/quotes -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"dealId\":\"$D1_ID\",\"lineItems\":[{\"description\":\"dup\",\"qty\":1,\"unitPrice\":1}],\"validUntil\":\"2026-09-30\"}")
[ "$QDUP" = "409" ]; check "second quote on same deal → 409" "$?"

Q2=$(curl -s -X POST $BASE/quotes -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"dealId\":\"$R1_DEAL\",\"lineItems\":[{\"description\":\"CNC Bracket machining\",\"qty\":250,\"unitPrice\":1450}],\"validUntil\":\"2026-09-15\",\"aiGenerated\":true}")
[ "$(echo "$Q2" | J "d['quoteNo']")" = "Q-2026-0002" ]; check "quoteNo increments" "$?"

echo "=== 7. QUOTE SENT → AUTO STAGE + FOLLOW-UP TASK ==="
QS=$(curl -s -X PATCH $BASE/quotes/$Q1_ID/status -H 'Content-Type: application/json' -H "$AUTH" -d '{"status":"SENT"}')
[ "$(echo "$QS" | J "d['quote']['status']")" = "SENT" ]; check "quote DRAFT→SENT" "$?"
NTASKS=$(echo "$QS" | J "len(d['tasksCreated'])")
[ "$NTASKS" = "1" ]; check "follow-up task auto-created" "$?"
TASK_MSG=$(echo "$QS" | J "d['tasksCreated'][0]['message']")
echo "$TASK_MSG" | grep -q "Q-2026-0001"; check "task references quoteNo" "$?"
TASK_AUTO=$(echo "$QS" | J "d['tasksCreated'][0]['autoCreated']")
[ "$TASK_AUTO" = "True" ]; check "task flagged autoCreated" "$?"

D1NOW=$(curl -s "$BASE/deals/$D1_ID" -H "$AUTH")
[ "$(echo "$D1NOW" | J "d['stage']")" = "QUOTE_SENT" ]; check "deal auto-advanced to QUOTE_SENT" "$?"

QSBAD=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH $BASE/quotes/$Q1_ID/status -H 'Content-Type: application/json' -H "$AUTH" -d '{"status":"SENT"}')
[ "$QSBAD" = "400" ]; check "SENT→SENT → 400 state machine" "$?"

echo "=== 8. WON → ORDER AUTO-CREATE ==="
WON=$(curl -s -X PATCH $BASE/deals/$D1_ID/stage -H 'Content-Type: application/json' -H "$AUTH" -d '{"stage":"WON"}')
[ "$(echo "$WON" | J "d['deal']['stage']")" = "WON" ]; check "move QUOTE_SENT→WON" "$?"
[ "$(echo "$WON" | J "d['order']['orderNo']")" = "ORD-2026-0001" ]; check "order ORD-2026-0001 auto-created" "$?"
[ "$(echo "$WON" | J "d['order']['totalAmount']")" = "385000" ] || [ "$(echo "$WON" | J "d['order']['totalAmount']")" = "385000.00" ]; check "order amount = deal value" "$?"

TERM=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH $BASE/deals/$D1_ID/stage -H 'Content-Type: application/json' -H "$AUTH" -d '{"stage":"NEGOTIATION"}')
[ "$TERM" = "400" ]; check "terminal stage cannot move → 400" "$?"

echo "=== 9. LOST WITH REASON ==="
LOST=$(curl -s -X PATCH $BASE/deals/$D2_ID/stage -H 'Content-Type: application/json' -H "$AUTH" -d '{"stage":"LOST","lostReason":"Price too high — competitor quoted 12% lower"}')
[ "$(echo "$LOST" | J "d['deal']['stage']")" = "LOST" ]; check "move →LOST with reason" "$?"
[ "$(echo "$LOST" | J "d['deal']['lostReason']")" != "None" ]; check "lostReason persisted" "$?"

echo "=== 10. TASKS ==="
T1=$(curl -s -X POST $BASE/tasks -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"type\":\"CALL\",\"dueAt\":\"2020-01-01T09:00:00.000Z\",\"dealId\":\"$R1_DEAL\",\"message\":\"Call procurement head re: FL-1200 flange\"}")
T1_ID=$(echo "$T1" | J "d['id']")
[ -n "$T1_ID" ]; check "create task (backdated → overdue)" "$?"

OV=$(curl -s "$BASE/tasks?overdue=true" -H "$AUTH")
[ "$(echo "$OV" | J "d['total']")" = "1" ]; check "overdue filter finds backdated task" "$?"

TDONE=$(curl -s -X PATCH $BASE/tasks/$T1_ID/status -H 'Content-Type: application/json' -H "$AUTH" -d '{"status":"DONE"}')
[ "$(echo "$TDONE" | J "d['status']")" = "DONE" ]; check "task DONE" "$?"

OV2=$(curl -s "$BASE/tasks?overdue=true" -H "$AUTH")
[ "$(echo "$OV2" | J "d['total']")" = "0" ]; check "done task no longer overdue" "$?"

echo "=== 11. ACTIVITIES ==="
A1=$(curl -s -X POST $BASE/deals/$R1_DEAL/activities -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"type":"CALL","description":"Spoke with Rajesh — confirmed drawing rev C is final","metadata":{"duration":"12 min"}}')
[ -n "$(echo "$A1" | J "d['id']")" ]; check "log activity on deal" "$?"

TL=$(curl -s "$BASE/deals/$D1_ID/activities" -H "$AUTH")
NTL=$(echo "$TL" | J "len(d)")
[ "$NTL" -ge 3 ] 2>/dev/null; check "deal timeline has stage+quote+won entries" "$?"

CTL=$(curl -s "$BASE/companies/$CO1_ID/activities" -H "$AUTH")
echo "$CTL" | grep -q "STAGE_CHANGE"; check "company timeline aggregates deal activity" "$?"

echo "=== 12. DASHBOARD ==="
DB=$(curl -s "$BASE/dashboard" -H "$AUTH")
for FIELD in pipelineValue activeDeals winRate overdueTasks dealsByStage pipelineValueSeries topLossReasons hotDeals overdueTaskList; do
  echo "$DB" | grep -q "\"$FIELD\""; check "dashboard field: $FIELD" "$?"
done
[ "$(echo "$DB" | J "d['activeDeals']")" = "2" ]; check "activeDeals = 2 (R1 + R2 rfq deals open)" "$?"
[ "$(echo "$DB" | J "d['winRate']")" = "0.5" ]; check "winRate = 0.5 (1 won, 1 lost)" "$?"
LR=$(echo "$DB" | J "d['topLossReasons'][0]['reason']")
echo "$LR" | grep -qi "Price"; check "top loss reason captured" "$?"

echo "=== 13. TENANT ISOLATION ==="
NOTFOUND=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/deals/00000000-0000-0000-0000-000000000000" -H "$AUTH")
[ "$NOTFOUND" = "404" ]; check "unknown deal → 404" "$?"

echo ""
echo "=================================="
echo "RESULTS: $PASS passed, $FAIL failed"
echo "=================================="
exit $FAIL
