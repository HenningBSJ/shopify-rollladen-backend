#!/bin/bash
# ============================================================
# TASK 5c: systemd rollladen-backend.service starten + prüfen
# Exit 0 = OK, Exit 1 = FAIL
# ============================================================
set -u
echo "============================================================"
echo "TASK 5c: systemd rollladen-backend.service starten"
echo "Zeit: $(date '+%F %T')"
echo "============================================================"
echo ""
echo "--- Step 1: daemon-reload + Status vorher ---"
systemctl daemon-reload
echo "Units enabled:"
systemctl is-enabled rollladen-backend.service 2>&1 || echo "DISABLED"
systemctl is-enabled rollladen-cloudflared.service 2>&1 || echo "DISABLED"
echo "Vor Start: rollladen-backend is-active: $(systemctl is-active rollladen-backend.service 2>&1 || echo inactive)"
echo ""
echo "--- Step 2: Starte rollladen-backend.service ---"
systemctl start rollladen-backend.service
sleep 3
echo ""
echo "--- Step 3: systemctl status ---"
systemctl status rollladen-backend.service --no-pager -l -n 15 || true
echo ""
echo "--- Step 4: Aktiv + Prozess ---"
echo "Active: $(systemctl is-active rollladen-backend.service 2>&1)"
systemctl show -p MainPID,MemoryCurrent,CPUTimeUSec,Result rollladen-backend.service
echo ""
echo "Node Prozesse:"
ps -eo pid,user:20,etime,%cpu,%mem,args | grep -E 'node src/index' | grep -v grep || echo "KEIN_NODE_GEFUNDEN"
echo ""
echo "--- Step 5: /health Endpoint poll 10s ---"
OK=0
for i in 1 2 3 4 5; do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3006/health 2>/dev/null || echo "000")
  echo "  Versuch $i: /health=HTTP $CODE"
  if [ "$CODE" = "200" ]; then
    OK=1
    echo "  Body:"
    curl -s --max-time 5 http://127.0.0.1:3006/health || true
    echo ""
    break
  fi
done
echo ""
echo "--- Step 6: journalctl -n 50 ---"
echo "(letzte 50 Zeilen journald Unit rollladen-backend)"
journalctl -u rollladen-backend.service --no-pager -n 50 -o short-iso 2>&1 || echo "(kein journal)"
echo ""
echo "============================================================"
echo "Zusammenfassung:"
ACTIVE=$(systemctl is-active rollladen-backend.service 2>&1 || echo "unknown")
HCODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3006/health 2>/dev/null || echo "000")
echo "  Active:              $ACTIVE"
echo "  /health HTTP:        $HCODE"
echo "  /health Body:        $(curl -s --max-time 5 http://127.0.0.1:3006/health 2>/dev/null || echo '-')"
echo ""
if [ "$ACTIVE" = "active" ] && [ "$HCODE" = "200" ] && [ "$OK" = "1" ]; then
  echo "✅ TASK5C: OK - systemd Unit UP + Health 200!"
  exit 0
else
  echo "❌ TASK5C: FAIL"
  exit 1
fi
