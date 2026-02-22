#!/usr/bin/env bash
set -e

RM_STUFF="rm -rf node_modules dist package-lock.json"
UPDATE_NPM="npm install -g npm@11.10.1"
ELECTRON_BUILDER="npx electron-builder --win --x64"

docker run --rm -ti \
  --env ELECTRON_CACHE="/project/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/project/.cache/electron-builder" \
  -v "${PWD}":/project \
  electronuserland/builder:wine sh -c "cd /project && ${UPDATE_NPM} && ${RM_STUFF} && npm install && ${ELECTRON_BUILDER}"

sudo chown -R $(id -u):$(id -g) dist node_modules .cache package-lock.json
sudo chown -R $(id -u):$(id -g) yarn.lock
