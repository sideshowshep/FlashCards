#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APPLICATION_NAME="picture-flashcards"
CONFIG_FILE="$APP_ROOT/.picture-flashcards.local.env"
RUNTIME_DIR="$APP_ROOT/.picture-flashcards-runtime"
LOG_DIR="$RUNTIME_DIR/logs"
SUPERVISOR_PID_FILE="$RUNTIME_DIR/supervisor.pid"
APP_PID_FILE="$RUNTIME_DIR/app.pid"
DATA_DIR="$APP_ROOT/.picture-flashcards-data"
STATIC_DIR="$APP_ROOT/artifacts/picture-flashcards/dist/public"
SERVICE_NAME="picture-flashcards.service"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME"
DEFAULT_PORT=5016
DEFAULT_HOST=0.0.0.0
USE_SAVED_CONFIG=false
RESTART_OWNED=false
COMMAND="install"
SYSTEMD_ACTION=""
SYSTEMD_WAS_MANAGED=false
SHUTDOWN_STARTED=false

ENV_PORT="${PORT:-${APP_PORT:-${WEB_PORT:-}}}"
ENV_HOST="${HOST:-${WEB_HOST:-}}"
ENV_INSTANCE_NAME="${INSTANCE_NAME:-}"

CLI_PORT=""
CLI_HOST=""
CLI_INSTANCE_NAME=""

fail() {
  echo "Picture Flashcards: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  ./install.sh [options]

Install and run Picture Flashcards. By default this uses a foreground
supervisor; --install-service uses systemd so the app starts after reboot and
restarts after failures. The Express server serves both the frontend and /api
from one listener.

Options:
  --port PORT, --app-port PORT, --web-port PORT
  --host HOST, --web-host HOST
  --instance NAME
  --use-saved-config       Reuse the saved configuration.
  --restart-owned          Stop this app's own supervisor before rebuilding.
  --install-service        Install, enable, and start the systemd service.
  --uninstall-service      Disable and remove the systemd service.
  --service                Internal systemd foreground service mode.
  --print-effective-config Print configuration and exit.
  --check                  Validate configuration and port ownership, then exit.
  --status                 Show this app's process and listener status.
  --logs                   Show the most recent application logs.
  --stop                   Stop this app's own supervisor only.
  --help

Configuration precedence is command line, environment, saved configuration,
then documented defaults. The production app uses one TCP port only.
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
  SAVED_PORT=""
  SAVED_HOST=""
  SAVED_INSTANCE_NAME=""
  [[ -f "$CONFIG_FILE" ]] || return 0

  local key value
  while IFS='=' read -r key value; do
    value="${value%$'\r'}"
    case "$key" in
      PORT|APP_PORT|WEB_PORT) [[ -z "$SAVED_PORT" ]] && SAVED_PORT="$value" ;;
      HOST|WEB_HOST) SAVED_HOST="$value" ;;
      INSTANCE_NAME) SAVED_INSTANCE_NAME="$value" ;;
      API_PORT|API_HOST)
        # Accept the previous two-port config during migration, but do not use it.
        ;;
      ""|\#*) ;;
      *) fail "Unknown setting in $CONFIG_FILE: $key" ;;
    esac
  done < "$CONFIG_FILE"
}

