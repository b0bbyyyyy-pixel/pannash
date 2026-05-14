"""
analyzer.py
-----------
Core parsing and metric calculation engine for the Bank Statement Analyzer.

Pipeline:
  1. Ingest PDF/CSV via bankstatementparser hybrid pipeline (+ fallback to pdfplumber/pandas)
  2. Normalize the resulting DataFrame into standard columns: date, description, amount, balance
  3. Reconstruct full daily balances using forward-fill across calendar days
  4. Compute every CRM metric (ADB, NSFs, true deposits, loans, monthly revenue, etc.)
  5. Return a clean dict ready for the report generator and JSON response
"""

from __future__ import annotations

import io
import re
import logging
from datetime import datetime, date
from typing import IO, Union, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Keyword filter sets
# ---------------------------------------------------------------------------

# Transactions matching ANY of these keywords are excluded from True Deposits
EXCLUDE_KEYWORDS = [
    "transfer", "loan", "ach credit", "wire", "owner", "contribution",
    "refund", "internal", "reversal", "zelle", "paypal transfer",
    "venmo", "cash app", "mobile deposit return",
]

# Used to detect NSF / overdraft fees
NSF_KEYWORDS = ["nsf", "overdraft", "nonsufficient", "returned item fee", "overdraft fee"]

# Used to detect loan / financing inflows and repayments.
# Includes generic terms AND major MCA / revenue-based financing brands.
LOAN_KEYWORDS = [
    # Generic
    "loan", "mortgage", "sba", "ppp", "financing", "lender", "line of credit",
    "advance", "factor", "factoring", "mca", "merchant cash",
    # Major MCA / business lenders
    "ondeck", "on deck",
    "kabbage",
    "fundbox",
    "bluevine", "blue vine",
    "clearco",
    "capchase",
    "credibly",
    "can capital",
    "rapid finance",
    "forward financing",
    "greenbox",
    "libertas",
    "biz2credit",
    "headway capital",
    "stripe capital",
    "paypal capital",
    "square capital",
    "amazon lending",
    "shopify capital",
    "national funding",
    "newtek",
    "smartbiz",
    "lendio",
    "reliant funding",
    "iou financial",
    "swift capital",
    "dealstruck",
    "quarterspot",
    "fora financial",
    "aspire funding", "aspire capital", "aspire",
]


# ---------------------------------------------------------------------------
# Ingestion helpers
# ---------------------------------------------------------------------------

def _detect_delimiter(text: str) -> str:
    """Auto-detect CSV delimiter (comma, tab, pipe, semicolon)."""
    import csv as _csv
    sample = text[:4096]
    try:
        dialect = _csv.Sniffer().sniff(sample, delimiters=",\t|;")
        return dialect.delimiter
    except Exception:
        pass
    for line in text.splitlines():
        line = line.strip()
        if line:
            counts = {d: line.count(d) for d in (",", "\t", "|", ";")}
            return max(counts, key=counts.get)
    return ","


# Recognised banking column keywords for column mapping
_DATE_KW    = {"date", "post_date", "posting_date", "trans_date", "transaction_date",
               "value_date", "effective_date", "posted", "posted_date"}
_DESC_KW    = {"description", "memo", "payee", "narrative", "details",
               "trans_description", "transaction_description"}
_AMOUNT_KW  = {"amount", "transaction_amount", "trans_amount"}
_DEBIT_KW   = {"debit", "debit_amount", "withdrawal", "withdrawals"}
_CREDIT_KW  = {"credit", "credit_amount", "deposit", "deposits"}
_BALANCE_KW = {"balance", "running_balance", "ledger_balance", "closing_balance"}


def _score_columns(cols: list[str]) -> int:
    """
    Score how likely a set of normalised column names are to be a real
    bank-statement header row. Higher is better.
    Returns 0 if the required columns (date + amount-like) are missing.
    """
    has_date   = any(c in _DATE_KW   for c in cols)
    has_desc   = any(c in _DESC_KW   for c in cols)
    has_amount = (any(c in _AMOUNT_KW for c in cols)
                  or (any(c in _DEBIT_KW for c in cols)
                      and any(c in _CREDIT_KW for c in cols)))
    if not (has_date and has_amount):
        return 0
    return sum([has_date, has_desc, has_amount,
                any(c in _BALANCE_KW for c in cols)])


def _parse_csv_fallback(file_bytes: bytes) -> pd.DataFrame:
    """
    Robust CSV parser for US bank exports.

    Tries skipping 0, 1, 2, … rows until the parsed DataFrame has
    recognisable banking columns.  This handles banks (Zions, Chase, BoA…)
    that prepend legal notices or account summaries — including notices that
    are stored as a single multi-line quoted CSV field.
    """
    # --- Decode ---
    text: str | None = None
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            text = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ValueError("Could not decode CSV file — unknown encoding.")

    sep = _detect_delimiter(text)
    logger.info("CSV delimiter detected: %r", sep)

    # --- Brute-force skiprows search ---
    # Try skipping 0 to MAX_SKIP rows; keep the parse with the best column score.
    MAX_SKIP   = 40
    best_df    = None
    best_score = 0
    best_skip  = 0

    for skip in range(0, MAX_SKIP + 1):
        try:
            buf = io.BytesIO(text.encode("utf-8"))
            df  = pd.read_csv(buf, sep=sep, skiprows=skip,
                              thousands=",", low_memory=False,
                              on_bad_lines="skip")
        except Exception:
            continue

        if df.empty or len(df.columns) < 2:
            continue

        norm_cols = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
        score = _score_columns(norm_cols)

        if score > best_score:
            best_score = score
            best_df    = df.copy()
            best_skip  = skip

        # Perfect score — no need to keep looking
        if score >= 4:
            break

    if best_df is None or best_score == 0:
        # Final fallback: return the raw parse (skip=0) so the error message
        # shows the real column names instead of a generic message.
        buf = io.BytesIO(text.encode("utf-8"))
        try:
            best_df = pd.read_csv(buf, sep=sep, thousands=",",
                                  low_memory=False, on_bad_lines="skip")
        except Exception as exc:
            raise ValueError(f"Could not parse CSV: {exc}")

    logger.info("CSV best parse: skiprows=%d score=%d cols=%s",
                best_skip, best_score, list(best_df.columns)[:8])

    df = best_df
    orig_cols = list(df.columns)
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]

    # --- Map columns to standard names ---
    col_map: dict[str, str] = {}
    used: set[str] = set()

    def _claim(col: str, target: str) -> bool:
        if target not in used:
            col_map[col] = target
            used.add(target)
            return True
        return False

    for col in df.columns:
        cl = col
        if cl in _DATE_KW or any(cl.startswith(k) or cl.endswith(k) for k in _DATE_KW):
            _claim(col, "date")
        elif cl in _DESC_KW or any(k in cl for k in _DESC_KW):
            _claim(col, "description")
        elif cl in _AMOUNT_KW or cl == "debit/credit":
            _claim(col, "amount")
        elif cl in _DEBIT_KW or any(cl.startswith(k) for k in _DEBIT_KW):
            _claim(col, "_debit")
        elif cl in _CREDIT_KW or any(cl.startswith(k) for k in _CREDIT_KW):
            _claim(col, "_credit")
        elif cl in _BALANCE_KW or any(k in cl for k in _BALANCE_KW):
            _claim(col, "balance")

    df = df.rename(columns=col_map)
    logger.info("Column mapping: %s", col_map)

    # --- Build signed amount from debit/credit ---
    if "amount" not in df.columns and "_debit" in df.columns and "_credit" in df.columns:
        def _num(s: pd.Series) -> pd.Series:
            return pd.to_numeric(
                s.astype(str).str.replace(r"[,$\s()]", "", regex=True),
                errors="coerce"
            ).fillna(0)
        df["amount"] = _num(df["_credit"]) - _num(df["_debit"])

    # --- Validate ---
    missing = [c for c in ("date", "description", "amount") if c not in df.columns]
    if missing:
        raise ValueError(
            f"Could not map required column(s) {missing}. "
            f"Columns detected: {orig_cols[:10]}. "
            f"Delimiter: {repr(sep)}. "
            "If you exported from Zions Bank, Chase, or BoA – make sure to use "
            "'Download Transactions' (not 'Print Statement') and choose CSV format."
        )

    keep = ["date", "description", "amount"] + (["balance"] if "balance" in df.columns else [])
    return df[keep]


def _parse_pdf_fallback(file_bytes: bytes) -> pd.DataFrame:
    """
    PDF parser using pdfplumber.

    Strategy:
      0. Identify the bank from the first-page text and call a bank-specific
         word-level parser if available (Chase, Wells Fargo).
      1. Try structured table extraction (works for banks that embed real tables).
      2. If no tables, fall back to full-text parsing which handles Zions Bank,
         PNC, and similar statement formats that use text columns.
    """
    try:
        import pdfplumber
    except ImportError:
        raise ImportError("pdfplumber is required – pip install pdfplumber")

    # ── Step 0: Fast bank identification from page 1 ──────────────────────
    # This MUST run before table extraction so that multi-column banks
    # (Chase, Wells Fargo) never reach the generic CSV/table path.
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as _peek:
            _p1 = (_peek.pages[0].extract_text(x_tolerance=3, y_tolerance=3) or "")[:900]
    except Exception:
        _p1 = ""

    if "Bank of America" in _p1 or "bankofamerica.com" in _p1.lower():
        _df = _parse_bofa_pdf(file_bytes)
        if _df is not None and not _df.empty:
            return _df

    if "Capital One" in _p1 or "capitalone.com" in _p1.lower() or "1-888-755-2172" in _p1:
        _df = _parse_capitalone_pdf(file_bytes)
        if _df is not None and not _df.empty:
            return _df

    if ("5/3 BUSINESS" in _p1 or "FTCSTMT052" in _p1
            or "www.53.com" in _p1.lower() or "Fifth Third" in _p1):
        _df = _parse_fifththird_pdf(file_bytes)
        if _df is not None and not _df.empty:
            return _df

    if ("U.S. Bank" in _p1 or "usbank.com" in _p1.lower()
            or "Saint Paul, Minnesota 55101" in _p1
            or "800-673-3555" in _p1):
        _df = _parse_usbank_pdf(file_bytes)
        if _df is not None and not _df.empty:
            return _df

    if "pebank.com" in _p1.lower():
        _df = _parse_pebank_pdf(file_bytes)
        if _df is not None and not _df.empty:
            return _df

    if "Wells Fargo" in _p1 or "wellsfargo.com" in _p1.lower():
        _df = _parse_wellsfargo_pdf(file_bytes)
        if _df is not None and not _df.empty:
            return _df

    if "JPMorgan Chase" in _p1 or "Chase Business" in _p1:
        _df = _parse_chase_pdf(file_bytes)
        if _df is not None and not _df.empty:
            return _df

    if "Truist" in _p1 or "truist.com" in _p1.lower() or "4TRUIST" in _p1:
        _df = _parse_truist_pdf(file_bytes)
        if _df is not None and not _df.empty:
            return _df

    all_text_pages: list[str] = []
    table_rows: list[dict]    = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue
                # Skip "tables" that are really just bordered text boxes —
                # these have only 1 column or a very long first-cell header
                # (the Zions Bank legal notice box is a classic example).
                if len(table[0]) <= 1 or (table[0][0] and len(str(table[0][0])) > 80):
                    continue
                header = [str(c).strip().lower() if c else "" for c in table[0]]
                for row in table[1:]:
                    if row:
                        table_rows.append(
                            dict(zip(header, [str(c).strip() if c else "" for c in row]))
                        )
            text = page.extract_text()
            if text:
                all_text_pages.append(text)

    # --- Use table data if pdfplumber found structured tables ---
    if table_rows:
        df = pd.DataFrame(table_rows)
        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
        return _parse_csv_fallback(df.to_csv(index=False).encode())

    # --- Fall back to raw-text parsing ---
    if not all_text_pages:
        raise ValueError(
            "No text found in the PDF. It may be a scanned image. "
            "Try exporting from your bank's website as CSV instead."
        )

    full_text = "\n".join(all_text_pages)

    # Try bank-specific text parsers (Wells Fargo and Chase already handled in
    # step 0 above; PNC needs the full extracted text).
    df = None
    if "PNC" in full_text[:500] or "pnc.com" in full_text[:500].lower():
        df = _parse_pnc_text(full_text)
    
    if df is None or df.empty:
        df = _parse_zions_text(full_text)

    if df is None or df.empty:
        df = _parse_text_lines_generic(full_text)

    if df is None or df.empty:
        raise ValueError(
            "Could not extract transactions from this PDF. "
            "The layout may be non-standard. Try downloading as CSV from your bank's website, "
            "or set OPENAI_API_KEY for AI-assisted extraction."
        )

    return df


# ---------------------------------------------------------------------------
# AI-assisted fallback parser (OpenAI GPT-4o-mini)
# ---------------------------------------------------------------------------

# Sentinel column name used to carry the ai_assisted flag through the pipeline
_AI_FLAG_COL = "_ai_assisted"


def _extract_full_pdf_text(file_bytes: bytes) -> str:
    """Concatenate extractable text from every page (for AI / diagnostics)."""
    try:
        import pdfplumber
    except ImportError:
        return ""
    chunks: list[str] = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                t = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                if t.strip():
                    chunks.append(t)
    except Exception:
        return ""
    return "\n".join(chunks)


