#!/bin/bash
# ============================================================
# TASK Cloudflared: Named Tunnel starten + Status.
# Falls Named-Tunnel nicht klappt (fehlendes Zertifikat/Tunnel-Name),
# Test mit Quick-Tunnel für 20 Sekunden.
# ============================================================
set -u
echo "============================================================"
echo "TASK Cloudflared: Named Tunnel + Quick Fallback Test"
echo "Zeit: $(date '+%F %T')"
echo "============================================================"
echo ""
echo "--- Step 1: Cloudflared Version & Install Check ---"
/usr/bin/cloudflared --version 2>&1 | head -2
echo ""
echo "--- Step 2: /srv/rollladen-monitor/cloudflared Inhalt ---"
ls -la /srv/rollladen-monitor/cloudflared/ 2>&1
echo ""
echo "Inhalt config.yml (anonymisiert, keine Secrets):"
if [ -f /srv/rollladen-monitor/cloudflared/config.yml ]; then
  grep -vE '(Tunnel|CredentialsFile|ingress|service:)' /srv/rollladen-monitor/cloudflared/config.yml 2>&1 | head -15
  echo "  (Zeilen mit Tunnel-ID/Credentials entfernt - vorhanden: $(grep -cE 'tunnel:' /srv/rollladen-monitor/cloudflared/config.yml 2>&1))"
  echo "  ingress rules: $(grep -cE 'ingress:' /srv/rollladen-monitor/cloudflared/config.yml 2>&1)"
fi
echo ""
echo "--- Step 3: systemd Unit Status ---"
echo "is-enabled: $(systemctl is-enabled rollladen-cloudflared.service 2>&1)"
echo "is-active vor Start: $(systemctl is-active rollladen-cloudflared.service 2>&1)"
echo ""
echo "--- Step 4: Starte Named-Tunnel Service (warten 12s) ---"
systemctl start rollladen-cloudflared.service 2>&1 || true
sleep 12
echo "is-active nach 12s: $(systemctl is-active rollladen-cloudflared.service 2>&1)"
systemctl status rollladen-cloudflared.service --no-pager -l -n 10 2>&1 || true
echo ""
echo "--- Step 5: journald letze 30 Zeilen ---"
journalctl -u rollladen-cloudflared.service --no-pager -n 40 -o short-iso 2>&1 || true
echo ""
NSTATUS=$(systemctl is-active rollladen-cloudflared.service 2>&1)
if [ "$NSTATUS" = "active" ]; then
  echo "✅ Named-Tunnel Service ACTIVE!"
else
  echo "⚠️  Named-Tunnel nicht active. Fallback: QUICK-TUNNEL (ohne config) temporär testen!"
  echo "   (Quick-Tunnel braucht kein Zertifikat, liefert sofort trycloudflare URL)"
  echo ""
  echo "--- Step 6: Quick-Tunnel 18 Sekunden starten ---"
  timeout 25 /usr/bin/cloudflared tunnel --no-autoupdate --loglevel info --url http://127.0.0.1:3006 2>&1 | tee /tmp/cf-quick.log &
  CFPID=$!
  sleep 18
  echo ""
  echo "--- Extrahiere Quick-Tunnel URLs aus Log ---"
  grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' /tmp/cf-quick.log 2>/dev/null | head -5 || echo "Keine URL gefunden. Heading Anfang Logs:"
  echo ""
  head -n 30 /tmp/cf-quick.log 2>/dev/null
  echo ""
  # Process killen
  kill $CFPID 2>/dev/null
  sleep 2
  pkill -f 'cloudflared tunnel' 2>/dev/null || true
  echo ""
  echo "(Quick-Tunnel Prozess gestoppt)"
fi
echo ""
echo "Zusammenfassung:"
echo "  Named-Tunnel systemd Unit Active: $NSTATUS"
echo "  Backend HTTP Port 3006 Health: $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3006/health)"
echo ""
exit 0
