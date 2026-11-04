#!/usr/bin/env bash
set -eu

markdown_lane_appdir="${APPDIR:-$(dirname -- "$(readlink -f -- "$0")")}"
export PATH="${markdown_lane_appdir}:${markdown_lane_appdir}/usr/sbin${PATH:+:${PATH}}"
export XDG_DATA_DIRS="${markdown_lane_appdir}/usr/share${XDG_DATA_DIRS:+:${XDG_DATA_DIRS}}:/usr/local/share:/usr/share"
export LD_LIBRARY_PATH="${markdown_lane_appdir}/usr/lib${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"

# Keep Chromium's sandbox enabled. Restricted distributions need an explicit
# application policy; never silently turn off isolation to make startup succeed.
exec "${markdown_lane_appdir}/open-markdown-lane" "$@"
