#!/bin/bash
# ============================================================
# HOTFIX: display.js aus /tmp nach /srv kopieren + restart service
# + /display/print-health Endpoint Retest
# ============================================================
set -u
SRC=/tmp/display.js-hotfix
DST=/srv/rollladen-monitor/backend/src/routes/display.js
echo "=== Hotfix display.js deploy ==="
if [ ! -f "$SRC" ]; then echo "❌ Quelle $SRC fehlt!"; exit 2; fi
BACKUP="${DST}.bak-fix-tempdir.$(date +%s)"
cp -a "$DST" "$BACKUP" || true
echo "Backup erstellt: $BACKUP"
cp -f "$SRC" "$DST"
chown rollladen:adm "$DST"
chmod 664 "$DST"
ls -la "$DST"
echo ""
echo "=== node --check Syntaxprüfung auf Zieldatei ==="
/usr/bin/node --check "$DST" && echo "✅ node --check OK" || { echo "❌ node --check FAIL"; exit 3; }
echo ""
echo "=== systemctl restart rollladen-backend ==="
systemctl restart rollladen-backend
sleep 4
echo "Aktiv: $(systemctl is-active rollladen-backend.service)"
echo ""
echo "=== /health Poll 10s ==="
for i in 1 2 3 4 5; do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3006/health 2>/dev/null || echo "000")
  echo "  Versuch $i: /health=$CODE"
  if [ "$CODE" = "200" ]; then
    echo "  Body: $(curl -s --max-time 5 http://127.0.0.1:3006/health 2>/dev/null)"
    break
  fi
done
echo ""
echo "=== /display/print-health Test mit Basic Auth (2 Versuche) ==="
set -a
. /etc/rollladen-monitor.env
set +a
FAIL=1
for i in 1 2; do
  sleep 2
  echo "  --- Run $i ---"
  CODE=$(curl -sS -o /tmp/printhealth-fix.json -w "%{http_code}" --max-time 25 \
    --user "${MONITOR_HTTP_USER}:${MONITOR_HTTP_PASSWORD}" \
    http://127.0.0.1:3006/display/print-health 2>&1 || echo "000")
  echo "  HTTP=$CODE"
  if [ -s /tmp/printhealth-fix.json ]; then
    echo "  Datei $(wc -c < /tmp/printhealth-fix.json) Bytes"
    head -c 2500 /tmp/printhealth-fix.json
    echo ""
  fi
  if [ "$CODE" = "200" ]; then FAIL=0; break; fi
done
echo ""
echo "=== Letzte journald Zeilen nach Restart ==="
journalctl -u rollladen-backend.service --no-pager -n 15 -o short-iso 2>&1 || true
echo ""
echo "Zusammenfassung:"
ACTIVE=$(systemctl is-active rollladen-backend.service 2>&1)
echo "  rollladen-backend.service: $ACTIVE"
echo "  print-health HTTP: $CODE"
echo "  JSON Datei vorhanden: $(if [ -s /tmp/printhealth-fix.json ]; then echo JA; else echo NEIN; fi)"
echo ""
if [ "$FAIL" = "0" ] && [ "$ACTIVE" = "active" ]; then
  echo "✅ HOTFIX ERFOLGREICH! print-health HTTP 200 + Service UP"
  exit 0
else
  echo "❌ Noch Fehler - siehe Output oben"
  exit 1
fi
