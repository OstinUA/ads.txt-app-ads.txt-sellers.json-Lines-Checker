#!/usr/bin/env bash
set -euo pipefail

if [ ! -d src ]; then
  echo "No src/ directory found. Structure already flattened."
  exit 0
fi

for dir in background content shared ui assets; do
  if [ -d "src/$dir" ]; then
    mv "src/$dir" "./$dir"
  fi
done

rmdir src 2>/dev/null || true

echo "Migration complete. Verify manifest paths and workflow checks use root-level folders."
