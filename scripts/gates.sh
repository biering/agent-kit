#!/usr/bin/env bash
# Local check before a PR: the public-content scan and the unit tests.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/check-public.mjs
npm test
