# Bank Statement Analyzer for CRM

A production-ready FastAPI service that ingests bank statement PDFs or CSVs and returns:

- **JSON metrics** — ending balance, ADB, NSF count, true deposits, monthly revenue, loans, and more
- **Professional PDF report** — styled like a spreadsheet with embedded charts

---

## Project Structure

```
bank-statement-analyzer/
├── main.py               # FastAPI app + endpoints
├── analyzer.py           # Parsing + all metric calculations
├── report_generator.py   # HTML template + WeasyPrint PDF generation
├── templates/
│   └── report.html       # Jinja2 HTML template
├── static/
│   └── styles.css        # Professional PDF styling
├── Dockerfile
├── requirements.txt
└── README.md
```

---

## Local Install & Run

### Prerequisites

WeasyPrint needs Cairo and Pango system libraries.

**macOS**
```bash
brew install cairo pango gdk-pixbuf libffi
```

**Ubuntu / Debian**
```bash
sudo apt-get install libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 libffi-dev ghostscript poppler-utils
```

### Install Python dependencies

```bash
cd bank-statement-analyzer
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Run the server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Visit **http://localhost:8000/docs** for the interactive Swagger UI.

---

## Example curl command

```bash
# Returns JSON with metrics + base64-encoded PDF
curl -X POST http://localhost:8000/analyze \
  -F "file=@your_statement.pdf" \
  | python3 -c "
import sys, json, base64
data = json.load(sys.stdin)
print('Ending Balance:', data['metrics']['ending_balance'])
print('True Deposits:', data['metrics']['true_deposits'])
open('report.pdf', 'wb').write(base64.b64decode(data['pdf_base64']))
print('PDF saved to report.pdf')
"
```

```bash
# Download the PDF directly (no JSON wrapper)
curl -X POST http://localhost:8000/analyze/pdf-only \
  -F "file=@your_statement.pdf" \
  --output report.pdf
```

---

## Ollama Setup (for scanned / image-based PDFs)

The `bankstatementparser` hybrid pipeline can use a locally running Ollama model to OCR and extract data from scanned statements.

1. **Install Ollama**: https://ollama.com/download

2. **Pull a model** (7B works well for extraction tasks):
   ```bash
   ollama pull mistral        # ~4 GB
   # or
   ollama pull llama3.1:8b   # ~5 GB
   ```

3. **Start Ollama** (runs on port 11434 by default):
   ```bash
   ollama serve
   ```

4. **Set the environment variable** before starting the analyzer:
   ```bash
   export OLLAMA_HOST=http://localhost:11434
   uvicorn main:app --reload
   ```

> **Model recommendations:**
> - `mistral` or `llama3.1:8b` — fast, good accuracy for extraction
> - `llama3.1:13b` — more accurate for complex/multi-page statements

---

## Docker

```bash
# Build
docker build -t bank-statement-analyzer .

# Run (no Ollama)
docker run -p 8000:8000 bank-statement-analyzer

# Run with Ollama (running on host machine)
docker run -p 8000:8000 \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  bank-statement-analyzer
```

---

## Deploy to Render.com (~$7–$10/month)

1. Push this folder to a GitHub repo.
2. Create a new **Web Service** on [render.com](https://render.com).
3. Set:
   - **Environment**: Docker
   - **Port**: 8000
   - **Plan**: Starter ($7/mo) handles hundreds of PDFs/month
4. Add environment variable `OLLAMA_HOST` if you want Ollama support (requires a separate VM).

## Deploy to Fly.io (~$10–$20/month)

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly launch
fly deploy
```

Fly.io persistent machines handle thousands of PDFs/month comfortably on the `shared-cpu-2x` plan.

---

## CRM Integration

Call the API from any CRM or backend with a simple HTTP POST:

```python
import requests, base64

with open("statement.pdf", "rb") as f:
    resp = requests.post("https://your-deployed-url/analyze", files={"file": f})

data = resp.json()
metrics = data["metrics"]          # dict — plug straight into your CRM record
pdf     = base64.b64decode(data["pdf_base64"])

# Save PDF or attach to deal/lead in your CRM
with open("report.pdf", "wb") as out:
    out.write(pdf)
```

**Key JSON fields returned:**

| Field | Description |
|---|---|
| `ending_balance` | Last balance in the statement |
| `avg_daily_balance` | Mean daily balance (ffill-reconstructed) |
| `negative_days` | Days the account was below $0 |
| `total_deposits` | Sum of all positive transactions |
| `true_deposits` | Operating revenue (excludes transfers, loans, refunds…) |
| `true_deposit_count` | Number of true-deposit transactions |
| `monthly_revenue` | `[{month, amount}]` array |
| `nsf_count` | Number of NSF/overdraft events |
| `nsf_total` | Total NSF fees charged |
| `loans` | `[{loan_type, count, total}]` array |
| `total_withdrawals` | Sum of all debits |
| `period_start/end` | Statement date range |

---

## Security Notes

- Files are **processed entirely in memory** — no raw statements are ever written to disk or stored.
- No PII is persisted after the request completes.
- For production, add an API key via an `Authorization` header middleware.
