#!/bin/bash
# ============================================================
# TASK 6: Direktdruck TEST via CUPS Brother_QL_1110NWB Queue
# Jobs bleiben GEHALTEN (-o job-hold-until=indefinite) damit
# keine Etiketten verschwendet werden. User kann spaeter
# freigeben (lp -i JOBID -H resume) oder loeschen (cancel JOBID).
# ============================================================
set -u
Q=Brother_QL_1110NWB
echo "============================================================"
echo "TASK 6: CUPS Direktdruck TEST auf Queue=$Q"
echo "Zeit: $(date '+%F %T')"
echo "GESCHÜTZT: Alle Jobs bleiben GEHALTEN (kein Ausdruck automatisch)"
echo "============================================================"
echo ""
echo "--- Step 1: Drucker Queue Status VOR Test ---"
LC_ALL=C lpstat -p "$Q" -l 2>&1 | head -20
echo ""
echo "--- Step 2: Testdokumente erstellen (TXT + minimales PDF) ---"
TXT=/tmp/test-rollladen.txt
PDF=/tmp/test-rollladen.pdf
cat >"$TXT" <<'EOF'
===========================================================
  ROLLLADEN MONITOR - TESTDRUCK UBUNTU 22.04
  Zeit:       $(date)
  Queue:      Brother_QL_1110NWB
  User:       rollladen (uid=999)
  Test:       CUPS/lp ÜBER LAN (NETZWERK)
  Status:     GEO-HALTEN (job-hold-until=indefinite)
  Info:       Wenn das rauskopmt, funktioniert die Kette!
===========================================================
EOF
echo "  TXT erstellt: $(wc -c < $TXT) Bytes"
# Erstelle ein einfaches 1-Seiten PDF via Chromium headless (wenn vorhanden)
echo "  Erstelle PDF via Chromium…"
if /usr/bin/chromium-browser --version >/dev/null 2>&1; then
  /usr/bin/chromium-browser --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
    --print-to-pdf="$PDF" "file://$TXT" >/dev/null 2>&1 || true
fi
if [ -s "$PDF" ]; then
  echo "  PDF erstellt: $(wc -c < $PDF) Bytes"
else
  echo "  PDF nicht erstellt, nehme TXT fuer Drucktest"
fi
echo ""
echo "--- Step 3: Sende Test-Jobs GEHALTEN -o job-hold-until=indefinite ---"
JOBIDS=()
send_job() {
  local FILE="$1"; local TITLE="$2"
  local OUT
  OUT=$(LC_ALL=C lp -d "$Q" -t "$TITLE" -o job-hold-until=indefinite -o job-sheets=none,none "$FILE" 2>&1)
  local RC=$?
  echo "  $TITLE: rc=$RC"
  echo "    lp output: $OUT"
  # Versuche Job ID zu extrahieren
  local JID=$(echo "$OUT" | grep -oE 'request id is [^ ]+' | grep -oE '[0-9]+(-[0-9]+)?')
  if [ -z "$JID" ]; then JID=$(echo "$OUT" | grep -oE '[0-9]+$'); fi
  if [ -n "$JID" ]; then
    echo "    Extrahiert JobID=$JID"
    JOBIDS+=("$JID")
  fi
}
send_job "$TXT" "ROL-Test-01-TXT-HALTEN"
[ -s "$PDF" ] && send_job "$PDF" "ROL-Test-02-PDF-HALTEN"
echo ""
echo "--- Step 4: Queue + Jobs Uebersicht (lpq + lpstat -o) ---"
echo "(Jobs sollten Status 'held' / 'haltend' haben, KEIN 'processing')"
echo ""
echo "→ lpq -P $Q:"
LC_ALL=C lpq -P "$Q" -a 2>&1 | head -20
echo ""
echo "→ lpstat -o $Q:"
LC_ALL=C lpstat -o "$Q" 2>&1 | head -20
echo ""
echo "→ lpstat -p $Q:"
LC_ALL=C lpstat -p "$Q" 2>&1
echo ""
echo "============================================================"
echo "Zusammenfassung:"
echo "  Queue : $Q"
echo "  Jobs angelegt: ${#JOBIDS[@]}"
for jid in "${JOBIDS[@]}"; do
  echo "    JobID=$jid"
done
echo ""
echo "✅ NÄCHSTE SCHRITTE FÜR DICH AM DRUCKER/WEBIF (CUPS http://localhost:631):"
echo "   • Jobs sind GEHALTEN - sie werden NICHT automatisch gedruckt!"
echo "   • ECHTER TESTDRUCK FREIGEBEN: sudo lp -i ${JOBIDS[0]:-<JobID>} -H resume"
echo "   • ALLE TESTJOBS LÖSCHEN:     sudo cancel -a $Q"
echo "   • SINGLE JOB LÖSCHEN:         sudo cancel ${JOBIDS[0]:-<JobID>}"
echo "   • CUPS WebIF:                 http://localhost:631/jobs/"
echo ""
if [ "${#JOBIDS[@]}" -gt 0 ]; then
  echo "✅ TASK6 TEST-JOBS erfolgreich in CUPS Queue eingereiht!"
  exit 0
else
  echo "❌ TASK6: Keine JobID extrahiert. Sind Jobs angelegt worden?"
  exit 1
fi
