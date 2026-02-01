#!/usr/bin/env bash
set -e


rm -rf node_modules dist package-lock.json
npm install
npx electron-builder --linux --x64