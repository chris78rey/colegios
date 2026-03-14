#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

info "Reiniciando stack"
compose down
compose up -d --build
compose ps
