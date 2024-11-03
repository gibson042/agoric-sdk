#!/bin/bash
# Usage: $0 [-b|--backup] /path/to/config.toml
# Perform in-place mutation of a config.toml file to enable Prometheus metrics,
# optionally emitting the path to a backup of the original.
# https://github.com/cometbft/cometbft/blob/main/docs/explanation/core/metrics.md

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
cat "$tmp" | awk >"$src" '
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
'

if [ "$backup" = 1 ]; then
  echo "$tmp"
else
  rm -fr -- "$tmp"
fi
