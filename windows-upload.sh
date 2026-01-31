
VERSION="0.0.3"
NOTES="backend refactoring, masked logs and outputs, added some error handling, lil bug fixes"


cd ./test_server
# . .venv/bin/activate

python3.12 upload_fromlocal.py "dist/TURKUAZZMC-${VERSION}.exe" "${VERSION}" "windows" "${NOTES}"

cd ..
# deactivate

echo "Upload finished."