#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APPLICATION_NAME="picture-flashcards"
CONFIG_FILE="$APP_ROOT/.picture-flashcards.local.env"
RUNTIME_DIR="$APP_ROOT/.picture-flashcards-runtime"
LOG_DIR="$RUNTIME_DIR/logs"
SUPERVISOR_PID_FILE="$RUNTIME_DIR/supervisor.pid"
API_PID_FILE="$RUNTIME_DIR/api.pid"
WEB_PID_FILE="$RUNTIME_DIR/web.pid"
DATA_DIR="$APP_ROOT/.picture-flashcards-data"
DEFAULT_WEB_PORT=5016
DEFAULT_API_HOST=127.0.0.1
DEFAULT_WEB_HOST=0.0.0.0
USE_SAVED_CONFIG=false
RESTART_OWNED=false
COMMAND="install"
SHUTDOWN_STARTED=false

ENV_WEB_PORT="${WEB_PORT:-${APP_PORT:-${PORT:-}}}"
ENV_API_PORT="${API_PORT:-}"
ENV_WEB_HOST="${WEB_HOST:-}"
ENV_API_HOST="${API_HOST:-}"
ENV_INSTANCE_NAME="${INSTANCE_NAME:-}"

CLI_WEB_PORT=""
CLI_API_PORT=""
CLI_WEB_HOST=""
CLI_API_HOST=""
CLI_INSTANCE_NAME=""

fail() {
  echo "Picture Flashcards: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  ./install.sh [options]

Install and run Picture Flashcards under a foreground supervisor. The web
listener is the only externally reachable listener by default; the API binds
to loopback and is proxied by the web server.

Options:
  --web-port PORT, --app-port PORT
  --api-port PORT
  --web-host HOST
  --api-host HOST
  --instance NAME
  --use-saved-config       Reuse the saved configuration.
  --restart-owned          Stop this app's own supervisor before rebuilding.
  --print-effective-config Print configuration and exit.
  --check                  Validate configuration and port ownership, then exit.
  --status                 Show this app's process and listener status.
  --logs                   Show the most recent application logs.
  --stop                   Stop this app's own supervisor only.
  --help

Configuration precedence is command line, environment, saved configuration,
then documented defaults. No port is selected automatically after a collision.
EOF
}

valid_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] || return 1
  local port_number=$((10#$1))
  (( port_number >= 1 && port_number <= 65535 ))
}

valid_host() {
  [[ -n "$1" && "$1" != *[[:space:]]* ]]
}

pid_is_running() {
  [[ "$1" =~ ^[0-9]+$ ]] && kill -0 "$1" 2>/dev/null
}

pid_command() {
  local pid="$1"
  [[ -r "/proc/$pid/cmdline" ]] || return 0
  tr '\0' ' ' < "/proc/$pid/cmdline"
}

pid_belongs_to_app() {
  local pid="$1"
  local cwd
  local command
  pid_is_running "$pid" || return 1
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  [[ "$cwd" == "$APP_ROOT" ]] || return 1
  command="$(pid_command "$pid")"
  [[ "$command" == *"$APP_ROOT/install.sh"* ]] && return 0
  [[ "$command" =~ (^|[[:space:]/])(\./)?install\.sh([[:space:]]|$) ]]
}

read_saved_config() {
  SAVED_WEB_PORT=""
  SAVED_API_PORT=""
  SAVED_WEB_HOST=""
  SAVED_API_HOST=""
  SAVED_INSTANCE_NAME=""
  [[ -f "$CONFIG_FILE" ]] || return 0

  local key value
  while IFS='=' read -r key value; do
    value="${value%$'\r'}"
    case "$key" in
      WEB_PORT|APP_PORT) [[ -z "$SAVED_WEB_PORT" ]] && SAVED_WEB_PORT="$value" ;;
      API_PORT) SAVED_API_PORT="$value" ;;
      WEB_HOST) SAVED_WEB_HOST="$value" ;;
      API_HOST) SAVED_API_HOST="$value" ;;
      INSTANCE_NAME) SAVED_INSTANCE_NAME="$value" ;;
      ""|\#*) ;;
      *) fail "Unknown setting in $CONFIG_FILE: $key" ;;
    esac
  done < "$CONFIG_FILE"
}

