
VERSION="0.0.7"
NOTES="trying bundled java"


cd ./test_server
# . .venv/bin/activate

python3.12 upload_fromlocal.py "dist/TURKUAZZMC-${VERSION}.exe" "${VERSION}" "windows" "${NOTES}"

cd ..
# deactivate

echo "Upload finished."