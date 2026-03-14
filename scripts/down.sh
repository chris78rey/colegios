#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

info "Apagando stack"
compose down
info "Stack detenido"