parse_args() {
  while (($#)); do
    case "$1" in
      --web-port|--app-port)
        (($# >= 2)) || fail "$1 requires a port"
        CLI_WEB_PORT="$2"
        shift 2
        ;;
      --api-port)
        (($# >= 2)) || fail "--api-port requires a port"
        CLI_API_PORT="$2"
        shift 2
        ;;
      --web-host)
        (($# >= 2)) || fail "--web-host requires a host"
        CLI_WEB_HOST="$2"
        shift 2
        ;;
      --api-host)
        (($# >= 2)) || fail "--api-host requires a host"
        CLI_API_HOST="$2"
        shift 2
        ;;
      --instance)
        (($# >= 2)) || fail "--instance requires a name"
        CLI_INSTANCE_NAME="$2"
        shift 2
        ;;
      --use-saved-config)
        USE_SAVED_CONFIG=true
        shift
        ;;
      --restart-owned)
        RESTART_OWNED=true
        shift
        ;;
      --print-effective-config)
        COMMAND="print"
        shift
        ;;
      --check|--doctor)
        COMMAND="check"
        shift
        ;;
      --status)
        COMMAND="status"
        shift
        ;;
      --logs)
        COMMAND="logs"
        shift
        ;;
      --stop)
        COMMAND="stop"
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        usage >&2
        fail "Unknown option: $1"
        ;;
    esac
  done
}

choose_config() {
  read_saved_config

  if [[ "$USE_SAVED_CONFIG" == true && ! -f "$CONFIG_FILE" ]]; then
    fail "No saved configuration exists. Run ./install.sh first."
  fi

  WEB_PORT="${CLI_WEB_PORT:-${ENV_WEB_PORT:-${SAVED_WEB_PORT:-}}}"
  if [[ -z "$WEB_PORT" ]]; then
    if [[ "$COMMAND" == "install" && -t 0 ]]; then
      read -r -p "Web port [$DEFAULT_WEB_PORT]: " WEB_PORT
    else
      WEB_PORT="$DEFAULT_WEB_PORT"
      [[ "$COMMAND" == "install" ]] && echo "No interactive terminal; using web port $WEB_PORT."
    fi
  fi

  API_PORT="${CLI_API_PORT:-${ENV_API_PORT:-${SAVED_API_PORT:-}}}"
  API_PORT="${API_PORT:-$((10#$WEB_PORT + 1))}"
  WEB_HOST="${CLI_WEB_HOST:-${ENV_WEB_HOST:-${SAVED_WEB_HOST:-$DEFAULT_WEB_HOST}}}"
  API_HOST="${CLI_API_HOST:-${ENV_API_HOST:-${SAVED_API_HOST:-$DEFAULT_API_HOST}}}"
  INSTANCE_NAME="${CLI_INSTANCE_NAME:-${ENV_INSTANCE_NAME:-${SAVED_INSTANCE_NAME:-default}}}"

  valid_port "$WEB_PORT" || fail "Invalid web port: $WEB_PORT"
  valid_port "$API_PORT" || fail "Invalid API port: $API_PORT"
  valid_host "$WEB_HOST" || fail "Invalid web host: $WEB_HOST"
  valid_host "$API_HOST" || fail "Invalid API host: $API_HOST"
  [[ "$INSTANCE_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail "Invalid instance name: $INSTANCE_NAME"
  [[ "$WEB_PORT" != "$API_PORT" ]] || fail "Web and API ports must be different."
}

ensure_runtime() {
  command -v node >/dev/null 2>&1 || fail "Node.js is required. Install Node.js 20 or newer."

  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  (( node_major >= 20 )) || fail "Node.js 20 or newer is required; found $(node --version)."

  if command -v pnpm >/dev/null 2>&1; then
    PNPM_CMD=(pnpm)
  elif command -v corepack >/dev/null 2>&1; then
    PNPM_CMD=(corepack pnpm)
  else
    fail "pnpm or Corepack is required."
  fi

  command -v setsid >/dev/null 2>&1 || fail "setsid is required to manage application process groups."
}

port_owner() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | awk -v wanted=":$port" '$4 ~ wanted "$"'
  else
    echo "Listener details unavailable: install lsof or ss for diagnostics." >&2
  fi
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk -v wanted=":$port" '$4 ~ wanted "$" { found=1 } END { exit !found }'
    return
  fi
  return 1
}

fail_if_port_in_use() {
  local label="$1"
  local host="$2"
  local port="$3"
  if port_in_use "$port"; then
    echo "Cannot start $APPLICATION_NAME ($INSTANCE_NAME): $label port $port on $host is already occupied." >&2
    port_owner "$port" >&2
    echo "Inspect the owner with: lsof -nP -iTCP:$port -sTCP:LISTEN" >&2
    echo "Choose another port with: ./install.sh --${label,,}-port PORT" >&2
    return 1
  fi
}

write_config() {
  umask 077
  cat > "$CONFIG_FILE" <<EOF
# Generated by install.sh. Do not add shell commands to this file.
WEB_PORT=$WEB_PORT
APP_PORT=$WEB_PORT
API_PORT=$API_PORT
WEB_HOST=$WEB_HOST
API_HOST=$API_HOST
INSTANCE_NAME=$INSTANCE_NAME
EOF
}

print_effective_config() {
  echo "Application: $APPLICATION_NAME"
  echo "Instance: $INSTANCE_NAME"
  echo "Environment: ${NODE_ENV:-production}"
  echo "Web host: $WEB_HOST"
  echo "Web port: $WEB_PORT"
  echo "API host: $API_HOST"
  echo "API port: $API_PORT"
  echo "Primary listener: $WEB_HOST:$WEB_PORT"
  echo "Additional listeners: $API_HOST:$API_PORT (local API proxy; not LAN-exposed when API_HOST=127.0.0.1)"
  echo "Data directory: $DATA_DIR"
  echo "Config file: $CONFIG_FILE"
  echo "Log directory: $LOG_DIR"
  echo "Runtime directory: $RUNTIME_DIR"
  echo "Automatic startup: disabled (no systemd, cron, or boot entry is installed)"
  echo "Health endpoint: http://$WEB_HOST:$WEB_PORT/api/healthz via the web proxy"
  echo "API health endpoint: http://$API_HOST:$API_PORT/api/healthz"
  echo "Status: ./install.sh --status"
  echo "Logs: ./install.sh --logs"
  echo "Stop: ./install.sh --stop"
}

supervisor_pid() {
  [[ -f "$SUPERVISOR_PID_FILE" ]] || return 1
  cat "$SUPERVISOR_PID_FILE"
}

supervisor_is_running() {
  local pid
  pid="$(supervisor_pid 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  if pid_belongs_to_app "$pid"; then
    return 0
  fi
  if pid_is_running "$pid"; then
    fail "Refusing to use supervisor PID $pid: it is not owned by this application."
  fi
  rm -f "$SUPERVISOR_PID_FILE"
  return 1
}

stop_process_group() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  pid_is_running "$pid" || return 0

  local pgid
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
  if [[ "$pgid" == "$pid" && "$pgid" =~ ^[0-9]+$ && "$pgid" -gt 1 ]]; then
    kill -TERM -- "-$pgid" 2>/dev/null || true
  else
    kill -TERM "$pid" 2>/dev/null || true
  fi

  for _ in {1..20}; do
    pid_is_running "$pid" || return 0
    sleep 0.25
  done

  echo "A managed $APPLICATION_NAME process did not stop cleanly (PID $pid)." >&2
  if [[ "$pgid" == "$pid" && "$pgid" =~ ^[0-9]+$ && "$pgid" -gt 1 ]]; then
    kill -KILL -- "-$pgid" 2>/dev/null || true
  else
    kill -KILL "$pid" 2>/dev/null || true
  fi
}

