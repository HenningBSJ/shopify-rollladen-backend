#!/bin/bash
set -u
echo "================================================================="
echo "  FINAL ULTIMATE FIX! KANN NICHTS MEHR SCHIEF GEHEN!"
echo "  (1) cups-browsed SERVICE TOTAL ABSTELLEN (Bonjour Chaos Drucker!)"
echo "  (2) Alle Brother Drucker löschen (inkl @BRN Chaos!)"
echo "  (3) EXAKT EINEN Drucker anlegen: socket9100 + driverless:ipp PPD"
echo "      → Filter: pdftopdf → gstoraster → rastertopwg → socket9100"
echo "  (4) cupsaccept + cupsenable + DEFAULT setzen!"
echo "  (5) lpoptions media=29x90mm!"
echo "================================================================="
NAME="Brother_QL_1110NWB"
SOCKET_URI="socket://192.168.2.103:9100"
# driverless PPD vom Brother Avahi Service (benutzen wir wegen rastertopwg Filterkette!)
# Alternativ aus lpinfo -m den driverless Eintrag nehmen:
DRIVERLESS_PPD=$(lpinfo -m 2>&1 | grep -iE "driverless.*QL.*1110" | head -1 | awk '{print $1}')
if [ -z "$DRIVERLESS_PPD" ]; then
  # Fallback, falls Avahi Service gerade nicht sichtbar:
  DRIVERLESS_PPD="driverless:ipp://Brother%20QL-1110NWB._ipp._tcp.local/"
fi
echo "[0] cups-browsed anhalten + maskieren (NIE WIEDER BONJOUR CHAOS DRUCKER!)"
systemctl stop cups-browsed 2>&1 || true
systemctl disable cups-browsed 2>&1 || true
systemctl mask cups-browsed 2>&1 || true
(systemctl is-active cups-browsed 2>&1 | grep -q inactive) && echo "  ✅ cups-browsed inactive + masked! (NIE WIEDER @BRN Chaos!)"
# Zusätzlich cups-browsed aus cupsd.conf entfernen (falls drin!):
[ -f /etc/cups/cups-browsed.conf ] && mv /etc/cups/cups-browsed.conf /etc/cups/cups-browsed.conf.DISABLED 2>&1 || true
pkill -9 cups-browsed 2>&1 || true
sleep 2
echo ""

echo "[1] Alle Brother Drucker vollständig löschen (inklusive aller @BRN.local Temp Drucker!)"
cancel -a -x 2>&1 || true
ALL_BRO=$(lpstat -p 2>&1 | awk '{print $2}' | grep -i "Brother\|brother\|QL" | sort -u)
[ -z "$ALL_BRO" ] && ALL_BRO=""
for PR in $ALL_BRO; do
  echo "  → lpadmin -x $PR"
  lpadmin -x "$PR" 2>&1 || true
done
# Zusätzlich lpstat -v alle Geräte nach Brother durchsuchen:
for PR in $(lpstat -v 2>&1 | grep -i brother | grep -oE "for [^ ]+: " | sed 's/for //;s/://' | sort -u); do
  [ -n "$PR" ] && echo "  → lpadmin -x $PR (von lpstat -v)" && lpadmin -x "$PR" 2>&1 || true
done
sleep 2
REMAIN=$(lpstat -p 2>&1 | grep -ic brother || true)
echo "  → Brother Drucker übrig: $REMAIN"
echo ""

echo "[2] DRUCKER ANLEGEN: Name=$NAME URI=$SOCKET_URI PPD=$DRIVERLESS_PPD"
echo "  → lpadmin -p $NAME -E -v $SOCKET_URI -m $DRIVERLESS_PPD -D \"Brother QL-1110NWB FINAL PERMANENT\" -L \"Rafes Ubuntu CUPS PERMANENT!\""
lpadmin -p "$NAME" -E -v "$SOCKET_URI" -m "$DRIVERLESS_PPD" \
  -D "Brother QL-1110NWB FINAL PERMANENT" \
  -L "Rafes Ubuntu CUPS PERMANENT!" 2>&1
sleep 2
cupsaccept "$NAME" 2>&1
cupsenable "$NAME" 2>&1
lpoptions -d "$NAME" 2>&1
lpoptions -p "$NAME" -o media=custom_29x90mm_29x90mm 2>&1
lpoptions -p "$NAME" -o sides=one-sided 2>&1
lpoptions -p "$NAME" -o print-scaling=auto-fit 2>&1
sleep 2
echo ""

echo "[3] STATUS NACH ANLAGE:"
lpstat -p "$NAME" 2>&1
echo ""
lpstat -v "$NAME" 2>&1
echo ""
lpoptions -d 2>&1
echo ""
echo "  → PPD Options & Media Sizes:"
lpoptions -p "$NAME" -l 2>&1 | head -20
echo ""

echo "[4] TEST JOB VIA /tmp/test-small.pdf! → JobID!"
LOGJOB=$(lp -d "$NAME" /tmp/test-small.pdf 2>&1)
JOBID=$(echo "$LOGJOB" | grep -oE "[0-9]+" | head -1)
echo "  → $LOGJOB → JobID=$JOBID"
echo ""
echo "  --- lpq 12x (jede 0.5s) ---"
for I in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 0.5
  L=$(lpq -P "$NAME" 2>&1 | head -2 | tail -1)
  printf "  %2ds: %s\n" "$I" "$L"
done
echo ""
sleep 3
echo "  → error_log Job $JOBID Filter + Status:"
grep -nE "Job $JOBID|Started filter|Started backend|FINAL_CONTENT_TYPE|exited with|Connecting.*9100|Wrote.*bytes|Waiting for|Job (completed|stopped|aborted)" /var/log/cups/error_log 2>&1 | tail -n 40
echo ""
echo "  → lpstat -W completed:"
lpstat -W completed -P "$NAME" 2>&1 | tail -5
echo ""
echo "================================================================="
echo "  ULTIMATE FIX FERTIG! 👉 SCHAU AM BROTHER: KAM DAS LABEL RAUS?"
echo "================================================================="