def _parse_statement_with_ai(full_text: str) -> "pd.DataFrame | None":
    """
    Send bank-statement text to OpenAI and parse a structured transaction list.

    Requires OPENAI_API_KEY. Sets _ai_assisted=True on every row for UI warnings.
    """
    import os, json, re as _re, logging
    log = logging.getLogger(__name__)

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        log.warning("AI fallback skipped – OPENAI_API_KEY not set.")
        return None

    try:
        import httpx as _httpx
    except ImportError:
        log.warning("AI fallback skipped – httpx not installed.")
        return None

    text_snippet = full_text[:18_000]

    system_prompt = (
        "You extract financial transactions from bank statement text. "
        'Reply with a JSON object using this exact shape: {"transactions":[{"date":"YYYY-MM-DD",'
        '"description":"memo text","amount":123.45}, ...]}. '
        "Rules: amount is positive for deposits/credits, negative for withdrawals/debits; "
        "skip section headers, balance subtotals that are not individual line items, and "
        "pure summary rows like Beginning/Ending Balance unless they are clearly one line-per-txn. "
        "Include every real transaction you can infer from the text."
    )

    user_prompt = f"Statement text:\n\n{text_snippet}"

    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        "temperature": 0,
        "max_tokens":  4096,
        "response_format": {"type": "json_object"},
    }

    try:
        resp = _httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
            },
            json=payload,
            timeout=90.0,
        )
        resp.raise_for_status()
    except Exception as exc:
        log.warning("AI fallback API call failed: %s", exc)
        return None

    raw = resp.json()["choices"][0]["message"]["content"].strip()
    raw = _re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        log.warning("AI fallback: could not parse JSON response – %s", exc)
        return None

    if isinstance(parsed, list):
        records = parsed
    elif isinstance(parsed, dict):
        records = parsed.get("transactions") or parsed.get("data") or parsed.get("rows")
    else:
        records = None

    if not isinstance(records, list) or len(records) == 0:
        log.warning("AI fallback: empty transactions list")
        return None

    rows = []
    for rec in records:
        if not isinstance(rec, dict):
            continue
        try:
            rows.append({
                "date":         str(rec.get("date", "")),
                "description":  str(rec.get("description", "")),
                "amount":       float(rec.get("amount", 0)),
                "balance":      float("nan"),
                _AI_FLAG_COL:   True,
            })
        except (TypeError, ValueError):
            continue

    if not rows:
        return None

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    df = df.sort_values("date").reset_index(drop=True)

    log.info("AI-assisted: extracted %d transactions", len(df))
    return df