parse_args() {
  while (($#)); do
    case "$1" in
      --port|--app-port|--web-port)
        (($# >= 2)) || fail "$1 requires a port"
        CLI_PORT="$2"
        shift 2
        ;;
      --host|--web-host)
        (($# >= 2)) || fail "$1 requires a host"
        CLI_HOST="$2"
        shift 2
        ;;
      --api-port|--api-host)
        fail "$1 is no longer used: the production app serves the UI and API on one port."
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
      --install-service|--enable-service)
        SYSTEMD_ACTION="install"
        shift
        ;;
      --uninstall-service|--remove-service)
        COMMAND="service-remove"
        shift
        ;;
      --service)
        COMMAND="service"
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

  if [[ "$COMMAND" == "service" && ! -f "$CONFIG_FILE" ]]; then
    fail "Cannot run the systemd service: no saved configuration exists. Run ./install.sh --port PORT --install-service first."
  fi

  if [[ "$USE_SAVED_CONFIG" == true && ! -f "$CONFIG_FILE" ]]; then
    fail "No saved configuration exists. Run ./install.sh first."
  fi

  PORT="${CLI_PORT:-${ENV_PORT:-${SAVED_PORT:-}}}"
  if [[ -z "$PORT" ]]; then
    if [[ "$COMMAND" == "install" && -t 0 ]]; then
      read -r -p "Application port [$DEFAULT_PORT]: " PORT
    else
      PORT="$DEFAULT_PORT"
      [[ "$COMMAND" == "install" ]] && echo "No interactive terminal; using application port $PORT."
    fi
  fi

  HOST="${CLI_HOST:-${ENV_HOST:-${SAVED_HOST:-$DEFAULT_HOST}}}"
  INSTANCE_NAME="${CLI_INSTANCE_NAME:-${ENV_INSTANCE_NAME:-${SAVED_INSTANCE_NAME:-default}}}"

  valid_port "$PORT" || fail "Invalid application port: $PORT"
  valid_host "$HOST" || fail "Invalid application host: $HOST"
  [[ "$INSTANCE_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail "Invalid instance name: $INSTANCE_NAME"
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

systemd_run() {
  if (( EUID == 0 )); then
    systemctl "$@"
    return
  fi
  command -v sudo >/dev/null 2>&1 || fail "sudo is required to manage $SERVICE_NAME."
  sudo systemctl "$@"
}

privileged_run() {
  if (( EUID == 0 )); then
    "$@"
    return
  fi
  command -v sudo >/dev/null 2>&1 || fail "sudo is required to manage $SERVICE_NAME."
  sudo "$@"
}

systemd_available() {
  command -v systemctl >/dev/null 2>&1
}

systemd_service_enabled() {
  systemd_available && systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null
}

systemd_service_active() {
  systemd_available && systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null
}

require_systemd() {
  systemd_available || fail "systemctl is required for --install-service."
  if (( EUID != 0 )); then
    command -v sudo >/dev/null 2>&1 || fail "sudo is required to manage $SERVICE_NAME."
  fi
}

port_owner() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | awk -v wanted=":$PORT" '$4 ~ wanted "$"'
  else
    echo "Listener details unavailable: install lsof or ss for diagnostics." >&2
  fi
}

port_in_use() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk -v wanted=":$PORT" '$4 ~ wanted "$" { found=1 } END { exit !found }'
    return
  fi
  return 1
}

fail_if_port_in_use() {
  if port_in_use; then
    echo "Cannot start $APPLICATION_NAME ($INSTANCE_NAME): port $PORT on $HOST is already occupied." >&2
    port_owner >&2
    echo "Inspect the owner with: lsof -nP -iTCP:$PORT -sTCP:LISTEN" >&2
    echo "Choose another port with: ./install.sh --port PORT" >&2
    return 1
  fi
}

write_config() {
  umask 077
  cat > "$CONFIG_FILE" <<EOF
# Generated by install.sh. Do not add shell commands to this file.
PORT=$PORT
APP_PORT=$PORT
HOST=$HOST
INSTANCE_NAME=$INSTANCE_NAME
EOF
}

write_systemd_unit() {
  require_systemd

  local service_user="${SUDO_USER:-$(id -un)}"
  [[ "$service_user" =~ ^[A-Za-z0-9._-]+$ ]] \
    || fail "Cannot create $SERVICE_NAME: invalid service user."
  id "$service_user" >/dev/null 2>&1 \
    || fail "Cannot create $SERVICE_NAME: service user does not exist: $service_user"
  [[ "$APP_ROOT" != *[[:space:]]* ]] \
    || fail "Cannot create $SERVICE_NAME: the application path contains whitespace."

  mkdir -p "$RUNTIME_DIR"
  local unit_source="$RUNTIME_DIR/$SERVICE_NAME"
  cat > "$unit_source" <<EOF
[Unit]
Description=Picture Flashcards
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$service_user
WorkingDirectory=$APP_ROOT
EnvironmentFile=-$CONFIG_FILE
Environment=NODE_ENV=production
Environment=APPLICATION_NAME=$APPLICATION_NAME
Environment=AUTOMATIC_STARTUP=systemd
Environment=FLASHCARDS_DATA_DIR=$DATA_DIR
Environment=FLASHCARDS_STATIC_DIR=$STATIC_DIR
ExecStart=/bin/bash $APP_ROOT/install.sh --service
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

  privileged_run install -o "$service_user" -g "$service_user" -m 0644 \
    "$unit_source" "$SERVICE_FILE"
  rm -f "$unit_source"
}

install_systemd_service() {
  write_systemd_unit
  systemd_run daemon-reload
  systemd_run enable --now "$SERVICE_NAME"
  echo "Enabled $SERVICE_NAME; it will start after reboot and restart after failures."
}

remove_systemd_service() {
  require_systemd
  if systemd_service_active; then
    systemd_run stop "$SERVICE_NAME"
  fi
  if systemd_service_enabled; then
    systemd_run disable "$SERVICE_NAME"
  fi
  if [[ -e "$SERVICE_FILE" ]]; then
    privileged_run rm -f "$SERVICE_FILE"
    systemd_run daemon-reload
    echo "Removed $SERVICE_NAME."
  else
    echo "$SERVICE_NAME was not installed."
  fi
}

print_effective_config() {
  echo "Application: $APPLICATION_NAME"
  echo "Instance: $INSTANCE_NAME"
  echo "Environment: ${NODE_ENV:-production}"
  echo "Host: $HOST"
  echo "Port: $PORT"
  echo "Listener: $HOST:$PORT"
  echo "Frontend: same listener (/)"
  echo "API: same listener (/api)"
  echo "Static UI directory: $STATIC_DIR"
  echo "Data directory: $DATA_DIR"
  echo "Config file: $CONFIG_FILE"
  echo "Log directory: $LOG_DIR"
  echo "Runtime directory: $RUNTIME_DIR"
  if systemd_service_enabled; then
    echo "Automatic startup: enabled ($SERVICE_NAME)"
  else
    echo "Automatic startup: disabled (run with --install-service to enable systemd)"
  fi
  echo "Health endpoint: http://$HOST:$PORT/api/healthz"
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

shutdown_child() {
  [[ "$SHUTDOWN_STARTED" == true ]] && return 0
  SHUTDOWN_STARTED=true
  stop_process_group "$(cat "$APP_PID_FILE" 2>/dev/null || true)"
  rm -f "$APP_PID_FILE" "$SUPERVISOR_PID_FILE"
}

handle_signal() {
  local signal="$1"
  echo "Received $signal; stopping managed $APPLICATION_NAME process."
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
  echo "Building the frontend..."
  WEB_PORT="$PORT" WEB_HOST="$HOST" BASE_PATH=/ \
    "${PNPM_CMD[@]}" --filter @workspace/picture-flashcards run build
  echo "Building the API..."
  "${PNPM_CMD[@]}" --filter @workspace/api-server run build
}

start_managed_app() {
  setsid env \
    NODE_ENV=production \
    APPLICATION_NAME="$APPLICATION_NAME" \
    INSTANCE_NAME="$INSTANCE_NAME" \
    AUTOMATIC_STARTUP=disabled \
    HOST="$HOST" \
    PORT="$PORT" \
    FLASHCARDS_DATA_DIR="$DATA_DIR" \
    FLASHCARDS_STATIC_DIR="$STATIC_DIR" \
    "${PNPM_CMD[@]}" --filter @workspace/api-server run start \
    > "$LOG_DIR/app.log" 2>&1 &
  local pid=$!
  echo "$pid" > "$APP_PID_FILE"
  echo "$pid"
}

wait_for_health() {
  command -v curl >/dev/null 2>&1 || return 0
  local health_url="http://127.0.0.1:$PORT/api/healthz"
  local web_url="http://127.0.0.1:$PORT/"
  for _ in {1..40}; do
    if curl -fsS "$health_url" >/dev/null 2>&1 && curl -fsS "$web_url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  echo "Health checks did not complete. Check $LOG_DIR/app.log." >&2
  return 1
}

run_supervisor() {
  mkdir -p "$LOG_DIR" "$DATA_DIR"
  trap 'handle_signal TERM' TERM
  trap 'handle_signal INT' INT
  trap 'handle_signal HUP' HUP
  trap shutdown_child EXIT
  echo "$$" > "$SUPERVISOR_PID_FILE"

  local app_pid
  app_pid="$(start_managed_app)"

  echo "Application: $APPLICATION_NAME"
  echo "Instance: $INSTANCE_NAME"
  echo "Supervisor PID: $$"
  echo "Listener: $HOST:$PORT (frontend and API)"
  echo "Automatic startup: disabled"
  echo "Data: $DATA_DIR"
  echo "Static UI: $STATIC_DIR"
  echo "Logs: $LOG_DIR"

  wait_for_health || exit 1
  echo "Health checks passed."

  while pid_is_running "$app_pid"; do
    sleep 1
  done
  echo "The managed application stopped unexpectedly." >&2
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

  local pid
  pid="$(cat "$APP_PID_FILE" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && pid_is_running "$pid"; then
    echo "Application process: running (PID $pid)"
  else
    echo "Application process: stopped"
  fi
  echo "Listener:"
  port_owner
}

check_port() {
  fail_if_port_in_use
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
      check_port
      ;;
    status)
      show_status
      ;;
    logs)
      if [[ -f "$LOG_DIR/app.log" ]]; then
        echo "### $LOG_DIR/app.log"
        tail -n 120 "$LOG_DIR/app.log"
      fi
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
      check_port
      write_config
      install_dependencies_and_build
      run_supervisor
      ;;
  esac
}

main "$@"