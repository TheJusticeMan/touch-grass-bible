#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AI_DIR="$ROOT_DIR/ai"
PID_FILE="$AI_DIR/wander.pid"
LOG_FILE="$AI_DIR/wander.log"
STATE_FILE="$AI_DIR/wander-state.json"

mkdir -p "$AI_DIR"

usage() {
  cat <<'EOF'
Usage: ./scripts/wander-tsk-control.sh <command>

Commands:
  start     Start wanderer in background (respects existing state if present)
  stop      Stop background wanderer process
  restart   Stop then start
  resume    Alias for start; intended for semantic clarity
  status    Show process status and state file presence
  tail      Tail wander log continuously
EOF
}

is_running() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 1
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

start() {
  if is_running; then
    echo "wander-tsk is already running (pid=$(cat "$PID_FILE"))."
    exit 0
  fi

  if [[ -f "$PID_FILE" ]]; then
    rm -f "$PID_FILE"
  fi

  (
    cd "$ROOT_DIR"
    nohup npm run ai:wander:tsk >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
  )

  echo "wander-tsk started (pid=$(cat "$PID_FILE"))."
  if [[ -f "$STATE_FILE" ]]; then
    echo "resume source: $STATE_FILE"
  else
    echo "no state file found; walker will initialize at START_OSIS/default."
  fi
}

stop() {
  if ! is_running; then
    echo "wander-tsk is not running."
    rm -f "$PID_FILE"
    exit 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  kill "$pid"

  for _ in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.2
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo "process did not exit in time; sending SIGKILL."
    kill -9 "$pid"
  fi

  rm -f "$PID_FILE"
  echo "wander-tsk stopped."
}

status() {
  if is_running; then
    echo "running (pid=$(cat "$PID_FILE"))"
  else
    echo "not running"
  fi

  if [[ -f "$STATE_FILE" ]]; then
    echo "state: present ($STATE_FILE)"
  else
    echo "state: missing ($STATE_FILE)"
  fi

  if [[ -f "$LOG_FILE" ]]; then
    echo "log: present ($LOG_FILE)"
  else
    echo "log: missing ($LOG_FILE)"
  fi
}

tail_logs() {
  touch "$LOG_FILE"
  tail -f "$LOG_FILE"
}

command="${1:-}"
case "$command" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    stop || true
    start
    ;;
  resume)
    start
    ;;
  status)
    status
    ;;
  tail)
    tail_logs
    ;;
  *)
    usage
    exit 1
    ;;
esac
