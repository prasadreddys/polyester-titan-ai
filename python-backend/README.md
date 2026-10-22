# POLYESTER TITAN AI - Python FastAPI Trading Engine Companion

This modular backend provides a standalone Python FastAPI service designed to run in environments with Python 3.11+ and the official `polyester-sdk`.

## Compatibility & Architecture Notice

- **AI Studio Build Container Runtime:** Runs Node.js 22 + Python 3.10 (without pip).
- **Official Polyester Python SDK Requirement:** PyPI `polyester-sdk` requires Python `>= 3.11`.
- **Integration Bridge:** The primary full-stack Node.js server (`server.ts`) acts as the secure integration layer, proxying requests and interfacing with the browser while protecting server secrets.
- If you deploy this Python FastAPI companion service (e.g. in a Docker container or local virtualenv), set the `FASTAPI_BACKEND_URL` environment variable in `.env` (e.g. `FASTAPI_BACKEND_URL=http://localhost:8000`).

## Running Locally with Python 3.11+

```bash
# 1. Create a Python 3.11+ virtual environment
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 2. Install dependencies including official polyester-sdk
pip install -r requirements.txt

# 3. Configure environment variables (do NOT commit secrets)
export POLYESTER_API_HOST="https://testnet.polyester.com"
export POLYESTER_API_KEY_ID="your_api_key_id"
export POLYESTER_API_PRIVATE_KEY="your_api_private_key"
export POLYESTER_ACCOUNT_ID="your_account_id"

# 4. Start the FastAPI server
python main.py
# Running on http://127.0.0.1:8000
```

## Security Guarantees
- Strictly binds to Polyester Testnet only.
- Never logs API keys, private keys, or account IDs.
- Automatic trading is disabled by default.
- Never places an order during startup or health check.
