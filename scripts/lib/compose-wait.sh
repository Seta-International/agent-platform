#!/usr/bin/env bash
# Poll `docker compose ps` until a named service reaches a target state
# (healthy | running | exited:0). Exit 0 on success, 1 on timeout.
# Usage: compose-wait <compose-file> <service> <state> <timeout-seconds>
set -euo pipefail

compose_file="$1"
service="$2"
target="$3"
timeout="${4:-120}"

deadline=$(( $(date +%s) + timeout ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  case "$target" in
    healthy)
      status=$(docker compose -f "$compose_file" ps --format json "$service" \
        | sed -n 's/.*"Health":"\([^"]*\)".*/\1/p' | head -1)
      [ "$status" = "healthy" ] && exit 0
      ;;
    running)
      status=$(docker compose -f "$compose_file" ps --format json "$service" \
        | sed -n 's/.*"State":"\([^"]*\)".*/\1/p' | head -1)
      [ "$status" = "running" ] && exit 0
      ;;
    exited:0)
      status=$(docker compose -f "$compose_file" ps --all --format json "$service" \
        | sed -n 's/.*"ExitCode":\([0-9]*\).*/\1/p' | head -1)
      [ "$status" = "0" ] && exit 0
      ;;
    *)
      echo "compose-wait: unknown target state '$target'" >&2; exit 2;;
  esac
  sleep 2
done
echo "compose-wait: timeout waiting for $service to reach $target" >&2
exit 1
