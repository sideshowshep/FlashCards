#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APPLICATION_NAME="picture-flashcards"
RUNTIME_DIR="$APP_ROOT/.picture-flashcards-runtime"
LOG_DIR="$RUNTIME_DIR/logs"
SUPERVISOR_PID_FILE="$RUNTIME_DIR/supervisor.pid"
APP_PID_FILE="$RUNTIME_DIR/app.pid"
DATA_DIR="/var/lib/picture-flashcards"
CONFIG_FILE="$DATA_DIR/picture-flashcards.env"
LEGACY_CONFIG_FILE="$APP_ROOT/.picture-flashcards.local.env"
LEGACY_DATA_DIR="$APP_ROOT/.picture-flashcards-data"
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

run_timed() {
  local label="$1"
  local duration="$2"
  local status
  shift 2
  echo "Picture Flashcards: $label (timeout: ${duration}s)"
  if timeout --kill-after=30 "$duration" "$@"; then
    return 0
  else
    status=$?
  fi
  if (( status == 124 )); then
    echo "Picture Flashcards: timed out during $label after ${duration}s." >&2
  else
    echo "Picture Flashcards: $label failed with exit code $status." >&2
  fi
  return "$status"
}

usage() {
  cat <<'EOF'
Usage:
  ./install.sh [options]

Install and prepare Picture Flashcards. Installation builds the production app
and enables its systemd service, but does not start it. Use ./start.sh to start.
The Express server serves both the frontend and /api from one listener.

Options:
  --port PORT, --app-port PORT, --web-port PORT
  --host HOST, --web-host HOST
  --instance NAME
  --use-saved-config       Reuse the saved configuration.
  --restart-owned          Stop this app's own supervisor before rebuilding.
  --install-service        Compatibility option; enable the systemd service.
  --uninstall-service      Disable and remove the systemd service.
  --service                Internal systemd foreground service mode.
  --start                  Internal start.sh entry point.
  --print-effective-config Print configuration and exit.
  --check                  Validate configuration and port ownership, then exit.
  --status                 Show this app's process and listener status.
  --logs                   Show the most recent application logs.
  --stop                   Stop this application's managed processes.
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
  local pid="$1"
  local state
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  [[ -r "/proc/$pid/stat" ]] || return 0
  state="$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null || true)"
  [[ "$state" != "Z" && "$state" != "X" ]]
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
  local source="$CONFIG_FILE"
  [[ -f "$source" ]] || source="$LEGACY_CONFIG_FILE"
  [[ -f "$source" ]] || return 0

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
      *) ;;
    esac
  done < "$source"
}

saved_config_exists() {
  [[ -f "$CONFIG_FILE" || -f "$LEGACY_CONFIG_FILE" ]]
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
      --start)
        COMMAND="start"
        shift
        ;;
      --no-start)
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

  if [[ "$COMMAND" == "service" ]] && ! saved_config_exists; then
    fail "Cannot run the systemd service: no saved configuration exists. Run ./install.sh --port PORT --install-service first."
  fi

  if [[ "$USE_SAVED_CONFIG" == true ]] && ! saved_config_exists; then
    fail "No saved configuration exists. Run ./install.sh first."
  fi

  PORT="${CLI_PORT:-${ENV_PORT:-${SAVED_PORT:-}}}"
  if [[ -z "$PORT" ]]; then
    PORT="$DEFAULT_PORT"
    [[ "$COMMAND" == "install" ]] && echo "No port was configured; using application port $PORT."
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

  if command -v corepack >/dev/null 2>&1; then
    PNPM_CMD=(corepack pnpm)
  elif command -v pnpm >/dev/null 2>&1; then
    PNPM_CMD=(pnpm)
  elif command -v npm >/dev/null 2>&1; then
    echo "Installing the lockfile-pinned pnpm version..."
    run_timed "installing pinned pnpm" 1800 privileged_run npm install --global pnpm@10.26.1
    PNPM_CMD=(pnpm)
  else
    fail "npm, pnpm, or Corepack is required."
  fi
}

