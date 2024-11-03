#!/bin/bash
set -ueo pipefail

source /usr/src/upgrade-test-scripts/env_setup.sh

# Place here any actions that should happen after the upgrade has executed. The
# actions are executed in the upgraded chain software and the effects are
# persisted in the generated image for the upgrade, so they can be used in
# later steps, such as the "test" step, or further proposal layers.

# Enable Prometheus metrics.
# https://github.com/cometbft/cometbft/blob/main/docs/explanation/core/metrics.md
CONFIG_FILE="$HOME/.agoric/config/config.toml"
echo "Enabling Prometheus in $CONFIG_FILE ..."
echo "# Before" && cat "$CONFIG_FILE"
BACKUP_FILE="$(./test-lib/enable-prometheus.sh -k "$CONFIG_FILE")"
echo "# Diff"
diff -u "$BACKUP_FILE" "$CONFIG_FILE" || true
rm -fr -- "$BACKUP_FILE"
killAgd
startAgd
waitForBlock 3
set -v
# https://prometheus.io/docs/instrumenting/exposition_formats/#text-based-format
curl -sSL http://localhost:26660/metrics \
  | grep -E '^[[:space:]]*#[[:space:]]*(HELP|TYPE)\b' || true
