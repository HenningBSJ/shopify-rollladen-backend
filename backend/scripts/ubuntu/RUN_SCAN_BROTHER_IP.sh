#!/bin/bash
# VERSUCHE BROTHER IM NETZWERK ZU FINDEN via IPP / SOCKET SCAN 192.168.2.1..254
# MAC sollte 00:80:77 sein.
SUBNET="192.168.2"
echo "=== Brother Scan 192.168.2.1 - 192.168.2.200 ==="
echo "Sucht offene Port 631 (IPP) & 9100 (RAW) + MAC 00:80:77 via ARP!"
echo ""
for i in $(seq 1 200); do
  IP="${SUBNET}.${i}"
  # PARALLEL nicht möglich, daher sequentiell timeout 0.4s
  (nc -zv -w 0.3 "$IP" 631 2>/dev/null && echo "✅ IPP   631 FOUND: $IP") &
  (nc -zv -w 0.3 "$IP" 9100 2>/dev/null && echo "✅ RAW  9100 FOUND: $IP") &
done
wait
sleep 1
echo ""
echo "=== ARP CACHE nach MAC 00:80:77 ==="
ip neigh show 2>/dev/null | grep -iE "00:80:77|brn|brother"
echo ""
echo "=== Bonjour mDNS / avahi scan Brother ==="
timeout 8 avahi-browse -t -r _ipp._tcp 2>&1 | grep -iE "brother|QL-1110" || echo "(avahi-browse nicht installiert oder timeout)"
echo ""
echo "=== DONE. Gefundene IPs oben mit ✅ ==="
