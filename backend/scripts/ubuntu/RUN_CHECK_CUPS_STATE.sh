#!/bin/bash
set +u
echo "=== 1) Job 26 canceln ==="
cancel 26 2>&1 || true
cancel -a -x 2>&1
sleep 2
echo 'lpq:'; lpq -P Brother_QL_1110NWB 2>&1
echo ""
echo "=== 2) LOGLEVEL PRÜFEN ==="
echo '--- cupsctl ---'
cupsctl 2>&1
echo '--- /etc/cups/cupsd.conf LogLevel ---'
grep -nE '^LogLevel|^MaxLogSize' /etc/cups/cupsd.conf
echo '--- ps auxf cupsd ---'
ps auxfww | grep -iE 'cupsd' | grep -v grep
echo '--- /var/log/cups/ LS ---'
ls -la /var/log/cups/ 2>&1
echo ""
echo "=== 3) PPD cupstestppd ==="
echo '--- cupstestppd /etc/cups/ppd/Brother_QL_1110NWB.ppd ---'
cupstestppd /etc/cups/ppd/Brother_QL_1110NWB.ppd 2>&1 | tail -20
echo '--- lpinfo Brother devices ---'
lpinfo -v 2>&1 | grep -iE 'brother|192.168.2.103' | head -10
echo ""
echo "=== 4) FILTER EXISTENZ & RECHTE ==="
for f in /usr/lib/cups/filter/pdftopdf /usr/lib/cups/filter/gstoraster /usr/lib/cups/filter/rastertopwg /usr/lib/cups/backend/ipp /usr/lib/cups/backend/socket; do
  echo -n "  $f: "
  if [ -x "$f" ]; then ls -la "$f"; else echo 'NICHT VORHANDEN!'; fi
done
echo '--- which gs ---'
which gs
echo ""
echo "=== 5) CUPS NEUSTART + DEFINITIV LOGLEVEL DEBUG ==="
cupsctl LogLevel=debug 2>&1
echo 'cupsctl now:'
cupsctl 2>&1 | head -10
systemctl daemon-reload 2>&1
systemctl restart cups.socket cups.service 2>&1
sleep 5
echo '--- systemctl is-active ---'
systemctl is-active cups cups.socket cups-browsed 2>&1
echo '--- systemctl status cups ---'
systemctl status cups 2>&1 | head -10