systemd_run() {
  if (( EUID == 0 )); then
    run_timed "systemctl $*" 120 systemctl "$@"
    return
  fi
  command -v sudo >/dev/null 2>&1 || fail "sudo is required to manage $SERVICE_NAME."
  run_timed "systemctl $*" 120 sudo systemctl "$@"
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

apt_run() {
  if (( EUID == 0 )); then
    run_timed "apt-get $*" 1800 env DEBIAN_FRONTEND=noninteractive apt-get "$@"
  else
    command -v sudo >/dev/null 2>&1 || fail "sudo is required to install system packages."
    run_timed "apt-get $*" 1800 sudo env DEBIAN_FRONTEND=noninteractive apt-get "$@"
  fi
}

prepare_system_toolchain() {
  [[ -r /etc/os-release ]] || fail "Cannot identify this Linux distribution."
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ "${ID:-}" == debian || "${ID:-}" == ubuntu || "${ID:-}" == raspbian ]] \
    || fail "The installer supports Debian, Ubuntu, and Raspberry Pi OS. Found: ${PRETTY_NAME:-unknown}."
  command -v apt-get >/dev/null 2>&1 \
    || fail "apt-get is required on supported Debian-family systems."

  echo "Installing required Debian-family system tools..."
  apt_run update
  apt_run install -y ca-certificates curl gnupg git build-essential python3 iproute2 lsof

  local node_major=0
  if command -v node >/dev/null 2>&1; then
    node_major="$(node -p 'process.versions.node.split(".")[0]')"
  fi
  if (( node_major < 20 )); then
    echo "Installing Node.js 22 from the signed NodeSource apt repository..."
    local key_source keyring_source repo_source architecture
    key_source="$(mktemp)"
    keyring_source="$(mktemp)"
    repo_source="$(mktemp)"
    curl --connect-timeout 20 --max-time 120 -fsSL \
      https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$key_source"
    gpg --dearmor < "$key_source" > "$keyring_source"
    privileged_run install -d -m 0755 /etc/apt/keyrings
    privileged_run install -m 0644 "$keyring_source" /etc/apt/keyrings/nodesource.gpg
    architecture="$(dpkg --print-architecture)"
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main\n' \
      "$architecture" > "$repo_source"
    privileged_run install -m 0644 "$repo_source" /etc/apt/sources.list.d/nodesource.list
    rm -f "$key_source" "$keyring_source" "$repo_source"
    apt_run update
    apt_run install -y nodejs
  fi
}

systemd_service_enabled() {
  systemd_available && systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null
}

systemd_service_active() {
  systemd_available && systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null
}

require_systemd() {
  systemd_available || fail "systemctl is required for --install-service."
  [[ -d /run/systemd/system ]] \
    || fail "systemd is not running on this device; run --install-service on the Raspberry Pi."
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
  local temp_file="$CONFIG_FILE.tmp.$$"
  if [[ -f "$CONFIG_FILE" ]]; then
    awk -v port="$PORT" -v host="$HOST" -v instance="$INSTANCE_NAME" '
      BEGIN { seen_port=0; seen_app_port=0; seen_host=0; seen_instance=0 }
      /^PORT=/ { if (!seen_port++) print "PORT=" port; next }
      /^APP_PORT=/ { if (!seen_app_port++) print "APP_PORT=" port; next }
      /^HOST=/ { if (!seen_host++) print "HOST=" host; next }
      /^INSTANCE_NAME=/ { if (!seen_instance++) print "INSTANCE_NAME=" instance; next }
      { print }
      END {
        if (!seen_port) print "PORT=" port
        if (!seen_app_port) print "APP_PORT=" port
        if (!seen_host) print "HOST=" host
        if (!seen_instance) print "INSTANCE_NAME=" instance
      }
    ' "$CONFIG_FILE" > "$temp_file"
  else
    cat > "$temp_file" <<EOF
# Generated by install.sh. Local environment values are preserved on updates.
PORT=$PORT
APP_PORT=$PORT
HOST=$HOST
INSTANCE_NAME=$INSTANCE_NAME
EOF
  fi
  chmod 0600 "$temp_file"
  mv -f "$temp_file" "$CONFIG_FILE"
}

prepare_persistent_storage() {
  local storage_user="${SUDO_USER:-$(id -un)}"
  local storage_group
  storage_group="$(id -gn "$storage_user")"
  privileged_run install -d -o "$storage_user" -g "$storage_group" -m 0750 "$DATA_DIR"

  if [[ ! -f "$CONFIG_FILE" && -f "$LEGACY_CONFIG_FILE" ]]; then
    cp -p "$LEGACY_CONFIG_FILE" "$CONFIG_FILE"
  fi

  bash "$APP_ROOT/scripts/migrate-persistent-data.sh" "$LEGACY_DATA_DIR" "$DATA_DIR"
  privileged_run chown -R "$storage_user:$storage_group" "$DATA_DIR"
}

