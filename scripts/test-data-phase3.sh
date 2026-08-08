#!/usr/bin/env bash
# Minimal test data for Phase 3 verification (Phase 6 does the full realistic seed)
set -e
API="http://localhost:3001/api/v1"
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"aarav@forge.demo","password":"ForgeOwner123!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"

mkcompany() {
  curl -s -X POST $API/companies -H "$AUTH" -H "$CT" \
    -d "{\"name\":\"$1\",\"industry\":\"$2\",\"city\":\"$3\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])"
}

mkrfq() { # companyId partName partNo material qty targetPrice dealValue
  curl -s -X POST $API/rfqs -H "$AUTH" -H "$CT" -d "{
    \"companyId\":\"$1\",\"partName\":\"$2\",\"partNo\":\"$3\",\"material\":\"$4\",
    \"qty\":$5,\"tolerance\":\"±0.01 mm\",\"targetPrice\":$6,\"deadline\":\"2026-09-15\",
    \"source\":\"EMAIL\",\"dealValue\":$7
  }" | python3 -c "import sys,json;print(json.load(sys.stdin)['deal']['id'])"
}

move() { # dealId stage
  curl -s -X PATCH $API/deals/$1/stage -H "$AUTH" -H "$CT" -d "{\"stage\":\"$2\"}" > /dev/null
}

C1=$(mkcompany "Maruti Components Pvt Ltd" AUTOMOTIVE "Pune")
C2=$(mkcompany "Vertex Aerospace Systems" AEROSPACE "Bengaluru")
C3=$(mkcompany "Shakti Fabricators" INDUSTRIAL "Faridabad")
C4=$(mkcompany "MedTech Devices India" MEDICAL "Chennai")
echo "companies: 4"

D1=$(mkrfq $C1 "SS304 Precision Shaft" "SHFT-2026-018" "SS 304" 500 960 480000)
D2=$(mkrfq $C2 "CNC Mounting Bracket" "BRK-5532" "Aluminium 6061" 200 2400 480000)
D3=$(mkrfq $C3 "Hydraulic Flange" "FL-1200" "MS" 1000 320 320000)
D4=$(mkrfq $C4 "Surgical Guide Pin" "PIN-2201" "SS 316L" 3000 410 1230000)
D5=$(mkrfq $C1 "Gear Blank EN24" "GRB-0917" "EN24" 150 5200 780000)
D6=$(mkrfq $C2 "Titanium Spacer" "SPC-3308" "Ti-6Al-4V" 80 22500 1800000)
echo "deals: 6"

move $D2 CONTACTED
move $D3 CONTACTED
move $D4 QUOTE_SENT
move $D5 NEGOTIATION
echo "stage moves: done"

# Task: one overdue follow-up on D1
curl -s -X POST $API/tasks -H "$AUTH" -H "$CT" -d "{
  \"type\":\"FOLLOW_UP\",\"dueAt\":\"2026-08-06T10:00:00.000Z\",
  \"dealId\":\"$D1\",\"message\":\"Initial outreach overdue\"
}" > /dev/null
echo "overdue task: 1"
echo "SEED OK"
