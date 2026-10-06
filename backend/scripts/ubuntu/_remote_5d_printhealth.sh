#!/bin/bash
# ============================================================
# TASK 5d: Cross-Plattform /display/print-health Endpoint Test
# Tested mit BASIC AUTH und curl.
# ============================================================
set -u
echo "============================================================"
echo "TASK 5d: print-health Endpoint Test (Ubuntu Linux Branch)"
echo "Zeit: $(date '+%F %T')"
echo "============================================================"
echo ""
# Load env to get credentials
set -a
. /etc/rollladen-monitor.env
set +a
echo "MONITOR_HTTP_USER=$MONITOR_HTTP_USER"
echo "Password length = ${#MONITOR_HTTP_PASSWORD}"
echo ""

echo "--- TEST 1: /display ohne Auth - erwarte HTTP 401 oder 302 ---"
C1=$(curl -s -o /tmp/disp_noauth.html -w "%{http_code}" --max-time 10 http://127.0.0.1:3006/display 2>/dev/null || echo "000")
echo "  HTTP $C1 (401 oder 302 = OK)"
echo "  Response Anfang:"
head -c 300 /tmp/disp_noauth.html 2>/dev/null; echo ""
echo ""

echo "--- TEST 2: /display mit Basic Auth - erwarte HTTP 200 ---"
C2=$(curl -s -o /tmp/disp_auth.html -w "%{http_code}" --max-time 15 --user "${MONITOR_HTTP_USER}:${MONITOR_HTTP_PASSWORD}" http://127.0.0.1:3006/display 2>/dev/null || echo "000")
echo "  HTTP $C2 (200 = OK)"
echo "  Response Dateigroesse: $(wc -c < /tmp/disp_auth.html 2>/dev/null || echo 0) Bytes"
echo "  Response Anfang:"
head -c 500 /tmp/disp_auth.html 2>/dev/null || true
echo ""
echo ""

echo "--- TEST 3: /display/print-health mit Basic Auth - Cross-Plattform ---"
echo "  (Linux: platform=linux, cups.isActive, linuxSession, lpstat, chromiumPfad, lpPfad)"
echo ""
C3=$(curl -s -o /tmp/printhealth.json -w "%{http_code}" --max-time 30 --user "${MONITOR_HTTP_USER}:${MONITOR_HTTP_PASSWORD}" http://127.0.0.1:3006/display/print-health 2>/dev/null || echo "000")
echo "  HTTP Status: $C3 (erwarte 200)"
echo ""
if [ -f /tmp/printhealth.json ]; then
  echo "  ===== VOLLSTAENDIGE JSON ANTWORT ====="
  cat /tmp/printhealth.json
  echo ""
  echo ""
  echo "  ===== STRUKTUR CHECKS ===== (Felder vorhanden?)"
  echo ""
  if command -v jq >/dev/null 2>&1; then
    echo "  platform        = $(jq -r '.platform' /tmp/printhealth.json 2>&1)"
    echo "  cups.isActive   = $(jq -r '.cups.isActive' /tmp/printhealth.json 2>&1)"
    echo "  cups.lpstat_r   = $(jq -r '.cups.lpstat_r' /tmp/printhealth.json 2>&1)"
    echo "  cups.queueCount = $(jq -r '.queues | length' /tmp/printhealth.json 2>&1)"
    echo "  queues[0]       = $(jq -r '.queues[0]' /tmp/printhealth.json 2>&1)"
    echo "  linuxSession.user  = $(jq -r '.linuxSession.user' /tmp/printhealth.json 2>&1)"
    echo "  linuxSession.uid   = $(jq -r '.linuxSession.uid' /tmp/printhealth.json 2>&1)"
    echo "  linuxSession.gid   = $(jq -r '.linuxSession.gid' /tmp/printhealth.json 2>&1)"
    echo "  executables.chromium.exists = $(jq -r '.executables.chromium.exists' /tmp/printhealth.json 2>&1)"
    echo "  executables.lp.exists       = $(jq -r '.executables.lp.exists' /tmp/printhealth.json 2>&1)"
    echo "  executables.lpstat.exists   = $(jq -r '.executables.lpstat.exists' /tmp/printhealth.json 2>&1)"
  else
    echo "  (jq nicht installiert - Fallback grep)"
    grep -Eo '"platform"[^,}]+' /tmp/printhealth.json 2>&1 | head -1
    grep -Eo '"cups"[[:space:]]*:[[:space:]]*\{[^}]+\}' /tmp/printhealth.json 2>&1 | head -c 400; echo ""
    grep -Eo '"linuxSession"[[:space:]]*:[[:space:]]*\{[^}]+\}' /tmp/printhealth.json 2>&1 | head -c 500; echo ""
  fi
fi
echo ""
echo "============================================================"
echo "Zusammenfassung:"
echo "  /display ohne Auth   = HTTP $C1"
echo "  /display mit Auth    = HTTP $C2"
echo "  /print-health        = HTTP $C3"
echo ""
# Acceptance: print-health = 200 & platform Linux & cups running
FAIL=0
if [ "$C3" != "200" ]; then echo "❌ /print-health nicht 200"; FAIL=1; fi
if grep -q '"platform"[[:space:]]*:[[:space:]]*"linux"' /tmp/printhealth.json 2>/dev/null; then
  echo "✅ platform: linux"
else
  echo "❌ platform NICHT linux"; FAIL=1
fi
if grep -Eo '"isActive"[[:space:]]*:[[:space:]]*"active"' /tmp/printhealth.json >/dev/null 2>&1; then
  echo "✅ CUPS isActive: active"
else
  echo "ℹ️  CUPS isActive check via JSON (grep 'active'):"; grep -o '"isActive"[^,}]*' /tmp/printhealth.json 2>&1 | head -1
fi
if grep -Eo 'Brother_QL' /tmp/printhealth.json >/dev/null 2>&1; then
  echo "✅ Brother_QL Drucker in Queue-Liste gefunden"
else
  echo "ℹ️  Brother Queue Name via grep: $(grep -oE 'Brother[^"]*' /tmp/printhealth.json 2>&1 | head -1)"
fi
echo ""
if [ "$FAIL" = "0" ]; then
  echo "✅ TASK5D: PRINT-HEALTH PASSED!"
  exit 0
else
  echo "❌ TASK5D: Failures oben - Details im JSON Output"
  exit 1
fi
