#!/usr/bin/env bash
set -euo pipefail

# Downloads Android arm64 Libretro cores from the official buildbot. These files
# are intentionally not committed: MAME alone exceeds GitHub's single-file limit.
# Review THIRD_PARTY_NOTICES.md before distributing any built APK.
ABI="${1:-arm64-v8a}"
TARGET="modules/moudie-emulator/android/src/main/jniLibs/${ABI}"
BASE_URL="https://buildbot.libretro.com/nightly/android/latest/${ABI}"

if [[ "${ABI}" != "arm64-v8a" ]]; then
  echo "This project currently bundles verified prebuilt cores for arm64-v8a only." >&2
  exit 2
fi

mkdir -p "${TARGET}"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

fetch_core() {
  local remote_name="$1"
  local local_name="$2"
  local archive="${TEMP_DIR}/${local_name}.zip"
  echo "Downloading ${remote_name}…"
  curl --fail --location --retry 3 --retry-delay 2 \
    -o "${archive}" "${BASE_URL}/${remote_name}_libretro_android.so.zip"
  unzip -p "${archive}" "${remote_name}_libretro_android.so" > "${TARGET}/${local_name}_libretro_android.so"
  test -s "${TARGET}/${local_name}_libretro_android.so"
}

fetch_core fceumm fceumm
fetch_core pcsx_rearmed pcsx_rearmed
fetch_core genesis_plus_gx genesis_plus_gx
fetch_core ppsspp ppsspp

# Arcade uses its dedicated first-launch download path. Set INCLUDE_MAME=1 only for
# an intentionally large offline bundle.
if [[ "${INCLUDE_MAME:-0}" == "1" ]]; then
  fetch_core mamearcade mamearcade
fi

echo "Installed Libretro cores in ${TARGET}."
