#!/bin/bash
set -ueo pipefail

# Place here any actions that should happen after the upgrade has executed. The
# actions are executed in the upgraded chain software and the effects are
# persisted in the generated image for the upgrade, so they can be used in
# later steps, such as the "test" step, or further proposal layers.

# Enable Prometheus metrics.
# https://github.com/tendermint/tendermint/blob/master/docs/nodes/metrics.md
CONFIG_FILE="$HOME/.agoric/config/config.toml"
echo "Enabling Prometheus in $CONFIG_FILE ..."
cat "$CONFIG_FILE" | awk 'BEGIN { print "# Before"; } 1'
TMP_FILE="$(mktemp)"
cp "$CONFIG_FILE" "$TMP_FILE"
cat "$TMP_FILE" | awk '
  BEGIN { print "# After"; }
  BEGIN { FS = "[[:space:]]*=[[:space:]]*"; }
  !done {
    if (match($0, /^[[][^]]*[]]/)) {
      section = substr($0, RSTART + 1, RLENGTH - 2);
      if (current_section == "telemetry") {
        done = 1;
        print "enabled = true";
        if (blanks != "") print substr(blanks, 2, length(blanks) - 1);
      }
      current_section = section;
    } else if (current_section == "telemetry") {
      if ($1 == "enabled" && NF > 1) {
        done = 1;
        if (!match($2, /^true([[:space:]]|$)/)) {
          print "enabled = true";
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
    } else if (current_section == "telemetry") {
      print "enabled = true";
    } else {
      print "";
      print "[telemetry]";
      print "enabled = true";
      }
  }
' | tee "$CONFIG_FILE"
rm -v "$TMP_FILE"