write_systemd_unit() {
  require_systemd

  local service_user="${SUDO_USER:-$(id -un)}"
  local service_group
  local service_path="$PATH"
  [[ "$service_user" =~ ^[A-Za-z0-9._-]+$ ]] \
    || fail "Cannot create $SERVICE_NAME: invalid service user."
  id "$service_user" >/dev/null 2>&1 \
    || fail "Cannot create $SERVICE_NAME: service user does not exist: $service_user"
  service_group="$(id -gn "$service_user")"
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
Environment=PATH=$service_path
Environment=FLASHCARDS_DATA_DIR=$DATA_DIR
Environment=FLASHCARDS_STATIC_DIR=$STATIC_DIR
ExecStart=/bin/bash $APP_ROOT/install.sh --service
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30
KillMode=control-group
SendSIGKILL=yes
FinalKillSignal=SIGKILL

[Install]
WantedBy=multi-user.target
EOF

  command -v systemd-analyze >/dev/null 2>&1 \
    || fail "systemd-analyze is required to validate $SERVICE_NAME."
  systemd-analyze verify "$unit_source" \
    || fail "Generated systemd unit failed validation: $unit_source"

  privileged_run install -o "$service_user" -g "$service_group" -m 0644 \
    "$unit_source" "$SERVICE_FILE"
  rm -f "$unit_source"
}

install_systemd_service() {
  write_systemd_unit
  systemd_run daemon-reload
  systemd_run enable "$SERVICE_NAME"
  echo "Enabled $SERVICE_NAME for boot; installation did not start the application."
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

managed_app_pid() {
  [[ -f "$APP_PID_FILE" ]] || return 1
  cat "$APP_PID_FILE"
}

pid_is_managed_app() {
  local pid="$1"
  local cwd
  local command
  pid_is_running "$pid" || return 1
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  [[ "$cwd" == "$APP_ROOT" || "$cwd" == "$APP_ROOT/artifacts/api-server" ]] \
    || return 1
  command="$(pid_command "$pid")"
  [[ "$command" == *"@workspace/api-server"* ]] \
    || [[ "$command" == *"$APP_ROOT/artifacts/api-server/dist/index.mjs"* ]] \
    || [[ "$command" == *"$APP_ROOT/artifacts/api-server/dist/index.js"* ]] \
    || [[ "$cwd" == "$APP_ROOT/artifacts/api-server" && "$command" == *"dist/index."* ]]
}

stop_orphaned_app() {
  local pid
  pid="$(managed_app_pid 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 0
  if pid_is_running "$pid"; then
    pid_is_managed_app "$pid" \
      || fail "Refusing to stop PID $pid because it is not this application's API process."
    echo "Stopping this application's orphaned API process (PID $pid)."
    stop_process_group "$pid"
  fi
  rm -f "$APP_PID_FILE"
}

listener_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltnpH 2>/dev/null \
      | awk -v wanted=":$PORT" '$4 ~ wanted "$"' \
      | grep -oE 'pid=[0-9]+' \
      | cut -d= -f2 \
      | sort -u
  fi
}

stop_owned_listeners() {
  local pid
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    if pid_is_managed_app "$pid"; then
      echo "Stopping this application's listener process (PID $pid)."
      stop_process_group "$pid"
    else
      local owner_cwd
      local owner_command
      owner_cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || echo unavailable)"
      owner_command="$(pid_command "$pid")"
      echo "Refusing to stop listener PID $pid because it is not owned by this application." >&2
      echo "Listener details: cwd=$owner_cwd command=${owner_command:-unavailable}" >&2
      exit 1
    fi
  done < <(listener_pids)
}

