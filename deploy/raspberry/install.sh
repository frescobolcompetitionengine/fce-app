#!/usr/bin/env bash
set -euo pipefail

APP_NAME="fce-app"
SERVICE_NAME="fce-app.service"
PROJECT_DIR="${PROJECT_DIR:-/opt/fce-app}"
SERVICE_SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_SOURCE_PATH="${SERVICE_SOURCE_DIR}/${SERVICE_NAME}"
SERVICE_TARGET_PATH="/etc/systemd/system/${SERVICE_NAME}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"

if [[ -z "${NODE_BIN}" || -z "${NPM_BIN}" ]]; then
  echo "Node.js and npm are required." >&2
  exit 1
fi

if [[ ! -d "${PROJECT_DIR}" ]]; then
  echo "Project directory not found: ${PROJECT_DIR}" >&2
  exit 1
fi

cd "${PROJECT_DIR}"

echo "[1/5] Installing dependencies..."
"${NPM_BIN}" install

echo "[2/5] Building frontend..."
"${NPM_BIN}" run build

echo "[3/5] Installing systemd service..."
if [[ ! -f "${SERVICE_SOURCE_PATH}" ]]; then
  echo "Service template not found: ${SERVICE_SOURCE_PATH}" >&2
  exit 1
fi

sudo install -m 644 "${SERVICE_SOURCE_PATH}" "${SERVICE_TARGET_PATH}"

echo "[4/5] Reloading systemd..."
sudo systemctl daemon-reload
sudo systemctl enable "${APP_NAME}"

echo "[5/5] Starting service..."
sudo systemctl restart "${APP_NAME}"
sudo systemctl status "${APP_NAME}" --no-pager || true

echo
echo "Installation complete."
echo "Open the app on the Raspberry Pi at http://<pi-ip>:8787/"
