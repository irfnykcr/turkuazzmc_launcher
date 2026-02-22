
VERSION="0.0.6"
NOTES="fixed syntax spacing on ipchandlers, added launch_safe but still in development, added basic readme"


cd ./test_server
# . .venv/bin/activate

python3.12 upload_fromlocal.py "dist/TURKUAZZMC-${VERSION}.exe" "${VERSION}" "windows" "${NOTES}"

cd ..
# deactivate

echo "Upload finished."