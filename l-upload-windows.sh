
VERSION="0.0.5"
NOTES="switched minecraft core library with new maintained library, added image caching, added profile editing and preview & added tabs for preview/cosole toggle, added offline handling for versions, still working on auto-update, made file write/read async"


cd ./test_server
# . .venv/bin/activate

python3.12 upload_fromlocal.py "dist/TURKUAZZMC-${VERSION}.exe" "${VERSION}" "windows" "${NOTES}"

cd ..
# deactivate

echo "Upload finished."