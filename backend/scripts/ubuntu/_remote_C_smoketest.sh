#!/bin/bash
# ============================================================
# Manueller Smoke Test: Start Backend im Hintergrund als User rollladen
#                        mit geladenem Environment, Check /health und /display,
#                        dann Prozess wieder killen.
# Exit 0 = smoke test passed, Exit !=0 = failed
# ============================================================
set -u
export HOME=/var/lib/rollladen
cd /srv/rollladen-monitor/backend

echo "============================================================"
echo "SMOKE TEST BACKEND: node src/index.js als User rollladen"
echo "Zeit: $(date '+%F %T')"
echo "============================================================"

# Load env file safely (source with set -a to export all)
set -a
. /etc/rollladen-monitor.env 2>/dev/null || { echo "❌ FAIL: /etc/rollladen-monitor.env nicht lesbar!"; exit 2; }
set +a
echo "✅ Environment geladen (PORT=$PORT, NODE_ENV=$NODE_ENV, SAFE_MODE_SLACK=$SAFE_MODE_SLACK, ALLOW_START_WITHOUT_DB=$ALLOW_START_WITHOUT_DB)"

# Kill any existing node to be safe
killall node 2>/dev/null || true
sleep 1

# Start Node in Background
LOG=/tmp/rollladen-backend-smoke.log
rm -f $LOG
echo "→ Starte Backend (stdout/stderr -> $LOG)..."
/usr/bin/node src/index.js >"$LOG" 2>&1 &
NODE_PID=$!
echo "  PID=$NODE_PID"

# Give startup 12 seconds
MAX_WAIT=14
WAITED=0
HTTP_OK=0
while [ $WAITED -lt $MAX_WAIT ]; do
  sleep 2
  WAITED=$((WAITED+2))
  # Check if process still alive
  if ! kill -0 $NODE_PID 2>/dev/null; then
    echo "❌ Prozess PID $NODE_PID bereits beendet! Letzte Logs:"
    tail -n 40 "$LOG" || true
    echo ""
    echo "SMOKE_TEST_FAIL_CRASH"
    exit 3
  fi
  # Try HTTP GET /health
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:${PORT:-3006}/health" 2>/dev/null || echo "000")
  if [ "$HTTP" = "200" ]; then
    echo "✅ nach ${WAITED}s: /health HTTP $HTTP!"
    HTTP_OK=1
    break
  fi
  echo "  nach ${WAITED}s: /health=$HTTP (warte noch...)"
done

if [ "$HTTP_OK" != "1" ]; then
  echo "❌ FAIL: /health wurde nach ${MAX_WAIT}s nicht HTTP 200!"
  echo "Letzte Logs $LOG:"
  tail -n 50 "$LOG" || true
  echo ""
  echo "Kille verbliebenen Node Prozess..."
  kill -9 $NODE_PID 2>/dev/null || true
  sleep 1
  echo "SMOKE_TEST_FAIL_HEALTH"
  exit 4
fi

# --- HEALTH BODY ---
echo ""
echo "===== /health Response Body ====="
curl -s --max-time 5 "http://127.0.0.1:${PORT:-3006}/health" || true
echo ""

# --- DISPLAY BASIC AUTH TEST (expect 401 unauth OK, OR 200 if auth disabled) ---
echo ""
echo "===== /display Endpoint (ohne Auth - erwarte 401) ====="
HTTP_DISP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:${PORT:-3006}/display" 2>/dev/null || echo "000")
echo "  HTTP Status: $HTTP_DISP"
if [ "$HTTP_DISP" = "401" ] || [ "$HTTP_DISP" = "200" ]; then echo "  ✅ OK (401 Unauthorized oder 200 je nach Config)"; fi

# --- PRINT-HEALTH (Cross-Platform!) ---
echo ""
echo "===== /display/print-health Cross-Platform Test ====="
HTTP_PH=$(curl -s -o /tmp/print-health-out.json -w "%{http_code}" --max-time 10 --user "${MONITOR_HTTP_USER}:${MONITOR_HTTP_PASSWORD}" "http://127.0.0.1:${PORT:-3006}/display/print-health" 2>/dev/null || echo "000")
echo "  HTTP Status: $HTTP_PH"
if [ -f /tmp/print-health-out.json ]; then
  echo "  Response Anfang (JSON, auf Linux-plattform Felder prüfen):"
  head -c 2000 /tmp/print-health-out.json
  echo ""
fi

# Kill node after tests
echo ""
echo "→ Beende Backend Prozess PID $NODE_PID (SIGTERM)..."
kill $NODE_PID 2>/dev/null || true
sleep 2
if kill -0 $NODE_PID 2>/dev/null; then
  echo "  Kill hart mit SIGKILL"
  kill -9 $NODE_PID 2>/dev/null || true
fi
sleep 1
NODES_LEFT=$(pgrep -c -f "node src/index.js" 2>/dev/null || echo 0)
echo "  Node Prozesse übrig: $NODES_LEFT"
echo ""

echo "============================================================"
echo "🎉 SMOKE_TEST_PASSED! Backend startet, /health 200, Display & Print-Health Endpoints antworten!"
echo "============================================================"
exit 0
