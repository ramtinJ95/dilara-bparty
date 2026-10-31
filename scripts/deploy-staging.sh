#!/bin/sh
# Deploys the staging Worker from the person's Mac, with its secrets from the macOS Keychain (service dilara-bparty-staging).
# Extra arguments go to wrangler deploy, for example --dry-run.
set -eu
# Tracing would print the secrets, and an exported JOIN_SECRET or ADMIN_SECRET would reach the build and wrangler.
set +x
unset JOIN_SECRET ADMIN_SECRET
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false

# The Vite plugin copies dev values into dist/<env>/.dev.vars for vite preview: from .dev.vars.staging, else .dev.vars,
# plus any required secret in the environment. An empty .dev.vars.staging and a clean environment keep them all out.
[ -e .dev.vars.staging ] || : > .dev.vars.staging
rm -rf dist
CLOUDFLARE_ENV=staging npx vite build
leaked=$(find dist -name '.dev.vars*')
if [ -n "$leaked" ]; then
  echo "Refusing to deploy: the build wrote $leaked. Empty .dev.vars.staging and unset JOIN_SECRET and ADMIN_SECRET." >&2
  exit 1
fi

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT INT TERM
umask 077
keychain() {
  value=$(security find-generic-password -s dilara-bparty-staging -a "$1" -w)
  case "$value" in
    "" | *[!A-Za-z0-9_-]*) echo "The Keychain value for $1 must be URL-safe (letters, digits, - and _)." >&2; exit 1 ;;
  esac
  printf '%s' "$value"
}
join=$(keychain JOIN_SECRET)
admin=$(keychain ADMIN_SECRET)
printf '{"JOIN_SECRET":"%s","ADMIN_SECRET":"%s"}\n' "$join" "$admin" > "$dir/secrets.json"
unset join admin value
npx wrangler deploy --secrets-file "$dir/secrets.json" "$@"
