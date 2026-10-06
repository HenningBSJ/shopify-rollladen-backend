#!/bin/bash
# ============================================================
# ENV Fix: Alle VAR=VALUE Paare in /etc/rollladen-monitor.env
# mit Single Quotes versehen, damit Sonderzeichen ( ) % $ etc.
# von bash source korrekt geparst werden.
# ============================================================
set -eu
ENV_FILE="/etc/rollladen-monitor.env"
if [ "$(id -u)" != "0" ]; then
  echo "Muss als root laufen!" >&2; exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE nicht gefunden!" >&2; exit 1
fi

BACKUP="${ENV_FILE}.bak-quotefix.$(date +%s)"
cp -a "$ENV_FILE" "$BACKUP"
echo "Backup: $BACKUP"

TMPNEW="${ENV_FILE}.new"
: > "$TMPNEW"

# Zeile für Zeile verarbeiten mit reinem bash (awk vermeiden wegen quoting hell)
while IFS= read -r line || [ -n "$line" ]; do
  # Kommentare und Leerzeilen 1:1 kopieren
  case "$line" in
    ''|\#*) echo "$line" >> "$TMPNEW"; continue ;;
  esac
  # Hat es ein = (ist es VAR=VALUE)?
  if [[ "$line" == *=* ]]; then
    var="${line%%=*}"
    val="${line#*=}"
    # Valider Var-Name?
    if [[ "$var" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      # Schon in Single/Double Quotes? Falls Anfang + Ende passend, uebernehmen
      if [[ ${#val} -ge 2 ]]; then
        fc="${val:0:1}"
        lc="${val: -1}"
        if { [ "$fc" = "'" ] && [ "$lc" = "'" ]; } || { [ "$fc" = '"' ] && [ "$lc" = '"' ]; }; then
          echo "${var}=${val}" >> "$TMPNEW"
          continue
        fi
      fi
      # Escape single quotes im Value: ' -> '\''
      esc="${val//\'/\'\\\'\'}"
      echo "${var}='${esc}'" >> "$TMPNEW"
      continue
    fi
  fi
  # Fallback: Zeile unverändert lassen
  echo "$line" >> "$TMPNEW"
done < "$BACKUP"

chown root:rollladen "$TMPNEW"
chmod 640 "$TMPNEW"
if command -v getfacl >/dev/null 2>&1; then
  getfacl "$BACKUP" 2>/dev/null | setfacl --set-file=- "$TMPNEW" 2>/dev/null || true
fi
mv -f "$TMPNEW" "$ENV_FILE"
echo "OK: Neue ENV geschrieben nach $ENV_FILE"
echo ""

echo "=== SYNTAX CHECK (bash -n) ==="
bash -n "$ENV_FILE" && echo "  bash -n: OK_SYNTAX"
echo ""

echo "=== SOURCE TEST als User rollladen ==="
echo "000000" | sudo -S -p '' -u rollladen bash -c '
set -a
. /etc/rollladen-monitor.env
echo "  PORT=$PORT"
echo "  NODE_ENV=$NODE_ENV"
echo "  SAFE_MODE_SLACK=$SAFE_MODE_SLACK"
echo "  ALLOW_START_WITHOUT_DB=$ALLOW_START_WITHOUT_DB"
echo "  MONITOR_HTTP_USER=$MONITOR_HTTP_USER"
echo "  MONITOR_HTTP_PASSWORD Laenge=${#MONITOR_HTTP_PASSWORD}"
echo "  DIRECT_PRINT_PRINTER=$DIRECT_PRINT_PRINTER"
echo "  DIRECT_PRINT_CHROMIUM_EXE=$DIRECT_PRINT_CHROMIUM_EXE"
echo "  ENV_SOURCE_OK"
' 2>&1
echo ""

echo "=== Kopf 25 Zeilen (cat -An) ==="
head -25 "$ENV_FILE" | cat -An
echo ""
echo "Fertig."
exit 0
