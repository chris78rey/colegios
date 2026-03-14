#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

info "Levantando stack en segundo plano"
compose up -d --build
info "Stack iniciado"
compose ps
