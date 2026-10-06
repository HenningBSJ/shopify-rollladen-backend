#!/bin/bash
set -u
echo "============================================================"
echo "  DEEP DEBUG CUPS JOB 12 + LOGLEVEL SETZEN + KLEINER PDF-TEST"
echo "============================================================"
echo "[0] Job 12 Details und Historie:"
lpstat -l -W all -P Brother_QL_1110NWB 2>&1 | head -30
echo ""
echo "  → Job 12 mit allen attributes (falls noch da!):"
lpstat -l Brother_QL_1110NWB-12 2>&1 || echo "  Job 12 evtl. schon gelöscht"
echo ""

echo "[1] CUPS LogLevel auf DEBUG setzen (KRITISCH! Für vollständige Filter+Backend Trace!)"
cupsctl LogLevel=debug 2>&1 || sudo cupsctl LogLevel=debug 2>&1
echo "  → cupsctl --debug-logging (alles an!):"
cupsctl --debug-logging 2>&1 || sudo cupsctl --debug-logging 2>&1
echo "  → Aktuelles cupsctl:"
cupsctl 2>&1
echo ""

echo "[2] PDF Filter prüfen (ob pdftopwg oder pdftoraster etc. vorhanden → evtl. fehlt einfach Paket!):"
echo "  dpkg -L cups-filters-core-drivers 2>&1 | head -5 → (core cups filters installiert?):"
dpkg -l | grep -E "cups-filters|ghostscript|poppler|libcups" 2>&1
echo ""
echo "  → welche pdftoraster/pdftopwg Filter:"
for F in pdftopwg pdftops pdftocairo pdftoraster rastertopwg rastertobrother; do
  PFAD=$(command -v "$F" 2>&1)
  [ -n "$PFAD" ] && echo "  ✅ $F → $PFAD" || echo "  ❌ $F NICHT GEFUNDEN!"
done
echo ""

echo "[3] PDF Testdatei erzeugen (einfach, damit wir direkt via lp drucken ohne Backend!):"
apt-get install -y --no-install-recommends enscript 2>&1 | tail -n 2
if command -v enscript >/dev/null; then
  echo "TEST FINAL DRUCK UBUNTU QL1110 - SEITE 1 OK" | enscript -B -o /tmp/test1.ps 2>/dev/null && ps2pdf /tmp/test1.ps /tmp/test-small.pdf && ls -la /tmp/test-small.pdf 2>&1
fi
if [ ! -f /tmp/test-small.pdf ]; then
  echo "  → Fallback: echo mini PDF..."
  echo -e "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 100]/Parent 2 0 R/Resources<<>>>>endobj\ntrailer<</Root 1 0 R>>" > /tmp/test-small.pdf 2>/dev/null || true
  ls -la /tmp/test-small.pdf 2>&1
fi
echo ""

echo "[4] PDF DIREKT via lp drucken (ohne Backend!) → sieht man IPP Fehler live in error_log danach!"
echo "  → Befehl: lp -d Brother_QL_1110NWB -o media=Custom.29x90mm -o sides=one-sided /tmp/test-small.pdf"
LOGDATEI=$(mktemp)
lp -d Brother_QL_1110NWB \
  -o media=Custom.29x90mm \
  -o sides=one-sided \
  -o outputorder=normal \
  /tmp/test-small.pdf > $LOGDATEI 2>&1
LP_RC=$?
JOBID=$(cat $LOGDATEI | grep -oE "request id is [0-9]+" | grep -oE "[0-9]+" || true)
echo "  lp rc=$LP_RC → JobID=$JOBID"
cat $LOGDATEI
echo ""

echo "[5] Jetzt 8x im Abstand 1s lpq (Job ist processing!):"
for I in 1 2 3 4 5 6 7 8; do
  sleep 1
  echo "  --- $I s ---"
  lpq -P Brother_QL_1110NWB 2>&1 | head -6
  [ -n "$JOBID" ] && lpstat -l Brother_QL_1110NWB-$JOBID 2>&1 | head -4
done
echo ""

echo "[6] JETZT: CUPS error_log (DEBUG!) mit Filter+Backend Trace! (KRITISCH!):"
sleep 3
echo "=== error_log JETZT LETZTE 150 ZEILEN ==="
if command -v journalctl >/dev/null; then
  journalctl -u cups --since "2 min ago" --no-pager 2>&1 | tail -n 150
fi
echo "=== /var/log/cups/error_log tail 150 ==="
[ -r /var/log/cups/error_log ] && tail -n 150 /var/log/cups/error_log 2>&1 || sudo tail -n 150 /var/log/cups/error_log 2>&1
echo ""

echo "[7] Ergebnisprüfung Job:"
[ -n "$JOBID" ] && echo "→ Job-Details: $(lpstat -l Brother_QL_1110NWB-$JOBID 2>&1 | head -20)"
echo "  → Jobs completed: $(lpstat -W completed -P Brother_QL_1110NWB 2>&1 | grep -c Brother)"
echo "  → Jobs pending: $(lpstat -o Brother_QL_1110NWB 2>&1 | wc -l)"
echo ""
echo "FERTIG MIT DEBUG!"
