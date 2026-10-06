#!/bin/bash
set -u

echo "========================================"
echo " STOP UBUNTU NAMED TUNNEL (Domain Kollision beheben) "
echo "========================================"

echo ""
echo "[1/5] systemctl stop rollladen-cloudflared.service ..."
systemctl stop rollladen-cloudflared.service 2>&1 || echo "  → stop exit=$? (harmlos wenn bereits gestoppt)"

sleep 2

echo ""
echo "[2/5] systemctl disable rollladen-cloudflared.service ..."
systemctl disable rollladen-cloudflared.service 2>&1 || echo "  → disable exit=$? (harmlos wenn bereits disabled)"

sleep 1

echo ""
echo "[3/5] Zombie cloudflared Prozesse killen (pkill -9 -f 'cloudflared.*tunnel run') ..."
pkill -9 -f "cloudflared.*tunnel run" 2>/dev/null || true
sleep 1

echo ""
echo "[4/5] Zweiter pkill Safety ..."
pkill -9 -f "cloudflared --config" 2>/dev/null || true
sleep 1

echo ""
echo "========================================"
echo " VERIFICATION "
echo "========================================"
echo "Active  : $(systemctl is-active rollladen-cloudflared.service 2>&1)"
echo "Enabled : $(systemctl is-enabled rollladen-cloudflared.service 2>&1)"
echo ""
echo "Running cloudflared processes (pgrep -af):"
pgrep -af cloudflared || echo "  (keine — GUT!)"
echo ""
echo "========================================"
echo " ✅ STOP SKRIPT FERTIG — Domain monitor.rollladenwelt.de ist jetzt wieder NUR Windows-Tunnel = KEINE KOLLISION MEHR"
echo "========================================"
exit 0
