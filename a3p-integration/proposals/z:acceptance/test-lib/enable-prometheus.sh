#!/bin/bash
# Usage: $0 [-b|--backup] /path/to/app.toml
# Perform in-place mutation of a app.toml file to enable Prometheus metrics,
# optionally emitting the path to a backup of the original.
# https://github.com/agoric-labs/cosmos-sdk/blob/Agoric/docs/core/telemetry.md
# https://github.com/cosmos/cosmos-sdk/blob/main/docs/learn/advanced/09-telemetry.md

set -ueo pipefail

backup=
if [ "$1" = '-b' -o "$1" = '--backup' ]; then
  backup=1
  shift
fi
src="$1"

tmp="$(mktemp "$(basename "$src").XXXXXXXXXX.bak")"
cp "$src" "$tmp"
# redirection preserves file permissions
cat "$tmp" | awk > "$src" '
  BEGIN {
    FS = "[[:space:]]*[=#][[:space:]]*"; # split on `=`/`#` with optional whitespace
    enableApi = "enable = true";
    enableTelemetry = "enabled = true";
    retainTelemetry = "prometheus-retention-time = 3600 # 60 minutes";
  }
  enableApi || enableTelemetry || retainTelemetry {
    if (match($0, /^[[][^]]*[]]/)) {
      # New section; append to the previous one if warranted.
      section = substr($0, RSTART + 1, RLENGTH - 2);
      if (current_section == "api") {
        finishApi();
      } else if (current_section == "telemetry") {
        finishTelemetry();
      }
      current_section = section;
    } else if (current_section == "api") {
      if ($1 == "enable") {
        tmp = enableApi;
        enableApi = "";
        if ($2 != "true") {
          flushBuffer(tmp);
          next;
        }
      } else if (maybeBuffer($0)) {
        next;
      }
    } else if (current_section == "telemetry") {
      if ($1 == "enabled") {
        tmp = enableTelemetry;
        enableTelemetry = "";
        if ($2 != "true") {
          flushBuffer(tmp);
          next;
        }
      } else if ($1 == "prometheus-retention-time") {
        tmp = retainTelemetry;
        retainTelemetry = "";
        # Preserve a simple decimal integer >= 3600, but no other variants.
        # https://toml.io/en/v1.0.0#integer
        if (!(match($2, /^[1-9][0-9]*$/) && $2 >= 3600)) {
          flushBuffer(tmp);
          next;
        }
      } else if (maybeBuffer($0)) {
        next;
      }
    }
  }
  {
    flushBuffer();
    print;
  }
  END {
    if (current_section == "api") {
      finishApi();
    } else if (current_section == "telemetry") {
      finishTelemetry();
    }

    if (enableApi) finishApi("[api]");
    if (enableTelemetry || retainTelemetry) finishTelemetry("[telemetry]");
  }

  function finishApi(heading) {
    if (heading) print "\n" heading;
    if (enableApi) print enableApi;
    enableApi = "";
    flushBuffer();
  }

  function finishTelemetry(heading) {
    if (heading) print "\n" heading;
    if (enableTelemetry) print enableTelemetry;
    if (retainTelemetry) print retainTelemetry;
    enableTelemetry = retainTelemetry = "";
    flushBuffer();
  }

  function maybeBuffer(line) {
    if (match(line, /^[[:space:]]*(#.*)?$/)) {
      buf = buf "\n" $0;
      return 1;
    }
  }

  function flushBuffer(extra) {
    if (buf != "") print substr(buf, 2, length(buf) - 1);
    buf = "";
    if (extra) print extra;
  }
'

if [ "$backup" = 1 ]; then
  echo "$tmp"
else
  rm -fr -- "$tmp"
fi
