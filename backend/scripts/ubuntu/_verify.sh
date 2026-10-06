#!/usr/bin/env bash
set -eu
cd /c/Projects/Shopify/backend/scripts/ubuntu
FAIL=0
for f in install-full.sh TASK1-run-on-ubuntu.sh; do
  echo -n "bash -n $f: "
  if bash -n "$f"; then
    echo "OK"
  else
    echo "FAIL (exit $?)"
    FAIL=$((FAIL + 1))
  fi
done
echo "---"
echo "systemd units (grobe Syntaxprüfung: [Section] + Required Keys):"
for u in rollladen-backend.service rollladen-cloudflared.service; do
  echo -n "  $u: "
  # Check: hat [Unit], [Service], [Install], ExecStart
  ok=1
  grep -q "^\[Unit\]" "$u" || ok=0
  grep -q "^\[Service\]" "$u" || ok=0
  grep -q "^\[Install\]" "$u" || ok=0
  grep -q "^ExecStart=" "$u" || ok=0
  if [ $ok -eq 1 ]; then echo "SYNTAX OK (Sections vorhanden + ExecStart da)"; else echo "WARN: Sections oder ExecStart fehlen!"; fi
done
exit $FAIL
