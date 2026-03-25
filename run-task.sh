#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

case "$1" in
    hq)
        cleanup() {
            jobs -pr | xargs -r kill 2>/dev/null || true
        }
        trap cleanup EXIT INT TERM

        export HQ_TOKEN="$(pwgen 40 1 | tr -d '\n')"
        vite -c vite.config.ts &
        ./run.sh hq server &
        sleep 1
        open "http://localhost:2300/authpairing#token=${HQ_TOKEN}"
        sleep infinity
        ;;
    *)
        exit 1
        ;;
esac