restart_owned_processes() {
  local supervisor
  supervisor="$(supervisor_pid 2>/dev/null || true)"

  if [[ -n "$supervisor" ]]; then
    if [[ "$supervisor" == "$$" ]]; then
      rm -f "$SUPERVISOR_PID_FILE"
    elif pid_belongs_to_app "$supervisor"; then
      stop_owned_supervisor
    elif ! pid_is_running "$supervisor"; then
      rm -f "$SUPERVISOR_PID_FILE"
    elif pid_is_managed_app "$supervisor"; then
      echo "Stopping this application's stale API PID recorded as supervisor (PID $supervisor)."
      stop_process_group "$supervisor"
      rm -f "$SUPERVISOR_PID_FILE"
    else
      fail "Refusing to stop PID $supervisor because it is not owned by this application."
    fi
  fi

  stop_orphaned_app
  stop_owned_listeners
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

stop_application() {
  if systemd_service_active; then
    systemd_run stop "$SERVICE_NAME"
    systemd_service_active && fail "Could not confirm that $SERVICE_NAME stopped."
    restart_owned_processes
    echo "Stopped $APPLICATION_NAME systemd service."
    return 0
  fi
  restart_owned_processes
}

start_systemd_service() {
  [[ -f "$CONFIG_FILE" ]] || fail "No saved installation. Run ./install.sh first."
  [[ -f "$APP_ROOT/artifacts/api-server/dist/index.mjs" ]] \
    || fail "Production API build is missing. Run ./install.sh first."
  [[ -f "$STATIC_DIR/index.html" ]] \
    || fail "Production frontend build is missing. Run ./install.sh first."
  [[ -f "$SERVICE_FILE" ]] || fail "$SERVICE_NAME is not installed. Run ./install.sh first."
  require_systemd
  if systemd_service_active; then
    wait_for_health || fail "$SERVICE_NAME is active but the application is not ready."
    echo "$SERVICE_NAME is already running and healthy."
    return 0
  fi
  restart_owned_processes
  check_port
  systemd_run start "$SERVICE_NAME"
  systemd_service_active || fail "$SERVICE_NAME did not remain active after start."
  wait_for_health || {
    systemd_run stop "$SERVICE_NAME" || true
    fail "The service failed readiness checks. Inspect it with: journalctl -u $SERVICE_NAME"
  }
  echo "Started $SERVICE_NAME and verified application readiness."
}

show_logs() {
  if systemd_service_enabled && command -v journalctl >/dev/null 2>&1; then
    journalctl -u "$SERVICE_NAME" -n 120 --no-pager
    return
  fi
  if [[ -f "$LOG_DIR/app.log" ]]; then
    echo "### $LOG_DIR/app.log"
    tail -n 120 "$LOG_DIR/app.log"
  fi
}

install_dependencies_and_build() {
  cd "$APP_ROOT"
  echo "Installing workspace dependencies locally..."
  run_timed "installing locked workspace dependencies" 3600 "${PNPM_CMD[@]}" install --frozen-lockfile
  echo "Building shared workspace libraries..."
  run_timed "typechecking shared libraries" 1800 "${PNPM_CMD[@]}" run typecheck:libs
  echo "Checking the API and frontend..."
  run_timed "typechecking the API" 1800 "${PNPM_CMD[@]}" --filter @workspace/api-server run typecheck
  run_timed "typechecking the frontend" 1800 "${PNPM_CMD[@]}" --filter @workspace/picture-flashcards run typecheck
  echo "Building the frontend..."
  WEB_PORT="$PORT" WEB_HOST="$HOST" BASE_PATH=/ \
    run_timed "building the frontend" 1800 "${PNPM_CMD[@]}" --filter @workspace/picture-flashcards run build
  echo "Building the API..."
  run_timed "building the API" 1800 "${PNPM_CMD[@]}" --filter @workspace/api-server run build
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

run_systemd_service() {
  mkdir -p "$DATA_DIR"
  exec env \
    NODE_ENV=production \
    APPLICATION_NAME="$APPLICATION_NAME" \
    INSTANCE_NAME="$INSTANCE_NAME" \
    AUTOMATIC_STARTUP=systemd \
    HOST="$HOST" \
    PORT="$PORT" \
    FLASHCARDS_DATA_DIR="$DATA_DIR" \
    FLASHCARDS_STATIC_DIR="$STATIC_DIR" \
    "${PNPM_CMD[@]}" --filter @workspace/api-server run start
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
  echo "Automatic startup: disabled (foreground mode)"
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
  if systemd_service_active; then
    echo "Systemd service: active ($SERVICE_NAME)"
  elif systemd_service_enabled; then
    echo "Systemd service: enabled but inactive ($SERVICE_NAME)"
  else
    echo "Systemd service: not enabled"
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
      show_logs
      ;;
    stop)
      stop_application
      ;;
    start)
      start_systemd_service
      ;;
    service-remove)
      remove_systemd_service
      ;;
    service)
      ensure_runtime
      run_systemd_service
      ;;
    install)
      require_systemd
      prepare_system_toolchain
      ensure_runtime
      if systemd_service_active || systemd_service_enabled; then
        SYSTEMD_WAS_MANAGED=true
        if systemd_service_active; then
          if [[ "$RESTART_OWNED" == true ]]; then
            systemd_run stop "$SERVICE_NAME"
          else
            fail "This application is already running under $SERVICE_NAME. Use --restart-owned only when restarting this application's own service."
          fi
        fi
      fi
      if [[ "$RESTART_OWNED" == true ]]; then
        restart_owned_processes
      elif supervisor_is_running; then
        fail "This application is already running. Use --restart-owned only when restarting this application's own supervisor."
      fi
      check_port
      prepare_persistent_storage
      write_config
      install_dependencies_and_build
      install_systemd_service
      ;;
  esac
}

main "$@"