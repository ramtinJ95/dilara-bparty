#!/bin/sh
# Rebuilds the self-hosted fonts in src/client/fonts from the Fontsource packages: Archivo Black and Space Grotesk,
# cut down to the characters the app uses (ASCII, Swedish å ä ö, a few accents and punctuation) and to weights 500-700.
# Needs fonttools with brotli (Debian: apt install fonttools python3-brotli). Keep UNICODES in step with the unicode-range in fonts.css.
set -eu
cd "$(dirname "$0")/.."
out=src/client/fonts
UNICODES="U+0020-007E,U+00A0,U+00B7,U+00C4-00C5,U+00C9,U+00D6,U+00D7,U+00DC,U+00E4-00E5,U+00E9,U+00F6,U+00FC,U+2013-2014,U+2019,U+201D,U+2026,U+2212"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

(cd "$tmp" && npm pack --silent @fontsource/archivo-black@5.3.0 @fontsource-variable/space-grotesk@5.3.0 >/dev/null)
for pkg in "$tmp"/*.tgz; do
  dir="${pkg%.tgz}"
  mkdir "$dir"
  tar -xzf "$pkg" -C "$dir"
done
archivo="$tmp/fontsource-archivo-black-5.3.0/package"
grotesk="$tmp/fontsource-variable-space-grotesk-5.3.0/package"

pyftsubset "$archivo/files/archivo-black-latin-400-normal.woff2" --unicodes="$UNICODES" --layout-features=kern --flavor=woff2 \
  --output-file="$out/archivo-black.woff2"
fonttools varLib.instancer "$grotesk/files/space-grotesk-latin-wght-normal.woff2" wght=500:700 -q -o "$tmp/grotesk.ttf"
pyftsubset "$tmp/grotesk.ttf" --unicodes="$UNICODES" --layout-features=kern,tnum --flavor=woff2 --output-file="$out/space-grotesk.woff2"
cp "$archivo/LICENSE" "$out/OFL-archivo-black.txt"
cp "$grotesk/LICENSE" "$out/OFL-space-grotesk.txt"
ls -l "$out"
