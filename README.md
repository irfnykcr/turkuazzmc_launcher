


# Getting started

## Prerequisites
- Node.js and npm
- Python 3 (for test_server tasks)

## Run the app (development)
```bash
npm install
npm run start
```

## Uploading versions / running test_server
```bash
cd test_server
python3 -m venv .venv
pip install -r requirements.txt
python upload_versions.py
deactivate
```
