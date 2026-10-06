#!/bin/bash
# ============================================================
# ROLLLADEN MONITOR BACKUP SKRIPT (Ubuntu / Linux)
# ------------------------------------------------------------
# Ausgeführt: Täglich 02:00 via cron.d/rollladen-monitor-backup
# Ausgaben: /var/backups/rollladen-monitor/{pg|slack|env}/
# Retention: Älter als 7 Tage werden automatisch gelöscht!
# Exit 0 = OK, Exit 1 = Fehler
# ============================================================
set -u

SCRIPT_NAME=$(basename "$0")
TS=$(date +%Y-%m-%d_%H-%M-%S)
DAY=$(date +%Y-%m-%d)
LOG_DIR="/var/log/rollladen-monitor"
LOG_FILE="${LOG_DIR}/backup-${DAY}.log"

ENV_FILE="/etc/rollladen-monitor.env"
BACKUP_ROOT="/var/backups/rollladen-monitor"
PG_DIR="${BACKUP_ROOT}/pg"
SLACK_DIR="${BACKUP_ROOT}/slack"
ENV_DIR="${BACKUP_ROOT}/env"

log() {
  local LVL="$1"; shift
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${LVL}] $*" | tee -a "${LOG_FILE}" >&2
}

die() { log "ERROR" "$*"; exit 1; }
mkdir -p "${LOG_DIR}" "${PG_DIR}" "${SLACK_DIR}" "${ENV_DIR}" 2>/dev/null
[ -f "${ENV_FILE}" ] || die ".env fehlt: ${ENV_FILE}"

# ---------- 1. ENV laden ----------
log "INFO" "=== Backup-Start: ${TS} ==="
set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

RETENTION_DAYS=7
OK_COUNT=0
FAIL_COUNT=0

# ---------- 2. POSTGRESQL / NEON BACKUP via pg_dump ----------
if [ -n "${DATABASE_URL:-}" ] && echo "${DATABASE_URL}" | grep -qE '^postgres(ql)?://'; then
  FNAME="pg-dump-${TS}.sql.gz"
  FPATH="${PG_DIR}/${FNAME}"
  log "INFO" "[PostgreSQL] Starte pg_dump nach ${FNAME} ..."
  if command -v pg_dump >/dev/null 2>&1; then
    if PGPASSWORD= PGSSLMODE=require pg_dump "${DATABASE_URL}" 2>>"${LOG_FILE}" | gzip -9 -c > "${FPATH}"; then
      SIZE=$(du -h "${FPATH}" | cut -f1)
      log "INFO" "[PostgreSQL] ✅ OK! Größe=${SIZE}"
      OK_COUNT=$((OK_COUNT+1))
    else
      log "WARN" "[PostgreSQL] pg_dump fehlgeschlagen (exit $?)! Datei gelöscht."
      rm -f "${FPATH}"
      FAIL_COUNT=$((FAIL_COUNT+1))
    fi
  else
    log "WARN" "[PostgreSQL] pg_dump nicht installiert! apt install postgresql-client"
    FAIL_COUNT=$((FAIL_COUNT+1))
  fi
else
  log "WARN" "[PostgreSQL] DATABASE_URL leer oder ungültig - übersprungen."
fi

# ---------- 3. SLACK LISTS PRODUKTIONSBOARD BACKUP via Node.js slack.js ----------
NODE_BIN=$(command -v node || true)
BACKEND_DIR="/srv/rollladen-monitor/backend"
SLACK_JS="${BACKEND_DIR}/backup-slack.js"
if [ -x "${NODE_BIN}" ] && [ -f "${SLACK_JS}" ]; then
  log "INFO" "[Slack] Starte Node.js Slack Backup (Slack Lists Endpoint via slack.js) ..."
  TMP_SLACK_OUT=$(mktemp -d)
  export BACKUP_SLACK_DIR="${TMP_SLACK_OUT}"
  cd "${BACKEND_DIR}" || true
  if sudo -u rollladen "${NODE_BIN}" "${SLACK_JS}" "${TMP_SLACK_OUT}" >>"${LOG_FILE}" 2>&1; then
    MOVED=0
    for F in "${TMP_SLACK_OUT}"/*.gz; do
      [ -e "${F}" ] || continue
      FN=$(basename "${F}")
      if mv "${F}" "${SLACK_DIR}/${FN}" 2>>"${LOG_FILE}"; then
        chown rollladen:adm "${SLACK_DIR}/${FN}" 2>/dev/null
        SIZE=$(du -h "${SLACK_DIR}/${FN}" | cut -f1)
        log "INFO" "[Slack] ✅ Transfer OK: ${FN} (${SIZE})"
        MOVED=$((MOVED+1))
        OK_COUNT=$((OK_COUNT+1))
      fi
    done
    [ ${MOVED} -eq 0 ] && { log "WARN" "[Slack] Node.js lieferte keine .gz Dateien!" ; FAIL_COUNT=$((FAIL_COUNT+1)) ; }
  else
    log "WARN" "[Slack] Node.js Prozess Exit != 0 (s. Log)"
    FAIL_COUNT=$((FAIL_COUNT+1))
  fi
  rm -rf "${TMP_SLACK_OUT}"
else
  log "WARN" "[Slack] node=${NODE_BIN:-N/A} oder slack backup fehlt! - Übersprungen"
  FAIL_COUNT=$((FAIL_COUNT+1))
fi

# ---------- 4. .env DATEI BACKUP ----------
FNAME="env-$(hostname)-${TS}.b64"
FPATH="${ENV_DIR}/${FNAME}"
if base64 -w0 "${ENV_FILE}" | gzip -9 > "${FPATH}.gz" 2>>"${LOG_FILE}"; then
  chmod 640 "${FPATH}.gz"
  SIZE=$(du -h "${FPATH}.gz" | cut -f1)
  log "INFO" "[ENV] ✅ ${ENV_FILE} → ${FNAME}.gz (${SIZE}) [base64/gz/chmod 640]"
  OK_COUNT=$((OK_COUNT+1))
else
  log "WARN" "[ENV] Schreiben fehlgeschlagen"; rm -f "${FPATH}" "${FPATH}.gz"
  FAIL_COUNT=$((FAIL_COUNT+1))
fi

# ---------- 5. RETENTION: Lösche Backups älter als RETENTION_DAYS ----------
log "INFO" "[Retention] Lösche Dateien älter als ${RETENTION_DAYS} Tage..."
DEL=0
for DIR in "${PG_DIR}" "${SLACK_DIR}" "${ENV_DIR}"; do
  while IFS= read -r FILE; do
    [ -z "${FILE}" ] && continue
    rm -f "${FILE}" && DEL=$((DEL+1))
  done < <(find "${DIR}" -type f -mtime +${RETENTION_DAYS} 2>/dev/null)
done
for DIR in "${LOG_DIR}"; do
  while IFS= read -r FILE; do
    [ -z "${FILE}" ] && continue
    rm -f "${FILE}" && DEL=$((DEL+1))
  done < <(find "${DIR}" -type f -mtime +${RETENTION_DAYS} 2>/dev/null)
done
log "INFO" "[Retention] Gelöscht: ${DEL} alte Dateien"

# ---------- 6. ZUSAMMENFASSUNG ----------
log "INFO" "=== Backup Ende: OK=${OK_COUNT} FAIL=${FAIL_COUNT} ==="
[ ${FAIL_COUNT} -eq 0 ] || {
  log "WARN" "Es sind ${FAIL_COUNT} Fehler aufgetreten (s. ${LOG_FILE})"
  [ ${OK_COUNT} -gt 0 ] || exit 1
}
exit 0