def _ingest_transactions(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """
    Parse CSV/PDF with built-in parsers first; on failure or empty result, try OpenAI
    on extracted text (PDF) or raw file text (CSV).
    """
    import os as _os

    ext = (filename or "").lower().split(".")[-1]
    last_error: Optional[Exception] = None
    df: Optional[pd.DataFrame] = None

    if ext == "csv":
        try:
            df = _parse_csv_fallback(file_bytes)
        except Exception as exc:
            last_error = exc
            df = None
    elif ext == "pdf":
        try:
            df = _parse_pdf_fallback(file_bytes)
        except Exception as exc:
            last_error = exc
            df = None
    else:
        raise ValueError(f"Unsupported file type: .{ext}. Please upload a PDF or CSV.")

    if df is not None and not df.empty:
        return df

    # ── AI fallback ───────────────────────────────────────────
    snippet = ""
    if ext == "pdf":
        snippet = _extract_full_pdf_text(file_bytes)
    elif ext == "csv":
        try:
            snippet = file_bytes.decode("utf-8", errors="replace")
        except Exception:
            snippet = ""

    # Require enough text for AI to be worthwhile (PDFs need more context)
    _min_ai_chars = 20 if ext == "csv" else 80
    if len((snippet or "").strip()) < _min_ai_chars:
        msg = str(last_error) if last_error else "Could not extract enough text from the uploaded file for analysis."
        if not _os.environ.get("OPENAI_API_KEY", "").strip():
            msg += " Set OPENAI_API_KEY in the environment to enable AI-assisted extraction for unknown formats."
        raise ValueError(msg)

    ai_df = _parse_statement_with_ai(snippet)
    if ai_df is not None and not ai_df.empty:
        return ai_df

    msg = (
        str(last_error)
        if last_error
        else "Could not extract transaction data from the uploaded file."
    )
    if not _os.environ.get("OPENAI_API_KEY", "").strip():
        msg += " Set OPENAI_API_KEY in the environment to enable AI-assisted extraction for unknown formats."
    raise ValueError(msg)


def _parse_capitalone_pdf(file_bytes: bytes) -> "pd.DataFrame | None":
    """
    Parser for Capital One Business Checking PDF statements.

    Column layout (612-pt wide page)
    ---------------------------------
    Date              x ≈  36   format MM/DD
    Description       x ≈  72 – 285
    Deposits/Credits  x ≈ 291 – 380   positive amounts with $ prefix
    Withdrawals/Debits x ≈ 383 – 490  positive amounts with $ prefix (sign = -1)
    Resulting Balance x ≥ 491          running balance with $ prefix

    Period: "ACCOUNT SUMMARY FOR PERIOD MM DD, YYYY - MM DD, YYYY" on page 1.
    """
    import io as _io, re, logging
    from collections import defaultdict
    try:
        import pdfplumber
    except ImportError:
        return None

    log = logging.getLogger(__name__)

    DATE_RE   = re.compile(r"^(\d{2})/(\d{2})$")       # MM/DD
    AMT_RE    = re.compile(r"^\$?([\d,]+\.\d{2})$")

    PERIOD_RE = re.compile(
        r"PERIOD\s+(\w+\s+\d{1,2},\s*\d{4})\s*[-–]\s*(\w+\s+\d{1,2},\s*\d{4})",
        re.IGNORECASE,
    )

    stmt_year  = None
    start_date = end_date = None
    rows: list[dict] = []

    def _resolve(mmdd: str) -> "datetime | None":
        m = DATE_RE.match(mmdd)
        if not m or stmt_year is None:
            return None
        mo, da = int(m.group(1)), int(m.group(2))
        for yr in (stmt_year, stmt_year - 1, stmt_year + 1):
            try:
                d = datetime(yr, mo, da)
                if start_date and end_date:
                    from datetime import timedelta as _td
                    if (start_date - _td(days=5)) <= d <= (end_date + _td(days=5)):
                        return d
                else:
                    return d
            except ValueError:
                pass
        try:
            return datetime(stmt_year, mo, da)
        except ValueError:
            return None

    def _parse_amt(text: str) -> "float | None":
        m = AMT_RE.match(text)
        return float(m.group(1).replace(",", "")) if m else None

    try:
        with pdfplumber.open(_io.BytesIO(file_bytes)) as pdf:
            # ── Period ────────────────────────────────────────────────────
            for page in pdf.pages[:2]:
                text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                pm = PERIOD_RE.search(text)
                if pm:
                    try:
                        start_date = datetime.strptime(pm.group(1).strip(), "%B %d, %Y")
                        end_date   = datetime.strptime(pm.group(2).strip(), "%B %d, %Y")
                        stmt_year  = start_date.year
                    except ValueError:
                        pass
                    if stmt_year:
                        break

            if stmt_year is None:
                log.warning("Capital One parser: could not determine statement year")
                return None

            # ── Process pages ─────────────────────────────────────────────
            for page in pdf.pages:
                words = page.extract_words(x_tolerance=3, y_tolerance=3)
                if not words:
                    continue

                row_map: dict[int, list] = defaultdict(list)
                for w in words:
                    row_map[round(w["top"] / 4) * 4].append(w)

                for y_key in sorted(row_map):
                    rw = sorted(row_map[y_key], key=lambda w: w["x0"])
                    first = rw[0]["text"]

                    # Date at far left (MM/DD)
                    date_ws = [w for w in rw if w["x0"] < 55 and DATE_RE.match(w["text"])]
                    if not date_ws:
                        continue

                    d = _resolve(date_ws[0]["text"])
                    if not d:
                        continue

                    # Deposit column (x ≈ 291–380)
                    dep_ws = [w for w in rw if 285 <= w["x0"] <= 380 and AMT_RE.match(w["text"])]
                    # Debit column (x ≈ 383–490)
                    deb_ws = [w for w in rw if 381 <= w["x0"] <= 490 and AMT_RE.match(w["text"])]
                    # Balance column (x ≥ 491)
                    bal_ws = [w for w in rw if w["x0"] >= 491 and AMT_RE.match(w["text"])]

                    desc_ws = [w for w in rw if 55 <= w["x0"] < 285]
                    desc    = " ".join(w["text"] for w in desc_ws).strip()

                    if dep_ws:
                        amt = _parse_amt(dep_ws[0]["text"])
                        if amt is not None:
                            rows.append({"date": d, "amount": +amt, "description": desc})
                    if deb_ws:
                        amt = _parse_amt(deb_ws[0]["text"])
                        if amt is not None:
                            rows.append({"date": d, "amount": -amt, "description": desc})
                    if bal_ws and not dep_ws and not deb_ws:
                        # Balance-only row (shouldn't happen but handle gracefully)
                        pass
                    if bal_ws and (dep_ws or deb_ws):
                        amt = _parse_amt(bal_ws[0]["text"])
                        if amt is not None:
                            rows.append({
                                "date": d, "amount": 0.0,
                                "description": "__daily_balance_sentinel__",
                                "balance": amt,
                            })

    except Exception as exc:
        log.warning("Capital One parser error: %s", exc, exc_info=True)
        return None

    if not rows:
        return None

    df = pd.DataFrame(rows)
    if "balance" not in df.columns:
        df["balance"] = float("nan")
    df["date"]   = pd.to_datetime(df["date"])
    df["amount"] = df["amount"].astype(float)
    df = df.sort_values("date").reset_index(drop=True)

    txn = int((df["description"] != "__daily_balance_sentinel__").sum())
    log.info("Capital One parser: %d transactions, %s → %s",
             txn, df["date"].min().date(), df["date"].max().date())
    return df


def _parse_fifththird_pdf(file_bytes: bytes) -> "pd.DataFrame | None":
    """
    Parser for Fifth Third Bank Business Checking PDF statements.

    Page 1 layout
    --------------
    Checks section (x≈36–580, 3-column grid):
      Col 1: Number x≈36, DatePaid x≈97,  Amount x≈170
      Col 2: Number x≈218, DatePaid x≈280, Amount x≈350
      Col 3: Number x≈400, DatePaid x≈462, Amount x≈533
      DatePaid format: MM/DD, amounts positive → sign = -1

    Withdrawals/Debits section:
      Header "Withdrawals/Debits N items totaling $X"
      Then column header "Date | Amount | Description"
      Rows: Date x≈36 (MM/DD), Amount x≈135–165 (positive → sign = -1),
            Description x≈204+

    Deposits/Credits section:
      Header "Deposits/Credits N items totaling $X"
      Same row format, amounts positive → sign = +1

    Page 2 layout – DailyBalanceSummary (3-column grid):
      Col 1: Date x≈36, Balance x≈145–185
      Col 2: Date x≈216, Balance x≈340–370
      Col 3: Date x≈397, Balance x≈520–550
      Date format: MM/DD

    Period: "Statement Period Date: M/D/YYYY - M/D/YYYY"
    """
    import io as _io, re, logging
    from collections import defaultdict
    try:
        import pdfplumber
    except ImportError:
        return None

    log = logging.getLogger(__name__)

    DATE_RE   = re.compile(r"^(\d{1,2})/(\d{1,2})$")   # M/D or MM/DD
    AMT_RE    = re.compile(r"^\$?\(?([\d,]+\.\d{2})\)?$")
    PERIOD_RE = re.compile(
        r"Statement\s+Period\s+Date:\s*(\d{1,2}/\d{1,2}/\d{4})\s*-\s*(\d{1,2}/\d{1,2}/\d{4})",
        re.IGNORECASE,
    )

    stmt_year  = None
    start_date = end_date = None
    rows: list[dict] = []

    def _resolve(mmdd: str) -> "datetime | None":
        m = DATE_RE.match(mmdd)
        if not m or stmt_year is None:
            return None
        mo, da = int(m.group(1)), int(m.group(2))
        for yr in (stmt_year, stmt_year - 1, stmt_year + 1):
            try:
                d = datetime(yr, mo, da)
                if start_date and end_date:
                    from datetime import timedelta as _td
                    if (start_date - _td(days=5)) <= d <= (end_date + _td(days=5)):
                        return d
                else:
                    return d
            except ValueError:
                pass
        try:
            return datetime(stmt_year, mo, da)
        except ValueError:
            return None

    def _parse_amt(text: str) -> "float | None":
        m = AMT_RE.match(text)
        return float(m.group(1).replace(",", "")) if m else None

    try:
        with pdfplumber.open(_io.BytesIO(file_bytes)) as pdf:
            # ── Period ────────────────────────────────────────────────────
            for page in pdf.pages[:2]:
                text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                pm = PERIOD_RE.search(text)
                if pm:
                    try:
                        start_date = datetime.strptime(pm.group(1).strip(), "%m/%d/%Y")
                        end_date   = datetime.strptime(pm.group(2).strip(), "%m/%d/%Y")
                        stmt_year  = start_date.year
                    except ValueError:
                        pass
                    if stmt_year:
                        break

            if stmt_year is None:
                log.warning("Fifth Third parser: could not determine period")
                return None

            SEC_CHECKS = "checks"
            SEC_DEBITS = "debits"
            SEC_CREDITS = "credits"
            SEC_OTHER  = "other"

            for page in pdf.pages:
                words = page.extract_words(x_tolerance=3, y_tolerance=3)
                if not words:
                    continue

                full_text = " ".join(w["text"] for w in words).lower()

                # ── Find DailyBalanceSummary y-cutoff (may share page with deposits) ──
                daily_summary_y = float("inf")
                for w in words:
                    if w["text"] == "DailyBalanceSummary" and w["x0"] < 50:
                        daily_summary_y = w["top"]
                        break

                # ── Process DailyBalanceSummary grid ──────────────────────
                if daily_summary_y < float("inf"):
                    row_map_bal: dict[int, list] = defaultdict(list)
                    for w in words:
                        if w["top"] >= daily_summary_y:
                            row_map_bal[round(w["top"] / 5) * 5].append(w)
                    for y_key in sorted(row_map_bal):
                        rw = sorted(row_map_bal[y_key], key=lambda w: w["x0"])
                        row_text = " ".join(w["text"] for w in rw)
                        if any(k in row_text for k in ("Daily", "Balance", "Summary", "Date", "Amount", "FTCSTMT")):
                            continue
                        for col_dx, col_ax_min, col_ax_max in (
                            (36,  145, 210),
                            (216, 335, 370),
                            (397, 515, 555),
                        ):
                            dws = [w for w in rw if abs(w["x0"] - col_dx) < 25 and DATE_RE.match(w["text"])]
                            aws = [w for w in rw if col_ax_min <= w["x0"] <= col_ax_max and AMT_RE.match(w["text"])]
                            if dws and aws:
                                d2  = _resolve(dws[0]["text"])
                                raw_b = aws[0]["text"]
                                bal   = _parse_amt(raw_b)
                                if bal is not None and raw_b.startswith("("):
                                    bal = -bal
                                if d2 and bal is not None:
                                    rows.append({
                                        "date": d2, "amount": 0.0,
                                        "description": "__daily_balance_sentinel__",
                                        "balance": bal,
                                    })
                    # If the ENTIRE page is the balance summary (no transactions above), skip txn processing
                    if daily_summary_y < 80:
                        continue

                # ── Transaction rows on this page (above daily_summary_y) ──
                current_section = SEC_OTHER

                # Find y-positions of section markers (only above daily balance cutoff)
                section_ys: list[tuple[float, str]] = []
                for w in words:
                    if w["x0"] < 50 and w["top"] < daily_summary_y:
                        t = w["text"].lower()
                        if "checks" in t and w["top"] < 430:
                            section_ys.append((w["top"], SEC_CHECKS))
                        elif "withdrawals" in t and "/" in "".join(w2["text"] for w2 in words if abs(w2["top"] - w["top"]) < 5):
                            section_ys.append((w["top"], SEC_DEBITS))
                        elif "deposits" in t and "/" in "".join(w2["text"] for w2 in words if abs(w2["top"] - w["top"]) < 5):
                            section_ys.append((w["top"], SEC_CREDITS))

                def _section_at(y: float) -> str:
                    sec = SEC_OTHER
                    for sy, sname in section_ys:
                        if y >= sy:
                            sec = sname
                    return sec

                # Only process words ABOVE the DailyBalanceSummary cutoff
                row_map = defaultdict(list)
                for w in words:
                    if w["top"] < daily_summary_y:
                        row_map[round(w["top"] / 4) * 4].append(w)

                # ── Checks section (3-col grid of check numbers/dates/amounts) ──
                checks_y_range = None
                for i, (sy, sn) in enumerate(section_ys):
                    if sn == SEC_CHECKS:
                        next_y = section_ys[i + 1][0] if i + 1 < len(section_ys) else 999
                        checks_y_range = (sy, next_y)
                        break

                if checks_y_range:
                    cy_min, cy_max = checks_y_range
                    for y_key in sorted(row_map):
                        rw = sorted(row_map[y_key], key=lambda w: w["x0"])
                        if not (cy_min + 20 <= y_key <= cy_max):
                            continue
                        row_text = " ".join(w["text"] for w in rw)
                        if any(k in row_text for k in ("Number", "DatePaid", "Checks", "Indicates", "totaling")):
                            continue
                        for col_n_x, col_d_x, col_a_min, col_a_max in (
                            (36,  97,  155, 205),
                            (218, 280, 335, 390),
                            (400, 462, 520, 565),
                        ):
                            date_ws = [w for w in rw if abs(w["x0"] - col_d_x) < 20 and DATE_RE.match(w["text"])]
                            amt_ws  = [w for w in rw if col_a_min <= w["x0"] <= col_a_max and AMT_RE.match(w["text"])]
                            if date_ws and amt_ws:
                                d2  = _resolve(date_ws[0]["text"])
                                amt = _parse_amt(amt_ws[0]["text"])
                                if d2 and amt is not None:
                                    num_ws = [w for w in rw if abs(w["x0"] - col_n_x) < 20]
                                    num = " ".join(w["text"] for w in num_ws).strip()
                                    rows.append({"date": d2, "amount": -amt,
                                                 "description": f"Check #{num}"})

                # ── Transaction rows (Withdrawals + Deposits) ─────────────
                for y_key in sorted(row_map):
                    rw = sorted(row_map[y_key], key=lambda w: w["x0"])
                    if not rw:
                        continue
                    sec = _section_at(y_key)
                    if sec not in (SEC_DEBITS, SEC_CREDITS):
                        continue

                    # Date at x≈36, MM/DD format
                    date_ws = [w for w in rw if w["x0"] < 50 and DATE_RE.match(w["text"])]
                    if not date_ws:
                        continue
                    # Amount at x≈135–185
                    amt_ws = [w for w in rw if 130 <= w["x0"] <= 190 and AMT_RE.match(w["text"])]
                    if not amt_ws:
                        continue
                    row_text = " ".join(w["text"] for w in rw)
                    # Skip section header rows and column header rows
                    if any(k in row_text for k in ("items", "totaling", "Description", "Amount", "Date")):
                        continue

                    d   = _resolve(date_ws[0]["text"])
                    amt = _parse_amt(amt_ws[0]["text"])
                    if not d or amt is None:
                        continue

                    sign = +1 if sec == SEC_CREDITS else -1
                    desc_ws = [w for w in rw if w["x0"] >= 200]
                    desc    = " ".join(w["text"] for w in desc_ws).strip()
                    rows.append({"date": d, "amount": sign * amt, "description": desc})

    except Exception as exc:
        log.warning("Fifth Third parser error: %s", exc, exc_info=True)
        return None

    if not rows:
        return None

    df = pd.DataFrame(rows)
    if "balance" not in df.columns:
        df["balance"] = float("nan")
    df["date"]   = pd.to_datetime(df["date"])
    df["amount"] = df["amount"].astype(float)
    df = df.sort_values("date").reset_index(drop=True)

    txn = int((df["description"] != "__daily_balance_sentinel__").sum())
    log.info("Fifth Third parser: %d transactions, %s → %s",
             txn, df["date"].min().date(), df["date"].max().date())
    return df


def _parse_usbank_pdf(file_bytes: bytes) -> "pd.DataFrame | None":
    """
    Parser for U.S. Bank Business Checking PDF statements.

    Column layout (612-pt wide page)
    ---------------------------------
    Date         x ≈  20   format "Mon D" (e.g. "Jan 2" split across two words)
    Description  x ≈  56 – 405
    Ref Number   x ≈ 409   (skip)
    Amount       x ≈ 541 – 590  deposits = plain number, withdrawals = trailing "-"

    Section headers (at x ≈ 50–80):
      "Deposits"            → sign = +1
      "Withdrawals"         → sign = -1
      "Deposits (continued)" / "Withdrawals (continued)" → keep current sign

    Continuation lines: description-only rows (no amount in right column).

    Period: "Statement Period: Mon D, YYYY through Mon D, YYYY"
            (right-column, pages 1-3)
    """
    import io as _io, re, logging
    from collections import defaultdict
    try:
        import pdfplumber
    except ImportError:
        return None

    log = logging.getLogger(__name__)

    MONTHS = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4,
        "may": 5, "jun": 6, "jul": 7, "aug": 8,
        "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    }
    AMT_RE    = re.compile(r"^([\d,]+\.\d{2})-?$")   # "1,234.56" or "1,234.56-"
    AMT_RE2   = re.compile(r"\$([\d,]+\.\d{2})")      # $ 60,009.34 (with or without space)
    PERIOD_RE = re.compile(
        r"(\w{3,9})\s+(\d{1,2}),\s*(\d{4})\s+through\s+(\w{3,9})\s+(\d{1,2}),\s*(\d{4})",
        re.IGNORECASE,
    )
    # "Beginning Balance on Jan 2 $ 72,029.71"
    BEG_RE = re.compile(
        r"Beginning\s+Balance\s+on\s+(\w{3,9})\s+(\d{1,2})\s+\$\s*([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    # "Ending Balance on Jan 31, 2026 $ 60,009.34"
    END_RE = re.compile(
        r"Ending\s+Balance\s+on\s+(\w{3,9})\s+(\d{1,2}).*?\$\s*([\d,]+\.\d{2})",
        re.IGNORECASE,
    )

    stmt_year  = None
    start_date = end_date = None
    rows: list[dict] = []

    def _resolve_date(mon_word: str, day_word: str) -> "datetime | None":
        mo = MONTHS.get(mon_word.lower()[:3])
        if not mo or stmt_year is None:
            return None
        try:
            da = int(day_word)
        except ValueError:
            return None
        for yr in (stmt_year, stmt_year - 1, stmt_year + 1):
            try:
                d = datetime(yr, mo, da)
                if start_date and end_date:
                    from datetime import timedelta as _td
                    if (start_date - _td(days=5)) <= d <= (end_date + _td(days=5)):
                        return d
                else:
                    return d
            except ValueError:
                pass
        try:
            return datetime(stmt_year, mo, da)
        except ValueError:
            return None

    try:
        with pdfplumber.open(_io.BytesIO(file_bytes)) as pdf:
            # ── Period ────────────────────────────────────────────────────
            for page in pdf.pages[:4]:
                text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                pm = PERIOD_RE.search(text)
                if pm:
                    try:
                        start_date = datetime(int(pm.group(3)), MONTHS[pm.group(1).lower()[:3]], int(pm.group(2)))
                        end_date   = datetime(int(pm.group(6)), MONTHS[pm.group(4).lower()[:3]], int(pm.group(5)))
                        stmt_year  = start_date.year
                    except (KeyError, ValueError):
                        pass
                    if stmt_year:
                        break

            if stmt_year is None:
                log.warning("US Bank parser: could not determine period")
                return None

            # ── Extract beginning and ending balances as sentinels ────────
            for page in pdf.pages[:6]:
                text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                bm = BEG_RE.search(text)
                em = END_RE.search(text)
                if bm:
                    d = _resolve_date(bm.group(1), bm.group(2))
                    if d:
                        bal = float(bm.group(3).replace(",", ""))
                        rows.append({"date": d, "amount": 0.0,
                                     "description": "__daily_balance_sentinel__",
                                     "balance": bal})
                if em:
                    mo = MONTHS.get(em.group(1).lower()[:3])
                    da = int(em.group(2)) if mo else None
                    if mo and da and stmt_year:
                        try:
                            d = datetime(stmt_year, mo, da)
                            bal = float(em.group(3).replace(",", ""))
                            rows.append({"date": d, "amount": 0.0,
                                         "description": "__daily_balance_sentinel__",
                                         "balance": bal})
                        except ValueError:
                            pass
                if bm or em:
                    break

            SEC_DEPOSITS    = "deposits"
            SEC_WITHDRAWALS = "withdrawals"
            SEC_OTHER       = "other"
            current_section = SEC_OTHER

            for page in pdf.pages:
                words = page.extract_words(x_tolerance=3, y_tolerance=3)
                if not words:
                    continue

                row_map: dict[int, list] = defaultdict(list)
                for w in words:
                    row_map[round(w["top"] / 4) * 4].append(w)

                for y_key in sorted(row_map):
                    rw = sorted(row_map[y_key], key=lambda w: w["x0"])
                    first = rw[0]["text"]
                    row_text = " ".join(w["text"] for w in rw)

                    # Section header detection – matches "Deposits", "Other Deposits",
                    # "Card Deposits", "Withdrawals", "Other Withdrawals", etc.
                    leading_words = " ".join(w["text"] for w in rw[:4]).lower()
                    if rw[0]["x0"] < 80 and "deposits" in leading_words:
                        # Skip summary rows that also carry a count + total amount
                        has_amount_far_right = any(w["x0"] > 400 and AMT_RE.match(w["text"]) for w in rw)
                        if not has_amount_far_right:
                            current_section = SEC_DEPOSITS
                            continue
                    if rw[0]["x0"] < 80 and "withdrawals" in leading_words:
                        has_amount_far_right = any(w["x0"] > 400 and AMT_RE.match(w["text"]) for w in rw)
                        if not has_amount_far_right:
                            current_section = SEC_WITHDRAWALS
                            continue
                    if current_section == SEC_OTHER:
                        continue

                    # Skip column header rows
                    if first in ("Date", "DATE", "Ref", "Amount", "Description"):
                        continue

                    # Look for a date: two consecutive words "Mon D" at x≈20
                    # The date words appear as separate words: ["Jan", "2"] at x≈20 and x≈44
                    mon_ws = [w for w in rw if w["x0"] < 30 and w["text"][:3].lower() in MONTHS]
                    day_ws = [w for w in rw if 30 <= w["x0"] < 56 and w["text"].isdigit()]

                    if not mon_ws or not day_ws:
                        continue

                    d = _resolve_date(mon_ws[0]["text"], day_ws[0]["text"])
                    if not d:
                        continue

                    # Amount at far right (x ≥ 535)
                    amt_ws = [w for w in rw if w["x0"] >= 535 and AMT_RE.match(w["text"])]
                    if not amt_ws:
                        continue

                    raw  = amt_ws[0]["text"]
                    amt  = float(raw.rstrip("-").replace(",", ""))
                    # Trailing "-" means debit regardless of section (safety)
                    if raw.endswith("-") or current_section == SEC_WITHDRAWALS:
                        amt = -abs(amt)

                    desc_ws = [w for w in rw if 56 <= w["x0"] < 535 and w["x0"] < 410]
                    desc    = " ".join(w["text"] for w in desc_ws).strip()
                    rows.append({"date": d, "amount": amt, "description": desc})

    except Exception as exc:
        log.warning("US Bank parser error: %s", exc, exc_info=True)
        return None

    if not rows:
        return None

    df = pd.DataFrame(rows)
    if "balance" not in df.columns:
        df["balance"] = float("nan")
    df["date"]   = pd.to_datetime(df["date"])
    df["amount"] = df["amount"].astype(float)
    df = df.sort_values("date").reset_index(drop=True)

    txn = int((df["description"] != "__daily_balance_sentinel__").sum())
    bal = int((df["description"] == "__daily_balance_sentinel__").sum())
    log.info("US Bank parser: %d transactions + %d balance sentinels, %s → %s",
             txn, bal, df["date"].min().date(), df["date"].max().date())
    return df


def _pebank_collect_daily_balance_sentinels(lines: list[str]) -> list[dict]:
    """
    Parse PE Bank 'Daily Balances' grid (three date→$balance pairs per line
    until Service Charge Summary). Returns rows for _reconstruct_daily_balances.
    """
    BAL_PAIR = re.compile(r"(\d{2}/\d{2}/\d{4})\s+\$([\d,]+\.\d{2})")
    in_daily = False
    out: list[dict] = []
    for raw in lines:
        ls = raw.strip()
        low = ls.lower()
        if low == "daily balances":
            in_daily = True
            continue
        if not in_daily:
            continue
        if "service charge summary" in low:
            break
        if ls.startswith("#") or "checking account statements" in low:
            break
        if "date" in low and "amount" in low and len(ls) < 80:
            # Column header: "Date Amount Date Amount ..."
            continue
        for m in BAL_PAIR.finditer(ls):
            try:
                d = datetime.strptime(m.group(1), "%m/%d/%Y")
                bal = float(m.group(2).replace(",", ""))
                out.append({"date": d, "balance": bal})
            except ValueError:
                pass
    return out


def _parse_pebank_pdf(file_bytes: bytes) -> "pd.DataFrame | None":
    """
    PE Bank (pebank.com) business checking PDFs.

    Sections: Deposits, Electronic Credits, Other Credits (credits),
    Electronic Debits (debits), Checks Cleared (three checks per line).
    Activity lines: MM/DD/YYYY description... $amount
    Skip Account Summary (until Deposits) and trailing #check image pages.
    Uses the Daily Balances grid as balance sentinels so ADB / negative days
    are not reconstructed from cumsum-from-zero (which is wrong for this bank).
    """
    import io as _io
    import logging

    try:
        import pdfplumber
    except ImportError:
        return None

    log = logging.getLogger(__name__)

    TXN_DATE = re.compile(r"^(\d{2}/\d{2}/\d{4})\s+(.+)$")
    AMT_TAIL = re.compile(r"\$([\d,]+\.\d{2})\s*$")
    CHECK_TRIPLE = re.compile(
        r"(\d+\*?)\s+(\d{2}/\d{2}/\d{4})\s+\$([\d,]+\.\d{2})"
    )
    STMT_END = re.compile(r"Statement Ending\s+(\d{2}/\d{2}/\d{4})", re.I)

    lines: list[str] = []
    try:
        with pdfplumber.open(_io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                t = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                lines.extend(t.splitlines())
    except Exception as exc:
        log.warning("PE Bank parser: pdf open failed: %s", exc)
        return None

    stmt_end: Optional[datetime] = None
    for raw in lines[:25]:
        m = STMT_END.search(raw)
        if m:
            try:
                stmt_end = datetime.strptime(m.group(1), "%m/%d/%Y")
            except ValueError:
                pass
            break

    start_idx: Optional[int] = None
    for i, raw in enumerate(lines):
        if raw.strip() != "Deposits":
            continue
        for j in range(i + 1, min(i + 5, len(lines))):
            l2 = lines[j].strip()
            if not l2:
                continue
            if "Date" in l2 and "Description" in l2 and "Amount" in l2:
                start_idx = j + 1
                break
        if start_idx is not None:
            break

    if start_idx is None:
        log.warning("PE Bank parser: no Deposits section found")
        return None

    rows: list[dict] = []
    mode = "credit"
    expect_header = False

    def _is_noise(line: str) -> bool:
        ls = line.strip()
        if not ls:
            return True
        low = ls.lower()
        if "checking account statements" in low and not TXN_DATE.match(ls):
            return True
        if re.match(r"^[0-9A-F]{32}\s+\d{8}", ls):
            return True
        if "statement ending" in low and ls.startswith("TOTAL "):
            return True
        if ls.startswith("BUSINESS CHECKING") and "xxxxxx" in low:
            return True
        if ls == "(continued)":
            return True
        if ls.startswith("* Indicates skipped"):
            return True
        if re.fullmatch(r"\d{6,8}", ls):
            return True
        if re.match(r"^#\d", ls):
            return True
        if re.fullmatch(r"\d{13}", ls):
            return True
        return False

    def _section_tag(ls: str) -> "str | None":
        s = ls.strip()
        s = re.sub(r"\s*\(continued\)\s*$", "", s, flags=re.IGNORECASE).strip()
        low = s.lower()
        if low == "deposits":
            return "credit"
        if low == "electronic credits":
            return "credit"
        if low == "other credits":
            return "credit"
        if low == "electronic debits":
            return "debit"
        if low == "checks cleared":
            return "checks_hdr"
        if low == "daily balances":
            return "stop"
        return None

    def _summary_skip(date_s: str, desc: str) -> bool:
        dl = desc.lower()
        if any(
            x in dl
            for x in (
                "beginning balance",
                "ending balance",
                "credit(s) this period",
                "debit(s) this period",
                "minimum balance",
                "average ledger",
            )
        ):
            return True
        return False

    def _parse_checks_line(s: str) -> None:
        for m in CHECK_TRIPLE.finditer(s):
            ds = m.group(2)
            amt = float(m.group(3).replace(",", ""))
            nbr = m.group(1).rstrip("*")
            rows.append(
                {
                    "date": datetime.strptime(ds, "%m/%d/%Y"),
                    "description": f"Check {nbr}",
                    "amount": -abs(amt),
                    "balance": float("nan"),
                }
            )

    def _append_txn(date_s: str, desc: str, amt_raw: str, sign: int) -> None:
        if _summary_skip(date_s, desc):
            return
        amt = float(amt_raw.replace(",", ""))
        rows.append(
            {
                "date": datetime.strptime(date_s, "%m/%d/%Y"),
                "description": desc.strip(),
                "amount": abs(amt) * sign,
                "balance": float("nan"),
            }
        )

    i = start_idx
    while i < len(lines):
        raw = lines[i]
        ls = raw.strip()
        if _is_noise(ls):
            i += 1
            continue

        tag = _section_tag(ls)
        if tag == "stop":
            break
        if tag == "checks_hdr":
            i += 1
            while i < len(lines):
                ls2 = lines[i].strip()
                if _is_noise(ls2):
                    i += 1
                    continue
                tag2 = _section_tag(lines[i])
                if tag2 in ("credit", "debit", "checks_hdr", "stop"):
                    break
                if "Check Nbr" in ls2 and "Date" in ls2 and "Amount" in ls2:
                    i += 1
                    continue
                if CHECK_TRIPLE.search(ls2):
                    _parse_checks_line(lines[i])
                i += 1
            continue
        if tag == "credit":
            mode = "credit"
            expect_header = True
            i += 1
            continue
        if tag == "debit":
            mode = "debit"
            expect_header = True
            i += 1
            continue

        if expect_header:
            if "Date" in ls and "Amount" in ls:
                expect_header = False
                i += 1
                continue

        sign = 1 if mode == "credit" else -1

        m = TXN_DATE.match(ls)
        if not m:
            sm = re.match(r"^Service Charges\s+\$([\d,]+\.\d{2})\s*$", ls, re.I)
            if sm and stmt_end and rows:
                rows.append(
                    {
                        "date": stmt_end,
                        "description": "Service Charges",
                        "amount": -float(sm.group(1).replace(",", "")),
                        "balance": float("nan"),
                    }
                )
            elif rows and ls and not ls.startswith("Check Nbr"):
                rows[-1]["description"] = (rows[-1]["description"] + " " + ls).strip()
            i += 1
            continue

        date_s, rest = m.group(1), m.group(2).strip()
        am = AMT_TAIL.search(rest)
        if not am:
            i += 1
            continue
        desc = rest[: am.start()].strip()
        if _summary_skip(date_s, desc):
            i += 1
            continue
        _append_txn(date_s, desc, am.group(1), sign)
        i += 1

    for br in _pebank_collect_daily_balance_sentinels(lines):
        rows.append(
            {
                "date": br["date"],
                "amount": 0.0,
                "description": "__daily_balance_sentinel__",
                "balance": br["balance"],
            }
        )

    if not rows:
        return None

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df["amount"] = df["amount"].astype(float)
    df = df.sort_values("date").reset_index(drop=True)

    n_txn = int((df["description"] != "__daily_balance_sentinel__").sum())
    n_bal = int((df["description"] == "__daily_balance_sentinel__").sum())
    log.info(
        "PE Bank parser: %d transactions + %d daily balance points, %s → %s",
        n_txn,
        n_bal,
        df["date"].min().date(),
        df["date"].max().date(),
    )
    return df


def _parse_bofa_pdf(file_bytes: bytes) -> "pd.DataFrame | None":
    """
    Parser for Bank of America Business Advantage PDF statements.

    Layout (612-pt wide page)
    --------------------------
    Transactions (Deposits / Withdrawals / Service fees sections)
      Date        x ≈  36   format MM/DD/YY
      Description x ≈  91 – 519
      Amount      x ≥ 520   already signed in PDF (deposits +, debits/fees -)

    Checks section (two-column layout)
      Left  date  x ≈  36,  amount x ≈ 210–280
      Right date  x ≈ 341,  amount x ≥ 520

    Daily ledger balances (three-column grid)
      Col 1: date x≈36,   balance x≈140–215
      Col 2: date x≈221,  balance x≈325–400
      Col 3: date x≈407,  balance x≈510–590
    Balances can be negative (already carry a minus sign in the PDF).

    Period: "for Month D, YYYY to Month D, YYYY" on page 1.
    """
    import io as _io, re, logging
    from collections import defaultdict
    from datetime import timedelta as _timedelta
    try:
        import pdfplumber
    except ImportError:
        return None

    log = logging.getLogger(__name__)

    DATE_TXN_RE = re.compile(r"^(\d{2})/(\d{2})/(\d{2})$")   # MM/DD/YY
    DATE_BAL_RE = re.compile(r"^(\d{2})/(\d{2})$")            # MM/DD
    AMT_RE      = re.compile(r"^-?\$?([\d,]+\.\d{2})$")

    PERIOD_RE = re.compile(
        r"(?:for\s+)?(\w+\s+\d{1,2},\s*\d{4})\s+to\s+(\w+\s+\d{1,2},\s*\d{4})",
        re.IGNORECASE,
    )

    # Section constants
    SEC_DEPOSITS    = "deposits"
    SEC_WITHDRAWALS = "withdrawals"
    SEC_CHECKS      = "checks"
    SEC_FEES        = "fees"
    SEC_OTHER       = "other"

    # Words that start rows we must skip (non-transaction rows)
    SKIP_FIRST = {
        "Date", "Total", "Page", "LVG", "DBA", "Account", "#", "*",
        "There", "Check", "The", "As", "Your", "Customer", "Bank",
        "PULL:", "IMPORTANT", "How", "Updating", "Deposit", "Electronic",
        "For", "Reporting", "Direct", "©", "continued", "–",
        "Help", "Consider", "You", "Find", "Explore", "When",
        "be", "NEW:", "BKOFAMERICA",
    }

    rows: list[dict] = []
    stmt_year = None
    start_date = end_date = None

    def _parse_amount(text: str) -> float | None:
        m = AMT_RE.match(text)
        if not m:
            return None
        val = float(m.group(1).replace(",", ""))
        return -val if text.lstrip("$").startswith("-") else val

    def _resolve_txn_date(mmddyy: str) -> datetime | None:
        """MM/DD/YY → datetime, using century inferred from period."""
        m = DATE_TXN_RE.match(mmddyy)
        if not m:
            return None
        mo, da, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
        yr = 2000 + yy
        try:
            return datetime(yr, mo, da)
        except ValueError:
            return None

    def _resolve_bal_date(mmdd: str) -> datetime | None:
        """MM/DD → datetime using statement year (handles Jan wrap-around)."""
        m = DATE_BAL_RE.match(mmdd)
        if not m or stmt_year is None:
            return None
        mo, da = int(m.group(1)), int(m.group(2))
        for yr in (stmt_year, stmt_year - 1, stmt_year + 1):
            try:
                d = datetime(yr, mo, da)
                if start_date is None or (start_date - _timedelta(days=5)) <= d <= (end_date + _timedelta(days=5)):
                    return d
            except ValueError:
                pass
        try:
            return datetime(stmt_year, mo, da)
        except ValueError:
            return None

    try:
        with pdfplumber.open(_io.BytesIO(file_bytes)) as pdf:
            # ── Period ────────────────────────────────────────────────────
            for page in pdf.pages[:3]:
                text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                pm = PERIOD_RE.search(text)
                if pm:
                    try:
                        start_date = datetime.strptime(pm.group(1).strip(), "%B %d, %Y")
                        end_date   = datetime.strptime(pm.group(2).strip(), "%B %d, %Y")
                        stmt_year  = start_date.year
                    except ValueError:
                        pass
                    if stmt_year:
                        break

            if stmt_year is None:
                log.warning("BofA parser: could not determine statement year")
                return None

            current_section = SEC_OTHER

            # ── Page loop ────────────────────────────────────────────────
            for page in pdf.pages:
                words = page.extract_words(x_tolerance=3, y_tolerance=3)
                if not words:
                    continue

                # Find y-position where "Daily ledger balances" starts so we
                # can split the page into transactions vs balance grid.
                ledger_y = float("inf")
                for i, w in enumerate(words):
                    if (w["text"] == "Daily" and w["x0"] < 60
                            and i + 1 < len(words) and words[i + 1]["text"] == "ledger"):
                        ledger_y = w["top"]
                        break

                # Group into pseudo-rows by y-position (5-pt buckets)
                txn_rows: dict[int, list] = defaultdict(list)
                bal_rows: dict[int, list] = defaultdict(list)
                for w in words:
                    bucket = round(w["top"] / 5) * 5
                    if w["top"] < ledger_y:
                        txn_rows[bucket].append(w)
                    else:
                        bal_rows[bucket].append(w)

                # ── Transaction rows ──────────────────────────────────────
                for y_key in sorted(txn_rows):
                    rw = sorted(txn_rows[y_key], key=lambda w: w["x0"])
                    if not rw:
                        continue
                    first = rw[0]["text"]
                    row_text = " ".join(w["text"] for w in rw).lower()

                    # Section header detection
                    if "deposits and other credits" in row_text:
                        current_section = SEC_DEPOSITS
                        continue
                    if "withdrawals and other debits" in row_text:
                        current_section = SEC_WITHDRAWALS
                        continue
                    if first == "Checks" and len(rw) == 1:
                        current_section = SEC_CHECKS
                        continue
                    if "service fees" in row_text and len(rw) <= 3:
                        current_section = SEC_FEES
                        continue

                    # Skip non-transaction rows
                    if first in SKIP_FIRST:
                        continue
                    if row_text.startswith("total") or row_text.startswith("# of"):
                        continue

                    # ── Standard single-column sections ───────────────────
                    if current_section in (SEC_DEPOSITS, SEC_WITHDRAWALS, SEC_FEES):
                        date_ws = [w for w in rw if w["x0"] < 80 and DATE_TXN_RE.match(w["text"])]
                        amt_ws  = [w for w in rw if w["x0"] >= 520 and AMT_RE.match(w["text"])]
                        if date_ws and amt_ws:
                            d   = _resolve_txn_date(date_ws[0]["text"])
                            amt = _parse_amount(amt_ws[0]["text"])
                            if d and amt is not None:
                                desc_ws = [w for w in rw if 80 <= w["x0"] < 520]
                                desc    = " ".join(w["text"] for w in desc_ws).strip()
                                rows.append({"date": d, "amount": amt, "description": desc})

                    # ── Checks section (two-column layout) ────────────────
                    elif current_section == SEC_CHECKS:
                        # Left column: date x≈36, check# x≈90, amount x≈210–280
                        date_l = [w for w in rw if w["x0"] < 80 and DATE_TXN_RE.match(w["text"])]
                        amt_l  = [w for w in rw if 210 <= w["x0"] <= 300 and AMT_RE.match(w["text"])]
                        if date_l and amt_l:
                            d   = _resolve_txn_date(date_l[0]["text"])
                            amt = _parse_amount(amt_l[0]["text"])
                            if d and amt is not None:
                                chk_ws = [w for w in rw if 85 <= w["x0"] <= 210]
                                desc   = "Check #" + " ".join(w["text"] for w in chk_ws).strip()
                                rows.append({"date": d, "amount": amt, "description": desc})

                        # Right column: date x≈341, check# x≈395, amount x≥520
                        date_r = [w for w in rw if 330 <= w["x0"] <= 380 and DATE_TXN_RE.match(w["text"])]
                        amt_r  = [w for w in rw if w["x0"] >= 520 and AMT_RE.match(w["text"])]
                        if date_r and amt_r:
                            d   = _resolve_txn_date(date_r[0]["text"])
                            amt = _parse_amount(amt_r[0]["text"])
                            if d and amt is not None:
                                chk_ws = [w for w in rw if 390 <= w["x0"] <= 520]
                                desc   = "Check #" + " ".join(w["text"] for w in chk_ws).strip()
                                rows.append({"date": d, "amount": amt, "description": desc})

                # ── Daily ledger balance rows ─────────────────────────────
                for y_key in sorted(bal_rows):
                    rw = sorted(bal_rows[y_key], key=lambda w: w["x0"])
                    row_text = " ".join(w["text"] for w in rw)
                    # Skip section header and column header rows
                    if any(k in row_text for k in ("Daily", "ledger", "Balance", "Date", "($)")):
                        continue

                    # Three balance columns per row
                    for col_date_x, col_bal_min, col_bal_max in (
                        (36,  140, 215),
                        (221, 325, 400),
                        (407, 510, 590),
                    ):
                        date_ws = [w for w in rw
                                   if abs(w["x0"] - col_date_x) < 25
                                   and DATE_BAL_RE.match(w["text"])]
                        bal_ws  = [w for w in rw
                                   if col_bal_min <= w["x0"] <= col_bal_max
                                   and AMT_RE.match(w["text"])]
                        if date_ws and bal_ws:
                            d2  = _resolve_bal_date(date_ws[0]["text"])
                            bal = _parse_amount(bal_ws[0]["text"])
                            if d2 and bal is not None:
                                rows.append({
                                    "date":        d2,
                                    "amount":      0.0,
                                    "description": "__daily_balance_sentinel__",
                                    "balance":     bal,
                                })

    except Exception as exc:
        log.warning("BofA PDF parser error: %s", exc, exc_info=True)
        return None

    if not rows:
        log.warning("BofA parser: no transactions found")
        return None

    df = pd.DataFrame(rows)
    if "balance" not in df.columns:
        df["balance"] = float("nan")
    df["date"]   = pd.to_datetime(df["date"])
    df["amount"] = df["amount"].astype(float)
    df = df.sort_values("date").reset_index(drop=True)

    txn_count = int((df["description"] != "__daily_balance_sentinel__").sum())
    bal_count = int((df["description"] == "__daily_balance_sentinel__").sum())
    log.info(
        "BofA parser: %d transactions + %d daily balances, %s → %s",
        txn_count, bal_count,
        df["date"].min().date(), df["date"].max().date(),
    )
    return df


def _parse_wellsfargo_pdf(file_bytes: bytes) -> "pd.DataFrame | None":
    """
    Parser for Wells Fargo Business Checking PDF statements.

    Column layout (612-pt wide page)
    ---------------------------------
    Date           x ≈  62
    Check Number   x ≈ 117
    Description    x ≈ 150 – 395
    Deposits/Credits   x ≈ 400 – 455  → positive amounts
    Withdrawals/Debits x ≈ 455 – 525  → negative amounts
    Ending daily balance x ≥ 525      → balance sentinel

    Period: detected from "Month DD, YYYY Page N of M" header
    and "Beginning balance on M/D" / "Ending balance on M/D".
    """
    import io as _io, re, logging
    from collections import defaultdict
    try:
        import pdfplumber
    except ImportError:
        return None

    log = logging.getLogger(__name__)

    DATE_RE   = re.compile(r"^\d{1,2}/\d{1,2}$")
    AMT_RE    = re.compile(r"^\$?([\d,]+\.\d{2})$")
    # Page header pattern: "January 31, 2026 Page N of M"
    HDR_RE    = re.compile(
        r"(\w+)\s+(\d{1,2}),\s*(\d{4})\s+Page\s+\d+\s+of\s+\d+",
        re.IGNORECASE,
    )
    # Summary balance lines: "Beginning balance on 1/1" / "Ending balance on 1/31"
    BEG_RE = re.compile(r"beginning\s+balance\s+on\s+(\d{1,2}/\d{1,2})", re.I)
    END_RE = re.compile(r"ending\s+balance\s+on\s+(\d{1,2}/\d{1,2})",   re.I)

    # ── Column thresholds ──────────────────────────────────────────────────
    # Calibrated from actual statement words; dynamically updated when
    # the "Deposits/" and "Withdrawals/" header words are found.
    DEP_X_MIN  = 390   # left edge of Deposits/Credits column
    DEB_X_MIN  = 455   # left edge of Withdrawals/Debits column
    BAL_X_MIN  = 520   # left edge of Ending Daily Balance column

    stmt_year   = None
    start_md    = None  # "M/D" string for start
    end_md      = None  # "M/D" string for end
    start_date  = end_date = None

    def _resolve(md: str) -> "Optional[datetime]":
        if stmt_year is None:
            return None
        for yr in (stmt_year, stmt_year - 1, stmt_year + 1):
            try:
                d = datetime.strptime(f"{md}/{yr}", "%m/%d/%Y")
                if start_date is None or start_date <= d <= end_date:
                    return d
                if start_date is None:
                    return d
            except (ValueError, TypeError):
                pass
        try:
            return datetime.strptime(f"{md}/{stmt_year}", "%m/%d/%Y")
        except ValueError:
            return None

    rows: list[dict]         = []
    parsed_daily: list[dict] = []

    dep_col_x = deb_col_x = bal_col_x = None   # calibrated per page
    last_txn_sign = None                         # sign of the most recent transaction

    try:
        with pdfplumber.open(_io.BytesIO(file_bytes)) as pdf:
            full_text = ""
            for page in pdf.pages[:3]:
                full_text += (page.extract_text(x_tolerance=3, y_tolerance=3) or "") + "\n"

            # Extract year and period from full_text
            hm = HDR_RE.search(full_text)
            if hm:
                try:
                    stmt_year = int(hm.group(3))
                    end_month_str = hm.group(1)
                    end_day_str   = hm.group(2)
                    end_date = datetime.strptime(
                        f"{end_month_str} {end_day_str}, {stmt_year}", "%B %d, %Y")
                except ValueError:
                    pass

            bm = BEG_RE.search(full_text)
            em = END_RE.search(full_text)
            if bm and stmt_year:
                start_md = bm.group(1)
            if em and stmt_year:
                end_md = em.group(1)
            if start_md and stmt_year:
                try:
                    start_date = datetime.strptime(f"{start_md}/{stmt_year}", "%m/%d/%Y")
                except ValueError:
                    pass
            if end_md and stmt_year and end_date is None:
                try:
                    end_date = datetime.strptime(f"{end_md}/{stmt_year}", "%m/%d/%Y")
                except ValueError:
                    pass

            if stmt_year is None:
                log.warning("WellsFargo parser: could not determine statement year")
                return None

            # ── Process every page ─────────────────────────────────────────
            for page in pdf.pages:
                words = page.extract_words(x_tolerance=3, y_tolerance=3)
                if not words:
                    continue

                # Calibrate column x-positions from the TABLE HEADER ROW.
                # We look for "Deposits/" and "Withdrawals/" as anchors, then
                # require "Ending" to be at a LARGER x than the deposits header
                # (this avoids misidentifying "Ending balance on M/D" in the
                # account-summary block which appears at x≈64).
                for w in words:
                    t = w["text"]
                    if t == "Deposits/":
                        dep_col_x = w["x0"]
                    elif t == "Withdrawals/":
                        deb_col_x = w["x0"]
                    elif t == "Ending" and dep_col_x and w["x0"] > dep_col_x:
                        # This "Ending" is to the right of the Deposits column
                        # → it's the "Ending daily balance" column header.
                        bal_col_x = w["x0"]
                # Fall back to fixed thresholds if headers not found on this page
                dep_x = dep_col_x if dep_col_x else DEP_X_MIN
                deb_x = deb_col_x if deb_col_x else DEB_X_MIN
                bal_x = bal_col_x if bal_col_x else BAL_X_MIN

                # Find y-position of footer sections to skip:
                # "Items returned unpaid" and "Summary of checks written"
                # appear below the transaction table and have their own
                # date/amount columns that collide with ours.
                stop_y = float("inf")
                for w in words:
                    # "returned" at far-left margin signals the returned-items section
                    if w["text"].lower() in ("returned", "summary") and w["x0"] < 80:
                        stop_y = min(stop_y, w["top"] - 5)

                # Group words into rows by y-position
                row_map: dict[int, list] = defaultdict(list)
                for w in words:
                    if w["top"] < stop_y:
                        row_key = round(w["top"] / 4) * 4
                        row_map[row_key].append(w)

                for y_key in sorted(row_map):
                    rw = sorted(row_map[y_key], key=lambda w: w["x0"])

                    # Date word must be in the leftmost column
                    date_words = [w for w in rw if w["x0"] < 90 and DATE_RE.match(w["text"])]
                    if not date_words:
                        continue

                    mmdd = date_words[0]["text"]

                    # Skip the table column-header rows ("Date Description …")
                    desc_words = [w for w in rw
                                  if 90 <= w["x0"] < dep_x - 5
                                  and w["text"] not in ("Date", "Number")]
                    first_desc = desc_words[0]["text"] if desc_words else ""
                    if first_desc in ("Description", "Check", ""):
                        continue

                    # Skip "Totals" summary row
                    desc_text = " ".join(w["text"] for w in desc_words)
                    if desc_text.strip().lower().startswith("total"):
                        continue

                    # Categorise amount words by column
                    dep_amt = [w for w in rw if dep_x - 10 <= w["x0"] < deb_x - 5 and AMT_RE.match(w["text"])]
                    deb_amt = [w for w in rw if deb_x - 5  <= w["x0"] < bal_x - 5  and AMT_RE.match(w["text"])]
                    bal_amt = [w for w in rw if w["x0"] >= bal_x - 5               and AMT_RE.match(w["text"])]

                    d = _resolve(mmdd)
                    if not d:
                        continue

                    # Deposit
                    if dep_amt:
                        am = AMT_RE.match(dep_amt[0]["text"])
                        amt = float(am.group(1).replace(",", ""))
                        rows.append({"date": d, "amount": +amt, "description": desc_text})
                        last_txn_sign = +1

                    # Debit
                    if deb_amt:
                        am = AMT_RE.match(deb_amt[0]["text"])
                        amt = float(am.group(1).replace(",", ""))
                        rows.append({"date": d, "amount": -amt, "description": desc_text})
                        last_txn_sign = -1

                    # Ending daily balance sentinel
                    if bal_amt:
                        am = AMT_RE.match(bal_amt[0]["text"])
                        bal = float(am.group(1).replace(",", ""))
                        # Balance can be negative (overdrawn); the PDF shows it without
                        # a minus sign, but the summary context gives us the sign.
                        # Use the sign from the prior balance or leave to bfill logic.
                        rows.append({
                            "date":        d,
                            "amount":      0.0,
                            "description": "__daily_balance_sentinel__",
                            "balance":     bal,
                        })
                        parsed_daily.append({"date": d, "balance": bal})

    except Exception as exc:
        log.warning("WellsFargo PDF parser error: %s", exc)
        return None

    if not rows:
        log.warning("WellsFargo parser: no transactions found")
        return None

    df = pd.DataFrame(rows)
    if "balance" not in df.columns:
        df["balance"] = float("nan")
    df["date"]   = pd.to_datetime(df["date"])
    df["amount"] = df["amount"].astype(float)
    df = df.sort_values("date").reset_index(drop=True)

    txn_count = sum(1 for r in rows if r.get("description") != "__daily_balance_sentinel__")
    log.info(
        "WellsFargo parser: %d transactions + %d balance sentinels, %s → %s",
        txn_count, len(parsed_daily),
        df["date"].min().date(), df["date"].max().date(),
    )
    return df


def _parse_chase_pdf(file_bytes: bytes) -> "pd.DataFrame | None":
    """
    Parser for JPMorgan Chase Business Checking PDF statements.

    Uses pdfplumber's extract_words() per page so that the AMOUNT column
    (x > 450) is captured with full precision — extract_text() truncates
    long ACH description lines before the amount reaches it.

    Layout
    ------
    • Left column  x < 60  : MM/DD dates + *start*/*end* section markers
    • Mid  column  60–450  : transaction descriptions
    • Right column x > 450 : dollar amounts (always positive in the PDF)

    Section state (*start* markers in left column determine sign)
    -------------------------------------------------------------
    • *start*deposits and additions   → sign = +1
    • *start*atm / *start*electronic / *start*other / *start*fees → sign = -1
    • *start*daily                    → daily-balance mode
    """
    import io as _io, logging, re
    try:
        import pdfplumber
    except ImportError:
        return None

    log = logging.getLogger(__name__)

    DATE_RE   = re.compile(r"^\d{1,2}/\d{1,2}$")
    AMT_RE    = re.compile(r"^\$?([\d,]+\.\d{2})$")
    PERIOD_RE = re.compile(
        r"(\w+\s+\d{1,2},\s*\d{4})\s*through\s*(\w+\s+\d{1,2},\s*\d{4})",
        re.IGNORECASE,
    )

    start_date = end_date = None
    start_year = end_year = None

    def _resolve(mmdd: str) -> "Optional[datetime]":
        if start_year is None:
            return None
        for yr in (start_year, end_year):
            try:
                d = datetime.strptime(f"{mmdd}/{yr}", "%m/%d/%Y")
                if start_date <= d <= end_date:
                    return d
            except (ValueError, TypeError):
                pass
        try:
            return datetime.strptime(f"{mmdd}/{start_year}", "%m/%d/%Y")
        except ValueError:
            return None

    rows: list[dict]         = []
    parsed_daily: list[dict] = []
    current_sign             = +1   # deposits come first
    in_balance               = False

    try:
        with pdfplumber.open(_io.BytesIO(file_bytes)) as pdf:
            for page_num, page in enumerate(pdf.pages):
                words = page.extract_words(x_tolerance=3, y_tolerance=3)
                if not words:
                    continue

                # ── Extract period from page 1 ────────────────────────────
                if page_num == 0 and start_date is None:
                    # Reconstruct line text from words at the same y-level
                    page_text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                    pm = PERIOD_RE.search(page_text)
                    if pm:
                        try:
                            start_date = datetime.strptime(pm.group(1).strip(), "%B %d, %Y")
                            end_date   = datetime.strptime(pm.group(2).strip(), "%B %d, %Y")
                            start_year = start_date.year
                            end_year   = end_date.year
                        except ValueError:
                            pass
                    if start_date is None:
                        # Try to find period text differently (no-space "through")
                        for w in words:
                            t = w["text"]
                            if "through" in t.lower() and len(t) > 15:
                                pm2 = re.search(
                                    r"(\w+)\s*(\d{1,2}),\s*(\d{4})\s*through\s*(\w+)\s*(\d{1,2}),\s*(\d{4})",
                                    t, re.IGNORECASE
                                )
                                if pm2:
                                    try:
                                        start_date = datetime.strptime(
                                            f"{pm2.group(1)} {pm2.group(2)}, {pm2.group(3)}", "%B %d, %Y")
                                        end_date   = datetime.strptime(
                                            f"{pm2.group(4)} {pm2.group(5)}, {pm2.group(6)}", "%B %d, %Y")
                                        start_year = start_date.year
                                        end_year   = end_date.year
                                    except ValueError:
                                        pass
                                    break

                if start_date is None:
                    log.warning("Chase parser: period not found yet on page %d", page_num + 1)

                # ── Group words into rows by y-position (tolerance = 5px) ─
                from collections import defaultdict
                row_map: dict[int, list] = defaultdict(list)
                for w in words:
                    row_key = round(w["top"] / 5) * 5   # snap to 5-px grid
                    row_map[row_key].append(w)

                for y_key in sorted(row_map):
                    row_words = sorted(row_map[y_key], key=lambda w: w["x0"])

                    # Categorise words by column
                    left_words  = [w for w in row_words if w["x0"] < 60]
                    mid_words   = [w for w in row_words if 60 <= w["x0"] < 450]
                    right_words = [w for w in row_words if w["x0"] >= 450]

                    left_text = " ".join(w["text"] for w in left_words).lower()

                    # ── Section state updates ────────────────────────────
                    if "*start*deposits" in left_text:
                        current_sign = +1
                        in_balance   = False
                        continue
                    if any(kw in left_text for kw in (
                        "*start*atm", "*start*electronic",
                        "*start*other", "*start*fees",
                    )):
                        current_sign = -1
                        in_balance   = False
                        continue
                    if "*start*daily" in left_text:
                        in_balance = True
                        continue
                    # Skip *end* markers and noise
                    if "*end*" in left_text or "*start*" in left_text:
                        continue

                    # ── Daily ending balance parsing ──────────────────────
                    if in_balance:
                        # Row may contain several MM/DD + AMOUNT pairs
                        all_row = sorted(row_words, key=lambda w: w["x0"])
                        i = 0
                        while i < len(all_row):
                            w = all_row[i]
                            if DATE_RE.match(w["text"]):
                                # Look for adjacent amount word
                                for j in range(i + 1, min(i + 4, len(all_row))):
                                    am = AMT_RE.match(all_row[j]["text"])
                                    if am:
                                        d = _resolve(w["text"])
                                        if d:
                                            parsed_daily.append({
                                                "date":    d,
                                                "balance": float(am.group(1).replace(",", "")),
                                            })
                                        i = j  # skip past the amount
                                        break
                            i += 1
                        continue

                    # ── Transaction rows ─────────────────────────────────
                    # Must have a date word in the left column
                    date_words = [w for w in left_words if DATE_RE.match(w["text"])]
                    if not date_words:
                        continue

                    # Must have an amount in the right column
                    amt_words = [w for w in right_words if AMT_RE.match(w["text"])]
                    if not amt_words:
                        continue

                    mmdd = date_words[0]["text"]
                    d    = _resolve(mmdd)
                    if not d:
                        continue

                    amt_str = amt_words[0]["text"].replace("$", "").replace(",", "")
                    amt     = float(amt_str) * current_sign
                    desc    = " ".join(w["text"] for w in mid_words).strip()

                    rows.append({"date": d, "amount": amt, "description": desc})

    except Exception as exc:
        log.warning("Chase PDF parser error: %s", exc)
        return None

    if not rows:
        log.warning("Chase parser: no transactions found")
        return None

    # Add daily-balance sentinel rows for balance reconstruction
    for entry in parsed_daily:
        rows.append({
            "date":        entry["date"],
            "amount":      0.0,
            "description": "__daily_balance_sentinel__",
            "balance":     entry["balance"],
        })

    df = pd.DataFrame(rows)
    if "balance" not in df.columns:
        df["balance"] = float("nan")
    df["date"]   = pd.to_datetime(df["date"])
    df["amount"] = df["amount"].astype(float)
    df = df.sort_values("date").reset_index(drop=True)

    txn_count = sum(1 for r in rows if r.get("description") != "__daily_balance_sentinel__")
    log.info(
        "Chase parser: %d transactions + %d balance sentinels, %s → %s",
        txn_count, len(parsed_daily),
        df["date"].min().date(), df["date"].max().date(),
    )
    return df


def _parse_pnc_text(text: str) -> "pd.DataFrame | None":
    """
    Parser for PNC Bank Business Checking PDF statements.

    PNC layout:
      - Header: "For the Period MM/DD/YYYY to MM/DD/YYYY"
      - Balance Summary (skip – summary totals, not individual txns)
      - Daily Balance section: selected dates only (forward-fill gaps)
      - Activity Detail section:
          Deposits and Other Additions  → sub-sections: ACH Additions, Other Additions
          Checks and Other Deductions   → sub-sections: Checks, ATM/Misc., ACH Deductions,
                                          Service Charges and Fees, Other Deductions

    Transaction line formats
      - Most:   MM/DD  AMOUNT  DESCRIPTION  [REFERENCE]
      - Checks: MM/DD  CHECK_NUM  [*]  AMOUNT  [REFERENCE]
    """
    import re, logging
    log = logging.getLogger(__name__)

    # ── 1. Extract statement year(s) ────────────────────────────────────────
    period_re = re.compile(
        r"For the Period\s+(\d{1,2}/\d{1,2}/(\d{4}))\s+to\s+(\d{1,2}/\d{1,2}/(\d{4}))",
        re.IGNORECASE,
    )
    pm = period_re.search(text)
    if not pm:
        log.warning("PNC parser: could not find period header")
        return None

    start_year = int(pm.group(2))
    end_year   = int(pm.group(4))
    start_date = datetime.strptime(pm.group(1), "%m/%d/%Y")
    end_date   = datetime.strptime(pm.group(3), "%m/%d/%Y")

    def _resolve_date(mmdd: str) -> "Optional[datetime]":
        """Pick the correct year for a MM/DD string within the statement period."""
        for yr in (start_year, end_year):
            try:
                d = datetime.strptime(f"{mmdd}/{yr}", "%m/%d/%Y")
                if start_date <= d <= end_date:
                    return d
            except ValueError:
                pass
        # fall back
        try:
            return datetime.strptime(f"{mmdd}/{start_year}", "%m/%d/%Y")
        except ValueError:
            return None

    lines = text.splitlines()

    # ── 2. Parse Daily Balance section (for balance reconstruction later) ──
    # We record it but don't turn it into transactions.
    daily_bal_section = False
    daily_bal_re = re.compile(r"(\d{1,2}/\d{1,2})\s+([\d,]+\.\d{2})")
    parsed_daily: list[dict] = []

    # ── 3. Parse Activity Detail section ──────────────────────────────────
    # Deposit sub-section names
    DEPOSIT_SECTIONS = {
        "ach additions", "other additions", "deposited items",
    }
    # Debit sub-section names
    DEBIT_SECTIONS = {
        "checks and substitute checks", "checks", "atm/misc. debit card transactions",
        "ach deductions", "service charges and fees", "other deductions",
        "atm and misc debit", "debit card transactions",
    }

    in_daily_balance  = False
    in_activity       = False
    current_sign      = None   # +1 or -1
    rows: list[dict]  = []

    # Regex for most transaction lines: MM/DD  AMOUNT  description...
    txn_re      = re.compile(r"^(\d{1,2}/\d{1,2})\s+([\d,]+\.\d{2})\s+(.*)")
    # Regex for individual check entries (used with findall for multi-check lines)
    check_findall_re = re.compile(r"(\d{1,2}/\d{1,2})\s+(\d{3,6})\s*\*?\s*([\d,]+\.\d{2})")

    in_checks_section = False

    # Group headers — set the context but don't change sign yet
    DEPOSIT_GROUP_HEADERS = {"deposits and other additions"}
    DEBIT_GROUP_HEADERS   = {"checks and other deductions"}

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        ll = line.lower()

        # ── Detect section headers ──
        if "daily balance" in ll and not in_activity:
            in_daily_balance = True
            in_activity = False
            in_checks_section = False
            continue

        if ll.startswith("activity detail"):
            in_daily_balance = False
            in_activity = True
            in_checks_section = False
            continue

        # "Detail of Services Used" marks end of activity
        if "detail of services used" in ll:
            in_daily_balance = False
            in_activity = False
            continue

        # ── Inside Daily Balance: record but don't add to transactions ──
        if in_daily_balance:
            # PNC puts multiple date/balance pairs on one line
            for m in daily_bal_re.finditer(line):
                d = _resolve_date(m.group(1))
                if d:
                    parsed_daily.append({"date": d, "balance": float(m.group(2).replace(",", ""))})
            continue

        # ── Inside Activity Detail ──
        if in_activity:
            # Skip column-header lines
            if ll in ("date", "posted", "amount", "transaction", "description",
                      "reference", "number", "date posted amount transaction"):
                continue
            if ll.startswith("date") and "posted" in ll:
                continue
            if ll.startswith("page ") or ll.startswith("-- "):
                continue

            # Group header lines (just re-context, no sign change yet)
            if any(ll.startswith(h) for h in DEPOSIT_GROUP_HEADERS):
                continue
            if any(ll.startswith(h) for h in DEBIT_GROUP_HEADERS):
                continue

            # Sub-section detection — these actually set the sign
            found_section = False
            for ds in DEPOSIT_SECTIONS:
                if ll.startswith(ds):
                    current_sign = +1
                    in_checks_section = False
                    found_section = True
                    break
            if not found_section:
                for ds in DEBIT_SECTIONS:
                    if ll.startswith(ds):
                        current_sign = -1
                        in_checks_section = ds.startswith("checks")
                        found_section = True
                        break
            if found_section:
                continue

            if current_sign is None:
                continue

            # ── Try to parse a transaction line ──
            # Checks: MM/DD  CHECK_NUM  [*]  AMOUNT  (possibly multiple per line)
            if in_checks_section:
                check_matches = check_findall_re.findall(line)
                if check_matches:
                    for mmdd, chk_num, amt_str in check_matches:
                        d = _resolve_date(mmdd)
                        if d:
                            amt = float(amt_str.replace(",", "")) * current_sign
                            rows.append({"date": d, "amount": amt,
                                         "description": f"Check {chk_num}"})
                    continue

            # General: MM/DD  AMOUNT  DESCRIPTION  [REF]
            tm = txn_re.match(line)
            if tm:
                d = _resolve_date(tm.group(1))
                if d:
                    amt  = float(tm.group(2).replace(",", "")) * current_sign
                    desc = tm.group(3).strip()
                    # Strip trailing long reference number (≥10 alphanum chars)
                    desc = re.sub(r"\s+[A-Z0-9]{10,}$", "", desc).strip()
                    rows.append({"date": d, "amount": amt, "description": desc})

    if not rows:
        log.warning("PNC parser: no transactions found")
        return None

    # ── 4. Add daily-balance sentinel rows so _reconstruct_daily_balances  ──
    # can use the actual known balances from the Daily Balance section instead
    # of cumsum-from-zero. Zero-amount sentinel rows are ignored by all metric
    # calculations (which filter by amount > 0 or amount < 0).
    if parsed_daily:
        for entry in parsed_daily:
            rows.append({
                "date":        entry["date"],
                "amount":      0.0,
                "description": "__daily_balance_sentinel__",
                "balance":     entry["balance"],
            })

    df = pd.DataFrame(rows)
    # Ensure balance column exists even when there are no sentinels
    if "balance" not in df.columns:
        df["balance"] = float("nan")

    df["date"]   = pd.to_datetime(df["date"])
    df["amount"] = df["amount"].astype(float)
    df = df.sort_values("date").reset_index(drop=True)
    log.info("PNC parser: %d transactions + %d balance sentinels, %s → %s",
             len([r for r in rows if r.get("description") != "__daily_balance_sentinel__"]),
             len(parsed_daily),
             df["date"].min().date(), df["date"].max().date())
    return df


def _parse_zions_text(text: str) -> "pd.DataFrame | None":
    """
    Parser for Zions Bank (and similar) statement PDFs.

    These statements have:
      - MM/DD dates (year derived from the statement header)
      - Separate DEPOSITS/CREDITS and CHARGES/DEBITS sections
      - Trailing minus sign for debits: e.g. "8,000.00-"
      - Optional DAILY BALANCE section with date→balance pairs
    """
    lines = text.splitlines()

    # --- Detect statement year from header lines ---
    YEAR_RE = re.compile(r"\b(20\d{2})\b")
    statement_year: str = str(datetime.now().year)
    for line in lines[:30]:
        m = YEAR_RE.search(line)
        if m:
            statement_year = m.group(1)
            break
    logger.info("Zions parser: detected statement year %s", statement_year)

    # --- Parse DAILY BALANCE section → {MM/DD: balance} ---
    daily_bal: dict[str, float] = {}
    # Pattern: "01/01  $24,487.06" possibly repeated across columns
    BAL_PAIR_RE = re.compile(
        r"(\d{1,2}/\d{1,2})\s+\$?([\d,]+\.\d{2})"
    )
    in_daily = False
    for line in lines:
        if "DAILY BALANCE" in line.upper():
            in_daily = True
        if in_daily:
            for m in BAL_PAIR_RE.finditer(line):
                date_str = m.group(1)
                bal_val  = float(m.group(2).replace(",", ""))
                daily_bal[date_str] = bal_val

    # --- Line pattern for transactions ---
    # Zions format: "MM/DD  MM/DD  AMOUNT  DESCRIPTION"
    # where AMOUNT may be "8,000.00-" (debit) or "323.21" (credit)
    TXN_RE = re.compile(
        r"^(\d{1,2}/\d{1,2})"           # posting date  MM/DD
        r"\s+"
        r"(\d{1,2}/\d{1,2})"            # effective date MM/DD
        r"\s+"
        r"([\d,]+\.\d{2}-?)"            # amount (trailing - for debits)
        r"\s+"
        r"(.+)$"                         # description
    )

    rows: list[dict] = []
    current_section: str = "UNKNOWN"

    for line in lines:
        line = line.strip()
        upper = line.upper()

        # Track which section we're in
        if "DEPOSITS/CREDITS" in upper or "DEPOSITS" in upper and "CREDIT" in upper:
            current_section = "DEPOSIT"
            continue
        if "CHARGES/DEBITS" in upper or "WITHDRAWALS/DEBITS" in upper:
            current_section = "DEBIT"
            continue
        if "CHECKS PROCESSED" in upper or "DAILY BALANCE" in upper or "ACTIVITY COUNT" in upper:
            current_section = "OTHER"
            continue

        if current_section not in ("DEPOSIT", "DEBIT"):
            continue

        m = TXN_RE.match(line)
        if not m:
            continue

        posting_date_str = m.group(1)
        raw_amount       = m.group(3)
        description      = m.group(4).strip()

        # Parse amount — trailing "-" means debit
        is_negative = raw_amount.endswith("-")
        amount_clean = raw_amount.rstrip("-").replace(",", "")
        try:
            amount = float(amount_clean)
        except ValueError:
            continue
        if is_negative or current_section == "DEBIT":
            amount = -abs(amount)
        else:
            amount = abs(amount)

        # Build full date: MM/DD + year
        month, day = posting_date_str.split("/")
        full_date = f"{statement_year}-{month.zfill(2)}-{day.zfill(2)}"

        # Look up balance from daily balance table
        balance = daily_bal.get(posting_date_str, None)

        rows.append({
            "date":        full_date,
            "description": description,
            "amount":      amount,
            "balance":     balance,
        })

    if not rows:
        return None

    logger.info("Zions text parser found %d transactions", len(rows))
    df = pd.DataFrame(rows)
    return df


def _parse_truist_pdf(file_bytes: bytes) -> "pd.DataFrame | None":
    """
    Parser for Truist Bank (Business / Simple Business Checking) PDF statements.

    Truist layout (all pages):
      - Header: "For MM/DD/YYYY" gives the statement period end date (→ year)
      - Account summary block (skip — summary totals only)
      - Optional Checks section:  DATE CHECK # AMOUNT($)
      - Other withdrawals, debits and service charges  → negative amounts
      - Deposits, credits and interest                 → positive amounts

    Each transaction line format:
      MM/DD  DESCRIPTION … AMOUNT
      e.g.  02/02 DEBIT CARD PURCHASE STARBUCKS STORE 02 01-29 TRINITY FL 3739 17.00
            02/02 TRUIST ONLINE TRANSFER MOBILE TO ****7797 - 200.00
            01/22 14570383 700.00  (check)
    """
    log = logging.getLogger(__name__)

    try:
        full_text = _extract_full_pdf_text(file_bytes)
    except Exception as exc:
        log.warning("Truist parser: could not extract text: %s", exc)
        return None

    lines = full_text.splitlines()

    # 1. Extract statement year from "For MM/DD/YYYY"
    period_re = re.compile(r"\bFor\s+\d{1,2}/\d{1,2}/(\d{4})\b", re.IGNORECASE)
    year = datetime.now().year
    for line in lines[:60]:
        m = period_re.search(line)
        if m:
            year = int(m.group(1))
            break
    log.info("Truist parser: detected statement year %d", year)

    # 2. Transaction line: MM/DD  <description (greedy)>  AMOUNT
    # Greedy middle group ensures the trailing float is always the amount.
    TXN_RE = re.compile(r"^(\d{1,2}/\d{2})\s+(.+)\s+([\d,]+\.\d{2})\s*$")

    # Section headers — pdfplumber sometimes compresses whitespace/commas out,
    # so match flexibly with regex (e.g. "Otherwithdrawals,debitsandservice…")
    DEBIT_SECTION_RE  = re.compile(r"^other\s*withdrawals", re.IGNORECASE)
    CREDIT_SECTION_RE = re.compile(r"^deposits,?\s*credits", re.IGNORECASE)

    current_sign: "int | None" = None
    rows: list[dict] = []

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        ll = line.lower()

        # Section header detection — set sign context
        if DEBIT_SECTION_RE.match(line) or ll == "checks":
            current_sign = -1
            continue
        if CREDIT_SECTION_RE.match(line):
            current_sign = +1
            continue

        # Not yet in a transaction section
        if current_sign is None:
            continue

        m = TXN_RE.match(line)
        if not m:
            continue

        mmdd    = m.group(1)
        desc    = m.group(2).strip().rstrip(" -").strip()
        amt_str = m.group(3)

        try:
            amt = float(amt_str.replace(",", "")) * current_sign
        except ValueError:
            continue

        month, day = mmdd.split("/")
        try:
            dt = datetime(year, int(month), int(day))
        except ValueError:
            continue

        rows.append({"date": dt, "description": desc, "amount": amt})

    if not rows:
        log.warning("Truist parser: no transactions found")
        return None

    df = pd.DataFrame(rows)
    df["date"]    = pd.to_datetime(df["date"])
    df["amount"]  = df["amount"].astype(float)
    df["balance"] = float("nan")
    df = df.sort_values("date").reset_index(drop=True)
    log.info(
        "Truist parser: %d transactions, %s → %s",
        len(df), df["date"].min().date(), df["date"].max().date(),
    )
    return df


def _parse_text_lines_generic(text: str) -> pd.DataFrame | None:
    """
    Generic last-resort text parser.
    Looks for any line containing a date + at least one dollar amount.
    """
    # Try to find the statement year
    YEAR_RE = re.compile(r"\b(20\d{2})\b")
    statement_year = str(datetime.now().year)
    for line in text.splitlines()[:30]:
        m = YEAR_RE.search(line)
        if m:
            statement_year = m.group(1)
            break

    # Accept both MM/DD and MM/DD/YYYY
    DATE_RE_FULL = re.compile(
        r"\b(\d{1,2}/\d{1,2}/\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4})\b"
    )
    DATE_RE_SHORT = re.compile(r"\b(\d{1,2}/\d{1,2})\b")
    AMT_RE = re.compile(r"([\d,]+\.\d{2}-?)")

    parsed = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue

        date_str = None
        full_m = DATE_RE_FULL.search(line)
        if full_m:
            date_str = full_m.group(1)
        else:
            short_m = DATE_RE_SHORT.search(line)
            if short_m:
                mm_dd = short_m.group(1)
                month, day = mm_dd.split("/")
                date_str = f"{statement_year}-{month.zfill(2)}-{day.zfill(2)}"

        if not date_str:
            continue

        amounts = AMT_RE.findall(line)
        if not amounts:
            continue

        numeric = []
        for a in amounts:
            neg = a.endswith("-")
            try:
                v = float(a.rstrip("-").replace(",", ""))
                numeric.append(-v if neg else v)
            except ValueError:
                pass

        if not numeric:
            continue

        # Remove date and amounts from line to get description
        desc = DATE_RE_FULL.sub("", DATE_RE_SHORT.sub("", line))
        desc = AMT_RE.sub("", desc)
        desc = re.sub(r"\s{2,}", " ", desc).strip(" |-_.$")

        amount  = numeric[-2] if len(numeric) >= 2 else numeric[0]
        balance = numeric[-1] if len(numeric) >= 2 else None

        parsed.append({
            "date":        date_str,
            "description": desc or "Transaction",
            "amount":      amount,
            "balance":     balance,
        })

    if not parsed:
        return None

    logger.info("Generic text parser found %d transactions", len(parsed))
    return pd.DataFrame(parsed)


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ensure the DataFrame has exactly these columns with correct dtypes:
      date (datetime64), description (str), amount (float), balance (float or NaN)
    Drops rows that are completely empty or have unparseable dates.
    """
    # Date
    df["date"] = pd.to_datetime(df["date"], format="mixed", dayfirst=False, errors="coerce")
    df = df.dropna(subset=["date"])
    df = df.sort_values("date").reset_index(drop=True)

    # Description
    df["description"] = df["description"].fillna("").astype(str).str.strip()

    # Amount – strip currency symbols and commas
    df["amount"] = (
        df["amount"]
        .astype(str)
        .str.replace(r"[,$\s]", "", regex=True)
        .str.replace(r"\((.+)\)", r"-\1", regex=True)  # (1,234) → -1234
        .pipe(pd.to_numeric, errors="coerce")
    )
    df = df.dropna(subset=["amount"])

    # Balance (optional)
    if "balance" in df.columns:
        df["balance"] = (
            df["balance"]
            .astype(str)
            .str.replace(r"[,$\s]", "", regex=True)
            .str.replace(r"\((.+)\)", r"-\1", regex=True)
            .pipe(pd.to_numeric, errors="coerce")
        )
    else:
        df["balance"] = np.nan

    return df[["date", "description", "amount", "balance"]]


# ---------------------------------------------------------------------------
# Daily balance reconstruction
# ---------------------------------------------------------------------------

def _reconstruct_daily_balances(df: pd.DataFrame) -> pd.Series:
    """
    Build a complete day-by-day balance series from the transaction DataFrame.

    Strategy:
      - If balance column is present and mostly non-null → use it directly,
        indexed by date, forward-filled across calendar days.
      - If balance is missing → assume opening balance of 0 and cumsum amounts.
    """
    start = df["date"].min().date()
    end   = df["date"].max().date()
    all_days = pd.date_range(start, end, freq="D")

    has_balance = "balance" in df.columns and df["balance"].notna().any()

    if has_balance:
        # Use last known balance per day (forward-fill gaps)
        daily = (
            df.dropna(subset=["balance"])
              .groupby(df["date"].dt.date)["balance"]
              .last()
        )
        daily.index = pd.to_datetime(daily.index)
        daily = daily.reindex(all_days).ffill()
        # If there are still gaps at the start, back-fill from the earliest known
        daily = daily.bfill()
    else:
        # Reconstruct via cumulative sum (no balance data available)
        logger.warning("Balance column missing/sparse – reconstructing via cumsum (less accurate)")
        daily_delta = df.groupby(df["date"].dt.date)["amount"].sum()
        daily_delta.index = pd.to_datetime(daily_delta.index)
        daily_delta = daily_delta.reindex(all_days, fill_value=0)
        daily = daily_delta.cumsum()

    return daily.rename("balance")


# ---------------------------------------------------------------------------
# Metric calculations
# ---------------------------------------------------------------------------

def _contains_any(text: str, keywords: list[str]) -> bool:
    """
    Returns True if any keyword appears in text.
    Uses whole-word (regex \b) matching so that short keywords like 'nsf'
    do NOT match substrings inside larger words (e.g. 'transfer').
    Multi-word phrases (e.g. 'overdraft fee') are matched as a phrase with
    word boundaries on the outer edges only.
    """
    import re as _re
    t = text.lower()
    for kw in keywords:
        pattern = r"\b" + _re.escape(kw) + r"\b"
        if _re.search(pattern, t):
            return True
    return False


def _compute_metrics(df: pd.DataFrame, daily_balances: pd.Series) -> dict:
    """
    Compute all CRM metrics from normalised transactions and daily balances.
    Returns a plain Python dict (JSON-serialisable primitives only).
    """
    metrics: dict = {}

    # ---- Period --------------------------------------------------------
    metrics["period_start"] = df["date"].min().strftime("%Y-%m-%d")
    metrics["period_end"]   = df["date"].max().strftime("%Y-%m-%d")
    metrics["period_label"] = (
        f"{df['date'].min().strftime('%B %d, %Y')} – {df['date'].max().strftime('%B %d, %Y')}"
    )

    # ---- Balance stats -------------------------------------------------
    metrics["ending_balance"]    = round(float(daily_balances.iloc[-1]), 2)
    metrics["avg_daily_balance"] = round(float(daily_balances.mean()), 2)
    metrics["negative_days"]     = int((daily_balances < 0).sum())
    metrics["min_balance"]       = round(float(daily_balances.min()), 2)
    metrics["max_balance"]       = round(float(daily_balances.max()), 2)

    # ---- Deposits ------------------------------------------------------
    deposits = df[df["amount"] > 0].copy()
    metrics["total_deposits"] = round(float(deposits["amount"].sum()), 2)
    metrics["deposit_count"]  = int(len(deposits))

    # True deposits: exclude noise keywords
    if deposits.empty:
        true_deposits = deposits.copy()
    else:
        true_dep_mask = ~deposits["description"].apply(lambda d: _contains_any(d, EXCLUDE_KEYWORDS))
        true_deposits = deposits[true_dep_mask]
    metrics["true_deposits"]      = round(float(true_deposits["amount"].sum()), 2)
    metrics["true_deposit_count"] = int(len(true_deposits))

    # ---- Monthly revenue (true deposits by month) ----------------------
    if not true_deposits.empty:
        monthly = (
            true_deposits.groupby(true_deposits["date"].dt.to_period("M"))["amount"]
            .sum()
            .rename_axis("month")
            .reset_index()
        )
        monthly["month"] = monthly["month"].astype(str)
        monthly["amount"] = monthly["amount"].round(2)
        metrics["monthly_revenue"] = monthly.to_dict("records")
    else:
        metrics["monthly_revenue"] = []

    # ---- NSF / overdraft fees ------------------------------------------
    nsf_mask = (
        df["description"].apply(lambda d: _contains_any(d, NSF_KEYWORDS))
        & (df["amount"] < 0)
    )
    nsf_rows = df[nsf_mask]
    metrics["nsf_count"] = int(len(nsf_rows))
    metrics["nsf_total"] = round(float(nsf_rows["amount"].sum()), 2)

    # ---- Other loans ---------------------------------------------------
    loan_mask = df["description"].apply(lambda d: _contains_any(d, LOAN_KEYWORDS))
    loan_rows = df[loan_mask].copy()

    def _loan_type(desc: str) -> str:
        desc_lower = desc.lower()
        type_map = [
            ("ondeck",           "OnDeck Capital"),
            ("on deck",          "OnDeck Capital"),
            ("kabbage",          "Kabbage"),
            ("fundbox",          "Fundbox"),
            ("bluevine",         "BlueVine"),
            ("clearco",          "Clearco"),
            ("capchase",         "Capchase"),
            ("credibly",         "Credibly"),
            ("can capital",      "CAN Capital"),
            ("rapid finance",    "Rapid Finance"),
            ("forward financing","Forward Financing"),
            ("greenbox",         "Greenbox Capital"),
            ("libertas",         "Libertas Funding"),
            ("stripe capital",   "Stripe Capital"),
            ("square capital",   "Square Capital"),
            ("shopify capital",  "Shopify Capital"),
            ("paypal capital",   "PayPal Capital"),
            ("amazon lending",   "Amazon Lending"),
            ("sba",              "SBA Loan"),
            ("ppp",              "PPP Loan"),
            ("mortgage",         "Mortgage"),
            ("line of credit",   "Line of Credit"),
            ("mca",              "Merchant Cash Advance"),
            ("merchant cash",    "Merchant Cash Advance"),
            ("advance",          "Cash Advance"),
            ("factor",           "Factoring"),
            ("aspire funding",   "Aspire Funding"),
            ("aspire capital",   "Aspire Funding"),
            ("aspire",          "Aspire Funding"),
            ("financing",        "Financing"),
            ("lender",           "Loan"),
            ("loan",             "Loan"),
        ]
        for kw, label in type_map:
            if kw in desc_lower:
                return label
        return "Loan/Advance"

    if not loan_rows.empty:
        loan_rows["loan_type"] = loan_rows["description"].apply(_loan_type)
        loans_summary = (
            loan_rows.groupby("loan_type")
            .agg(total=("amount", "sum"), count=("amount", "count"))
            .reset_index()
        )
        loans_summary["total"] = loans_summary["total"].round(2)
        metrics["loans"] = loans_summary.to_dict("records")
    else:
        metrics["loans"] = []

    # ---- Withdrawals / debits ------------------------------------------
    debits = df[df["amount"] < 0]
    metrics["total_withdrawals"] = round(float(debits["amount"].sum()), 2)
    metrics["withdrawal_count"]  = int(len(debits))

    # ---- Monthly averages ----------------------------------------------
    # Use only months that contain REAL transactions (amount != 0).
    # Sentinel rows (amount == 0, used for balance anchoring) must not count
    # as active months, otherwise gap months between statements are included
    # and gap-months filled by forward-fill would pollute every average.
    real_txns  = df[df["amount"] != 0]
    all_months = real_txns["date"].dt.to_period("M").unique()
    num_months = max(len(all_months), 1)

    metrics["num_months"] = num_months

    # Avg monthly total deposits — reindex to all statement months so that
    # months with zero deposits are counted as 0, not skipped.
    dep_by_month = (
        deposits.groupby(deposits["date"].dt.to_period("M"))["amount"].sum()
        if not deposits.empty else pd.Series(dtype=float)
    )
    dep_by_month = dep_by_month.reindex(all_months, fill_value=0.0)
    metrics["avg_monthly_deposits"] = round(float(dep_by_month.mean()), 2)

    # Avg monthly true deposits (same reindex logic — months with 0 true
    # deposits must still be included in the denominator)
    tdep_by_month = (
        true_deposits.groupby(true_deposits["date"].dt.to_period("M"))["amount"].sum()
        if not true_deposits.empty else pd.Series(dtype=float)
    )
    tdep_by_month = tdep_by_month.reindex(all_months, fill_value=0.0)
    metrics["avg_monthly_true_deposits"] = round(float(tdep_by_month.mean()), 2)

    # Avg monthly daily balance — restrict to statement months only.
    # Without this, forward-filled gap months between non-consecutive
    # statements would be averaged in and massively distort the number.
    daily_df = daily_balances.to_frame("balance")
    daily_df.index = pd.to_datetime(daily_df.index)
    monthly_adb = daily_df.groupby(daily_df.index.to_period("M"))["balance"].mean()
    monthly_adb = monthly_adb.reindex(all_months)
    metrics["avg_monthly_daily_balance"] = round(
        float(monthly_adb.mean()) if not monthly_adb.empty else 0.0, 2
    )

    # Avg monthly ending balance — same restriction to statement months
    monthly_ending = daily_df.groupby(daily_df.index.to_period("M"))["balance"].last()
    monthly_ending = monthly_ending.reindex(all_months)
    metrics["avg_monthly_ending_balance"] = round(
        float(monthly_ending.mean()) if not monthly_ending.empty else 0.0, 2
    )

    # Avg number of deposits per month — reindex so months with 0 deposits count
    dep_count_by_month = (
        deposits.groupby(deposits["date"].dt.to_period("M"))["amount"].count()
        if not deposits.empty else pd.Series(dtype=float)
    )
    dep_count_by_month = dep_count_by_month.reindex(all_months, fill_value=0.0)
    metrics["avg_monthly_deposit_count"] = round(float(dep_count_by_month.mean()), 1)

    # ---- Monthly loan payments -----------------------------------------
    # Loan-related DEBITS (payments going out) per month → averaged
    loan_debits = loan_rows[loan_rows["amount"] < 0] if not loan_rows.empty else pd.DataFrame()
    if not loan_debits.empty:
        loan_debits_by_month = (
            loan_debits.groupby(loan_debits["date"].dt.to_period("M"))["amount"]
            .sum().abs()
            .reindex(all_months, fill_value=0.0)
        )
        metrics["monthly_loan_payments"] = round(float(loan_debits_by_month.mean()), 2)
        metrics["total_loan_payments"]   = round(float(loan_debits_by_month.sum()), 2)
    else:
        metrics["monthly_loan_payments"] = 0.0
        metrics["total_loan_payments"]   = 0.0

    # ---- Month-by-month summary table ----------------------------------
    monthly_rows = []
    for period in sorted(all_months):
        mask = df["date"].dt.to_period("M") == period
        month_df = df[mask]

        m_deps  = month_df[month_df["amount"] > 0]["amount"]
        m_true  = month_df[
            (month_df["amount"] > 0) &
            ~month_df["description"].apply(lambda d: _contains_any(d, EXCLUDE_KEYWORDS))
        ]["amount"]
        m_nsf   = month_df[
            month_df["description"].apply(lambda d: _contains_any(d, NSF_KEYWORDS)) &
            (month_df["amount"] < 0)
        ]["amount"]
        m_loans = month_df[
            month_df["description"].apply(lambda d: _contains_any(d, LOAN_KEYWORDS)) &
            (month_df["amount"] < 0)
        ]["amount"]

        # Daily balances for this month
        month_start = period.start_time
        month_end   = period.end_time
        month_bal   = daily_balances[
            (daily_balances.index >= month_start) &
            (daily_balances.index <= month_end)
        ]

        monthly_rows.append({
            "month":            str(period),
            "total_deposits":   round(float(m_deps.sum()),  2),
            "true_deposits":    round(float(m_true.sum()),  2),
            "deposit_count":    int(len(m_deps)),
            "avg_daily_balance":round(float(month_bal.mean()) if not month_bal.empty else 0, 2),
            "ending_balance":   round(float(month_bal.iloc[-1]) if not month_bal.empty else 0, 2),
            "nsf_count":        int(len(m_nsf)),
            "nsf_total":        round(float(m_nsf.sum()), 2),
            "loan_payments":    round(float(abs(m_loans.sum())), 2),
        })

    metrics["monthly_summary"] = monthly_rows

    # ---- Daily balance series (for charting) ---------------------------
    metrics["daily_balances_chart"] = [
        {"date": d.strftime("%Y-%m-%d"), "balance": round(float(b), 2)}
        for d, b in daily_balances.items()
    ]

    return metrics


# ---------------------------------------------------------------------------
# Public entry point — single file
# ---------------------------------------------------------------------------

def _analyze_from_parsed_df(df: pd.DataFrame) -> dict:
    """
    Normalize → daily balances → metrics.

    Expects parsed columns (date, description, amount, optional balance,
    optional _ai_assisted).
    """
    ai_assisted = bool(df[_AI_FLAG_COL].any()) if _AI_FLAG_COL in df.columns else False
    df = _normalize(df)
    if df.empty:
        raise ValueError("After normalization, no valid transactions remain. Check the file format.")

    logger.info(
        "Parsed %d transactions from %s to %s%s",
        len(df), df["date"].min().date(), df["date"].max().date(),
        " [AI-assisted]" if ai_assisted else "",
    )

    daily_balances = _reconstruct_daily_balances(df)
    metrics = _compute_metrics(df, daily_balances)
    metrics["ai_assisted"] = ai_assisted
    if ai_assisted:
        metrics["ai_assisted_message"] = (
            "This statement was processed with AI-assisted extraction because the format "
            "was not fully recognized by built-in parsers. Please verify deposits, "
            "balances, and fees against your original statement."
        )

    return {"metrics": metrics, "dataframe": df}


def analyze(file_bytes: bytes, filename: str) -> dict:
    """
    Main entry point called by the FastAPI handler.

    Parameters
    ----------
    file_bytes : raw bytes of the uploaded file
    filename   : original filename (used to choose parser)

    Returns
    -------
    dict with keys:
      - metrics   : all computed CRM metrics (JSON-serialisable)
      - dataframe : normalised pandas DataFrame (for report generation)
    """
    logger.info("Analyzing file: %s", filename)
    df = _ingest_transactions(file_bytes, filename)
    return _analyze_from_parsed_df(df)


# ---------------------------------------------------------------------------
# Public entry point — multiple files
# ---------------------------------------------------------------------------

def analyze_multiple(files: list) -> dict:
    """
    Analyze multiple bank statement files and produce combined metrics.

    Parameters
    ----------
    files : list of (file_bytes, filename) tuples

    Returns
    -------
    dict with keys:
      - metrics        : combined CRM metrics across ALL files
      - per_file       : list of per-file metric dicts (one per statement)
      - dataframe      : merged, deduplicated DataFrame
      - file_errors    : list of filenames that failed to parse
    """
    all_dfs: list[pd.DataFrame] = []
    per_file: list[dict] = []
    file_errors: list[dict] = []

    for file_idx, (file_bytes, filename) in enumerate(files):
        try:
            result = analyze(file_bytes, filename)
            df_i = result["dataframe"].copy()
            # Tag each row with its source file index so deduplication can
            # distinguish identical transactions within the same file from
            # the same transaction repeated across two uploaded copies.
            df_i["_source_file"] = file_idx
            all_dfs.append(df_i)
            per_file.append({
                "filename": filename,
                "metrics":  result["metrics"],
            })
            logger.info("Parsed %s: %d transactions", filename, len(df_i))
        except Exception as exc:
            logger.warning("Failed to parse %s: %s", filename, exc)
            file_errors.append({"filename": filename, "error": str(exc)})

    if not all_dfs:
        raise ValueError(
            "None of the uploaded files could be parsed. "
            + "; ".join(f["error"] for f in file_errors)
        )

    # --- Merge & deduplicate -------------------------------------------
    combined = pd.concat(all_dfs, ignore_index=True)
    combined = combined.sort_values("date").reset_index(drop=True)

    # Deduplicate: remove transactions that appear more than once across
    # different uploaded files (overlapping statement periods).
    # Strategy: within each source file, assign a sequential index for every
    # (date, description, amount) group.  Two rows with the same
    # (date, description, amount, within-file-index) across different files
    # are the same real transaction and one copy is dropped.
    # This preserves legitimate same-day/same-amount duplicates that occur
    # within a single statement (e.g. two $5,000 remote deposits on 03/19).
    before = len(combined)
    combined["_within_idx"] = combined.groupby(
        ["_source_file",
         combined["date"].dt.strftime("%Y-%m-%d"),
         combined["description"].str.lower().str.strip(),
         combined["amount"].astype(str)]
    ).cumcount()
    combined["_key"] = (
        combined["date"].dt.strftime("%Y-%m-%d")
        + "|" + combined["description"].str.lower().str.strip()
        + "|" + combined["amount"].astype(str)
        + "|" + combined["_within_idx"].astype(str)
    )
    combined = combined.drop_duplicates(subset="_key").drop(
        columns=["_key", "_within_idx", "_source_file"])
    combined = combined.reset_index(drop=True)
    dupes_removed = before - len(combined)
    if dupes_removed:
        logger.info("Removed %d duplicate transactions across files", dupes_removed)

    # --- Recompute daily balances & metrics on combined set -------------
    daily_balances = _reconstruct_daily_balances(combined)
    metrics = _compute_metrics(combined, daily_balances)
    metrics["files_processed"]    = len(all_dfs)
    metrics["files_failed"]       = len(file_errors)
    metrics["duplicates_removed"] = dupes_removed

    # If ANY file used the AI fallback, flag the combined result too
    ai_files = [p["filename"] for p in per_file if p["metrics"].get("ai_assisted")]
    metrics["ai_assisted"]      = len(ai_files) > 0
    metrics["ai_assisted_files"] = ai_files
    if ai_files:
        metrics["ai_assisted_message"] = (
            "AI-assisted extraction was used for: "
            + ", ".join(ai_files)
            + ". Spot-check totals and balances on those files against the originals."
        )

    return {
        "metrics":     metrics,
        "per_file":    per_file,
        "dataframe":   combined,
        "file_errors": file_errors,
    }
