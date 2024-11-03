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
echo "# Before"
cat "$CONFIG_FILE"
TMP_FILE="$(mktemp)"
cat "$CONFIG_FILE" | awk '
  BEGIN { FS = "[[:space:]]*=[[:space:]]*"; }
  !done {
    if (match($0, /^[[][^]]*[]]/)) {
      section = substr($0, RSTART + 1, RLENGTH - 2);
      if (current_section == "instrumentation") {
        done = 1;
        print "prometheus = true";
        if (blanks != "") print substr(blanks, 2, length(blanks) - 1);
      }
      current_section = section;
    } else if (current_section == "instrumentation") {
      if ($1 == "prometheus" && NF > 1) {
        done = 1;
        if (!match($2, /^true([[:space:]]|$)/)) {
          if (blanks != "") print substr(blanks, 2, length(blanks) - 1);
          print "prometheus = true";
          next;
        }
      } else if (match($0, /^[[:space:]]*(#.*)?$/)) {
        blanks = blanks "\n" $0;
        next;
      }
    }
  }
  1
  END {
    if (done) {
      # noop
    } else if (current_section == "instrumentation") {
      print "prometheus = true";
    } else {
      print "";
      print "[instrumentation]";
      print "prometheus = true";
      }
  }
' > "$TMP_FILE"
echo "# Diff"
diff -u "$CONFIG_FILE" "$TMP_FILE" || true
cat "$TMP_FILE" > "$CONFIG_FILE" # redirection preserves file permissions
killAgd
startAgd
waitForBlock 3
set -v
# https://prometheus.io/docs/instrumenting/exposition_formats/
curl -sSL http://localhost:26660/metrics \
  | grep -E '^[[:space:]]*#[[:space:]]*(HELP|TYPE)\b' || true
