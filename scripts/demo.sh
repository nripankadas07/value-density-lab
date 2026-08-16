#!/usr/bin/env bash
set -euo pipefail
npm install
npm test
npm run demo
printf 'Open .demo/index.html to inspect the report.\n'
