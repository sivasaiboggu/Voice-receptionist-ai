#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/pip install -q -r backend/requirements.txt
cp -n .env.example .env || true
echo "Setup done. Run: .venv/bin/python -m backend.app.main demo"
