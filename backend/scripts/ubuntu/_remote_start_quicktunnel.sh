#!/bin/bash
set -u

BACKEND_PORT=3006
LOG=/tmp/cf-quick-tunnel.log
PIDFILE=/tmp/cf-quick-tunnel.pid
MAX_WAIT=20

echo "========================================"
echo " START CLOUDFLARED QUICK TUNNEL (Ubuntu Testbetrieb) "
echo "  → Routet nach http://127.0.0.1:${BACKEND_PORT}"
echo "  → Zufällige *.trycloudflare.com URL (KEIN DOMAIN KONFLIKT!)"
echo "========================================"

# ---- Cleanup alte Instanzen ----
echo ""
echo "[1/5] Alte Quick-Tunnel Prozesse aufräumen ..."
if [ -f $PIDFILE ]; then
  OLD_PID=$(cat $PIDFILE 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && kill -0 $OLD_PID 2>/dev/null; then
    echo "  → Töte alte PID=$OLD_PID"
    kill -9 $OLD_PID 2>/dev/null || true
    sleep 1
  fi
fi
pkill -9 -f "cloudflared.*tunnel --url" 2>/dev/null || true
rm -f $LOG $PIDFILE
sleep 1

# ---- Backend Health ----
echo ""
echo "[2/5] Prüfe lokales Backend http://127.0.0.1:${BACKEND_PORT}/health ..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/health" || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "  ❌ /health HTTP=$HTTP (erwarte 200) → ABBRUCH. Backend zuerst starten!"
  exit 1
fi
echo "  ✅ /health HTTP=$HTTP OK"

# ---- Quick Tunnel starten (Hintergrund) ----
echo ""
echo "[3/5] Starte cloudflared Quick Tunnel (setsid + nohup, PIDFILE) ..."
touch $LOG
setsid nohup /usr/bin/cloudflared --no-autoupdate --loglevel info tunnel --url "http://127.0.0.1:${BACKEND_PORT}" > $LOG 2>&1 < /dev/null &
QT_PID=$!
echo $QT_PID > $PIDFILE
echo "  → PID=$QT_PID (PIDFILE=$PIDFILE, LOG=$LOG)"
disown 2>/dev/null || true

# ---- Warten auf URL ----
echo ""
echo "[4/5] Warte max ${MAX_WAIT}s auf Tunnel-URL im Log ..."
URL=""
i=0
while [ $i -lt $MAX_WAIT ]; do
  if [ -f $LOG ]; then
    URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' $LOG 2>/dev/null | head -1 || true)
    if [ -n "$URL" ]; then
      echo "  ✅ URL nach ${i}s gefunden!"
      break
    fi
  fi
  sleep 1
  i=$((i+1))
  printf "."
done
echo ""

if [ -z "$URL" ]; then
  echo "  ❌ Keine URL nach ${MAX_WAIT}s im Log gefunden. Letzte Log-Zeilen:"
  tail -30 $LOG
  exit 1
fi

# ---- Verification ----
echo ""
echo "[5/5] Verification: Health-Check über Tunnel-URL ..."
TUNNEL_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL/health" || echo "000")
echo "  → $URL/health → HTTP=$TUNNEL_HTTP"

echo ""
echo "========================================"
echo " ✅ QUICK TUNNEL BEREIT (Testbetrieb Ubuntu, konflikt-frei) "
echo "========================================"
echo "TUNNEL_PID   : $QT_PID"
echo "TUNNEL_URL   : $URL"
echo "PUBLIC_HEALTH: $URL/health"
echo "PUBLIC_APP   : $URL/display"
echo "PRINT_HEALTH : $URL/display/print-health  (Basic Auth monitor / Passwort aus .env)"
echo "PDF_ONLY     : $URL/pdf-only"
echo "LOG_FILE     : $LOG"
echo "KILL CMD     : kill -9 $QT_PID  (bzw. pkill -9 -f 'cloudflared.*tunnel --url')"
echo "========================================"

# Zeile extra ausgeben zum Parsen in PowerShell
echo "__QUICKTUNNEL_URL__=$URL"
exit 0