stop_owned_supervisor() {
  local pid
  pid="$(supervisor_pid 2>/dev/null || true)"
  [[ -n "$pid" ]] || {
    echo "No running $APPLICATION_NAME supervisor was found."
    return 0
  }
  pid_belongs_to_app "$pid" || fail "Refusing to stop PID $pid because it is not this application's supervisor."
  kill -TERM "$pid" 2>/dev/null || true
  for _ in {1..40}; do
    pid_is_running "$pid" || {
      rm -f "$SUPERVISOR_PID_FILE"
      echo "Stopped $APPLICATION_NAME ($INSTANCE_NAME)."
      return 0
    }
    sleep 0.25
  done
  fail "The application supervisor did not stop cleanly; no unrelated process was killed."
}

shutdown_children() {
  [[ "$SHUTDOWN_STARTED" == true ]] && return 0
  SHUTDOWN_STARTED=true
  stop_process_group "$(cat "$WEB_PID_FILE" 2>/dev/null || true)"
  stop_process_group "$(cat "$API_PID_FILE" 2>/dev/null || true)"
  rm -f "$WEB_PID_FILE" "$API_PID_FILE" "$SUPERVISOR_PID_FILE"
}

handle_signal() {
  local signal="$1"
  echo "Received $signal; stopping managed $APPLICATION_NAME processes."
  exit 0
}

install_dependencies_and_build() {
  cd "$APP_ROOT"
  echo "Installing workspace dependencies locally..."
  "${PNPM_CMD[@]}" install --frozen-lockfile
  echo "Building shared workspace libraries..."
  "${PNPM_CMD[@]}" run typecheck:libs
  echo "Checking the API and frontend..."
  "${PNPM_CMD[@]}" --filter @workspace/api-server run typecheck
  "${PNPM_CMD[@]}" --filter @workspace/picture-flashcards run typecheck
  echo "Building the API..."
  "${PNPM_CMD[@]}" --filter @workspace/api-server run build
  echo "Building the frontend..."
  WEB_PORT="$WEB_PORT" API_PORT="$API_PORT" API_HOST="$API_HOST" WEB_HOST="$WEB_HOST" BASE_PATH=/ \
    "${PNPM_CMD[@]}" --filter @workspace/picture-flashcards run build
}

