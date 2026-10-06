#!/bin/bash
set -u
echo "============================================================"
echo "  (A) Filter in /usr/lib/cups/filter (RICHTIGER PFAD!) prüfen"
echo "  (B) Job 13 in error_log grepen + (C) Neuen Job 14 + grepen"
echo "============================================================"
echo ""
echo "[A] CUPS Filter Pfad /usr/lib/cups/filter:"
echo "  → PWG Raster Filter:"
ls /usr/lib/cups/filter/ 2>&1 | grep -iE "pwg|rastertopwg|brother|pdftoraster|pwg"
echo "  → Alle Filter vorhanden:"
ls /usr/lib/cups/filter/ 2>&1 | head -30
echo ""

echo "[B] Job 13 durchsuchen (letztes error_log + journalctl):"
echo "  → error_log grep Job 13 + Unable + Backend + ipp:"
grep -nE "Job 13|Unable to|Backend|ippBackend|Get-Printer|Create-Job|Send-Document|job#13|Job #13" /var/log/cups/error_log 2>&1 | tail -n 80
echo ""
echo "  → journalctl cups Job 13:"
journalctl -u cups --since "5 min ago" --no-pager 2>&1 | grep -nE "Job 13|Unable|Backend|ippBackend|error|fail|warn" | tail -n 40
echo ""

echo "[C] Neuen Job 14 anlegen (selbes PDF), DANACH sofort error_log grep nach Job 14!"
JOB_BEFORE=$(lpstat -o Brother_QL_1110NWB 2>&1 | wc -l)
echo "  Queue vorher Zeilen: $JOB_BEFORE"
LOGJOB=$(lp -d Brother_QL_1110NWB -o media=Custom.29x90mm -o sides=one-sided /tmp/test-small.pdf 2>&1)
JOBID_NEW=$(echo "$LOGJOB" | grep -oE "[0-9]+" | head -1)
echo "  $LOGJOB → JobID extrahiert: $JOBID_NEW"
echo "  → Warten 5s auf Job Processing..."
for I in 1 2 3 4 5; do sleep 1; echo -n "."; done; echo ""
echo "  → Job Status:"
lpq -P Brother_QL_1110NWB 2>&1
echo ""
echo "  → error_log NUR Job $JOBID_NEW und Unable + Backend (KRITISCHSTE ZEILEN!):"
sleep 2
grep -nE "Job $JOBID_NEW|Unable to|Backend|ippBackend|Create-Job|Send-Document|Validate-Job|Get-Printer-Attributes.*192|192.168.2.103" /var/log/cups/error_log 2>&1 | tail -n 120
echo ""
echo "  → journalctl cups seit 2min nach Job $JOBID_NEW oder Error/Warn:"
journalctl -u cups --since "2 min ago" --no-pager 2>&1 | grep -nE "Job $JOBID_NEW|Unable|Backend|ippBackend|error|fail|warn|Create-Job|Send-Document" | tail -n 60
echo ""
echo "[D] Alternativen! Wenn IPP wirklich nicht will: Was ist mit SOCKET 9100 + Generic Postscript PPD? Oder Brother Driver? Kurz prüfen!"
echo "  → socket Backend vorhanden?:"
ls /usr/lib/cups/backend/ 2>&1 | grep -iE "socket|ipp|http|lpd|parallel"
echo ""
echo "=== ENDE DEBUG! Auswertung folgt ==="
