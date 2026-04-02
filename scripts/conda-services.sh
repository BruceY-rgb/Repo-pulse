#!/usr/bin/env bash
set -euo pipefail

COMMAND="${1:-}"

if [[ -z "$COMMAND" ]]; then
  echo "Usage: $0 {start|stop|status}"
  exit 1
fi

if ! command -v conda >/dev/null 2>&1; then
  echo "Error: conda is not installed or not in PATH"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_NAME="${CONDA_ENV_NAME:-repo-pulse}"
DEV_DIR="$REPO_ROOT/.dev-services"
PGDATA="$DEV_DIR/postgres"
PGLOG="$DEV_DIR/postgres.log"
REDIS_DIR="$DEV_DIR/redis"
REDIS_LOG="$DEV_DIR/redis.log"
REDIS_PID="$DEV_DIR/redis.pid"
PG_PORT="${PG_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-repo_pulse}"

run_in_env() {
  conda run -n "$ENV_NAME" --no-capture-output "$@"
}

ensure_env_has_bins() {
  run_in_env sh -lc 'command -v pg_ctl >/dev/null 2>&1 && command -v initdb >/dev/null 2>&1 && command -v redis-server >/dev/null 2>&1 && command -v redis-cli >/dev/null 2>&1'
}

start_postgres() {
  mkdir -p "$PGDATA"

  if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
    echo "Initializing PostgreSQL data directory..."
    run_in_env initdb -D "$PGDATA" -U "$POSTGRES_USER" >/dev/null
  fi

  if run_in_env pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    echo "PostgreSQL is already running on port $PG_PORT"
  else
    echo "Starting PostgreSQL on port $PG_PORT..."
    run_in_env pg_ctl -D "$PGDATA" -l "$PGLOG" -o "-p $PG_PORT" start >/dev/null
  fi

  echo "Configuring PostgreSQL role/database..."
  run_in_env sh -lc "psql -h localhost -p $PG_PORT -U $POSTGRES_USER -d postgres -v ON_ERROR_STOP=1 -c \"ALTER USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';\" >/dev/null"
  run_in_env sh -lc "createdb -h localhost -p $PG_PORT -U $POSTGRES_USER $POSTGRES_DB 2>/dev/null || true"
}

start_redis() {
  mkdir -p "$REDIS_DIR"

  if run_in_env redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1; then
    echo "Redis is already running on port $REDIS_PORT"
    return
  fi

  echo "Starting Redis on port $REDIS_PORT..."
  run_in_env redis-server \
    --daemonize yes \
    --port "$REDIS_PORT" \
    --dir "$REDIS_DIR" \
    --logfile "$REDIS_LOG" \
    --pidfile "$REDIS_PID"
}

status_postgres() {
  if run_in_env pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    echo "PostgreSQL: running (port $PG_PORT)"
  else
    echo "PostgreSQL: stopped"
  fi
}

status_redis() {
  if run_in_env redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1; then
    echo "Redis: running (port $REDIS_PORT)"
  else
    echo "Redis: stopped"
  fi
}

stop_postgres() {
  if run_in_env pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    echo "Stopping PostgreSQL..."
    run_in_env pg_ctl -D "$PGDATA" stop -m fast >/dev/null
  else
    echo "PostgreSQL already stopped"
  fi
}

stop_redis() {
  if [[ -f "$REDIS_PID" ]]; then
    local redis_pid
    redis_pid="$(cat "$REDIS_PID" 2>/dev/null || true)"
    if [[ -n "$redis_pid" ]] && kill -0 "$redis_pid" 2>/dev/null; then
      echo "Stopping Redis..."
      kill "$redis_pid"
      rm -f "$REDIS_PID"
      return
    fi
  fi

  if run_in_env redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1; then
    echo "Stopping Redis via redis-cli..."
    run_in_env redis-cli -p "$REDIS_PORT" shutdown NOSAVE || true
  else
    echo "Redis already stopped"
  fi
}

print_summary() {
  echo "---"
  echo "Environment: $ENV_NAME"
  echo "Repo: $REPO_ROOT"
  echo "PostgreSQL data: $PGDATA"
  echo "Redis data: $REDIS_DIR"
}

ensure_env_has_bins || {
  echo "Error: required binaries are missing in conda env '$ENV_NAME'."
  echo "Install with: conda install -n $ENV_NAME -c conda-forge postgresql redis"
  exit 1
}

case "$COMMAND" in
  start)
    start_postgres
    start_redis
    status_postgres
    status_redis
    print_summary
    ;;
  stop)
    stop_redis
    stop_postgres
    status_postgres
    status_redis
    ;;
  status)
    status_postgres
    status_redis
    print_summary
    ;;
  *)
    echo "Unknown command: $COMMAND"
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
