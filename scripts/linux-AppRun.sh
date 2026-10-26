#!/usr/bin/env bash
set -eu

open_typora_appdir="${APPDIR:-$(dirname -- "$(readlink -f -- "$0")")}"
export PATH="${open_typora_appdir}:${open_typora_appdir}/usr/sbin${PATH:+:${PATH}}"
export XDG_DATA_DIRS="${open_typora_appdir}/usr/share${XDG_DATA_DIRS:+:${XDG_DATA_DIRS}}:/usr/local/share:/usr/share"
export LD_LIBRARY_PATH="${open_typora_appdir}/usr/lib${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"

# Keep Chromium's sandbox enabled. Restricted distributions need an explicit
# application policy; never silently turn off isolation to make startup succeed.
exec "${open_typora_appdir}/open-typora" "$@"