start_managed_child() {
  local pid_file="$1"
  local log_file="$2"
  shift 2
  setsid env "$@" > "$log_file" 2>&1 &
  local pid=$!
  echo "$pid" > "$pid_file"
  echo "$pid"
}

wait_for_health() {
  command -v curl >/dev/null 2>&1 || return 0
  local api_url="http://127.0.0.1:$API_PORT/api/healthz"
  local web_url="http://127.0.0.1:$WEB_PORT/"
  for _ in {1..40}; do
    if curl -fsS "$api_url" >/dev/null 2>&1 && curl -fsS "$web_url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  echo "Health checks did not complete. Check $LOG_DIR/api.log and $LOG_DIR/web.log." >&2
  return 1
}

run_supervisor() {
  mkdir -p "$LOG_DIR" "$DATA_DIR"
  trap 'handle_signal TERM' TERM
  trap 'handle_signal INT' INT
  trap 'handle_signal HUP' HUP
  trap shutdown_children EXIT
  echo "$$" > "$SUPERVISOR_PID_FILE"

  local api_pid web_pid
  api_pid="$(
    start_managed_child "$API_PID_FILE" "$LOG_DIR/api.log" \
      NODE_ENV=production \
      APPLICATION_NAME="$APPLICATION_NAME-api" \
      INSTANCE_NAME="$INSTANCE_NAME" \
      AUTOMATIC_STARTUP=disabled \
      HOST="$API_HOST" \
      PORT="$API_PORT" \
      FLASHCARDS_DATA_DIR="$DATA_DIR" \
      "${PNPM_CMD[@]}" --filter @workspace/api-server run start
  )"
  web_pid="$(
    start_managed_child "$WEB_PID_FILE" "$LOG_DIR/web.log" \
      NODE_ENV=production \
      WEB_HOST="$WEB_HOST" \
      WEB_PORT="$WEB_PORT" \
      API_HOST="$API_HOST" \
      API_PORT="$API_PORT" \
      BASE_PATH=/ \
      "${PNPM_CMD[@]}" --filter @workspace/picture-flashcards run serve
  )"

  echo "Application: $APPLICATION_NAME"
  echo "Instance: $INSTANCE_NAME"
  echo "Supervisor PID: $$"
  echo "Primary listener: $WEB_HOST:$WEB_PORT"
  echo "Additional listener: $API_HOST:$API_PORT (local API proxy)"
  echo "Automatic startup: disabled"
  echo "Data: $DATA_DIR"
  echo "Logs: $LOG_DIR"

  wait_for_health || exit 1
  echo "Health checks passed."

  while pid_is_running "$api_pid" && pid_is_running "$web_pid"; do
    sleep 1
  done
  echo "A managed service stopped unexpectedly; stopping its sibling." >&2
  exit 1
}

show_status() {
  print_effective_config
  echo
  if supervisor_is_running; then
    echo "Supervisor: running (PID $(supervisor_pid))"
  else
    echo "Supervisor: stopped"
  fi
  for name_pid in "api:$API_PID_FILE" "web:$WEB_PID_FILE"; do
    local name="${name_pid%%:*}"
    local file="${name_pid#*:}"
    local pid="$(cat "$file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && pid_is_running "$pid"; then
      echo "$name process: running (PID $pid)"
    else
      echo "$name process: stopped"
    fi
  done
  echo "Web listener:"
  port_owner "$WEB_PORT"
  echo "API listener:"
  port_owner "$API_PORT"
}

check_ports() {
  fail_if_port_in_use "web" "$WEB_HOST" "$WEB_PORT" || return 1
  fail_if_port_in_use "api" "$API_HOST" "$API_PORT" || return 1
  echo "No configured port is occupied."
}

main() {
  parse_args "$@"
  choose_config

  case "$COMMAND" in
    print)
      print_effective_config
      ;;
    check)
      print_effective_config
      check_ports
      ;;
    status)
      show_status
      ;;
    logs)
      for log in "$LOG_DIR/api.log" "$LOG_DIR/web.log"; do
        [[ -f "$log" ]] && { echo "### $log"; tail -n 80 "$log"; }
      done
      ;;
    stop)
      stop_owned_supervisor
      ;;
    install)
      ensure_runtime
      if supervisor_is_running; then
        if [[ "$RESTART_OWNED" == true ]]; then
          stop_owned_supervisor
        else
          fail "This application is already running. Use --restart-owned only when restarting this application's own supervisor."
        fi
      fi
      check_ports
      write_config
      install_dependencies_and_build
      run_supervisor
      ;;
  esac
}

main "$@"