"""
report_generator.py
--------------------
Single-page landscape PDF report built with ReportLab.

Layout (top → bottom, landscape A4):
  1. Header bar  — account name / period / generated date
  2. Summary grid — 9 KPI cards in two rows matching the dashboard
  3. Month-by-month table — every metric broken down per month
  4. Loans table (if any)
  5. Footer
"""

from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import Any

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, KeepTogether
)

logger = logging.getLogger(__name__)

# ── Palette ───────────────────────────────────────────────────────────────────
DARK_NAVY  = colors.HexColor("#0f172a")
NAVY       = colors.HexColor("#1e293b")
NAVY3      = colors.HexColor("#334155")
BLUE       = colors.HexColor("#2563eb")
GREEN      = colors.HexColor("#16a34a")
GREEN_BG   = colors.HexColor("#f0fdf4")
GREEN_LT   = colors.HexColor("#dcfce7")
RED        = colors.HexColor("#dc2626")
RED_BG     = colors.HexColor("#fef2f2")
PURPLE     = colors.HexColor("#7c3aed")
PURPLE_BG  = colors.HexColor("#ede9fe")
TEAL       = colors.HexColor("#0d9488")
TEAL_BG    = colors.HexColor("#f0fdfa")
SLATE      = colors.HexColor("#475569")
SLATE_BG   = colors.HexColor("#f8fafc")
LIGHT_BLUE = colors.HexColor("#eff6ff")
BLUE_BG    = colors.HexColor("#dbeafe")
WHITE      = colors.white
ROW_ALT    = colors.HexColor("#f1f5f9")
HEADER_ROW = colors.HexColor("#1e293b")


def _hex(c) -> str:
    """ReportLab Color → '#rrggbb' safe for XML markup."""
    return f"#{int(c.red*255):02x}{int(c.green*255):02x}{int(c.blue*255):02x}"


def _fmt(v, dash: bool = True) -> str:
    if v is None:
        return "—" if dash else ""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return str(v)
    sign = "-" if n < 0 else ""
    return f"{sign}${abs(n):,.2f}"


def _styles():
    S = {}
    def P(name, **kw):
        S[name] = ParagraphStyle(name, **kw)
    P("hdr_title",  fontSize=14, fontName="Helvetica-Bold", textColor=WHITE, leading=17)
    P("hdr_sub",    fontSize=7.5,fontName="Helvetica",       textColor=colors.HexColor("#94a3b8"))
    P("hdr_right",  fontSize=8,  fontName="Helvetica",       textColor=WHITE,  alignment=TA_RIGHT)
    P("card_lbl",   fontSize=6.5,fontName="Helvetica-Bold",  textColor=SLATE,
                    leading=8, spaceAfter=1)
    P("card_val",   fontSize=13, fontName="Helvetica-Bold",  leading=15)
    P("card_sub",   fontSize=6,  fontName="Helvetica",       textColor=SLATE)
    P("sec",        fontSize=8,  fontName="Helvetica-Bold",  textColor=DARK_NAVY,
                    spaceBefore=4, spaceAfter=2)
    P("tbl_hdr",    fontSize=6.5,fontName="Helvetica-Bold",  textColor=WHITE, alignment=TA_CENTER)
    P("tbl_cell",   fontSize=7,  fontName="Helvetica",       leading=9)
    P("tbl_cell_r", fontSize=7,  fontName="Helvetica",       leading=9,  alignment=TA_RIGHT)
    P("tbl_cell_c", fontSize=7,  fontName="Helvetica",       leading=9,  alignment=TA_CENTER)
    P("tbl_total",  fontSize=7,  fontName="Helvetica-Bold",  leading=9,  alignment=TA_RIGHT)
    P("footer",     fontSize=6.5,fontName="Helvetica",       textColor=SLATE, alignment=TA_CENTER)
    P("ai_warn",    fontSize=6.5,fontName="Helvetica-Bold",   textColor=colors.HexColor("#b45309"),
                    alignment=TA_CENTER, spaceAfter=2)
    return S


# ── Header ────────────────────────────────────────────────────────────────────

def _build_header(metrics: dict, S: dict, W: float) -> Table:
    generated = datetime.utcnow().strftime("%b %d, %Y %H:%M UTC")
    left = Table([[Paragraph("Bank Statement Analysis Report", S["hdr_title"])],
                  [Paragraph("YourCRM Bank Analyzer", S["hdr_sub"])]],
                 colWidths=[W * 0.55])
    left.setStyle(TableStyle([
        ("TOPPADDING",   (0,0),(-1,-1), 0),
        ("BOTTOMPADDING",(0,0),(-1,-1), 0),
    ]))
    right_text = (
        f'<b>Period:</b> {metrics.get("period_label","")}<br/>'
        f'<font size="7">Generated: {generated}</font>'
    )
    right = Paragraph(right_text, S["hdr_right"])
    t = Table([[left, right]], colWidths=[W * 0.65, W * 0.35])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), DARK_NAVY),
        ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",   (0,0),(-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1), 8),
        ("LEFTPADDING",  (0,0),(-1,-1), 10),
        ("RIGHTPADDING", (0,0),(-1,-1), 10),
    ]))
    return t


# ── Summary cards ─────────────────────────────────────────────────────────────

def _card_cell(label: str, value: str, sub: str,
               bg, vc) -> Table:
    """Build a single KPI card as a nested Table."""
    rows = [
        [Paragraph(f'<font color="{_hex(SLATE)}"><b>{label.upper()}</b></font>',
                   ParagraphStyle("cl", fontSize=6, fontName="Helvetica-Bold", leading=7))],
        [Paragraph(f'<font color="{_hex(vc)}">{value}</font>',
                   ParagraphStyle("cv", fontSize=12, fontName="Helvetica-Bold", leading=14))],
        [Paragraph(f'<font color="{_hex(SLATE)}">{sub}</font>',
                   ParagraphStyle("cs", fontSize=6, fontName="Helvetica", leading=7))],
    ]
    t = Table(rows, colWidths=[None])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), bg),
        ("TOPPADDING",   (0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING",  (0,0),(-1,-1), 7),
        ("RIGHTPADDING", (0,0),(-1,-1), 4),
        ("BOX",          (0,0),(-1,-1), 0.4, colors.HexColor("#e2e8f0")),
    ]))
    return t


def _build_summary(metrics: dict, W: float) -> Table:
    m  = metrics
    nd = m.get("negative_days", 0) or 0
    nf = m.get("nsf_count", 0) or 0
    n_months = m.get("num_months", 1) or 1
    loan_cnt = len(m.get("loans", []))

    # Top row: 5 deposit/balance averages
    top = [
        _card_cell("Avg Monthly Deposits",
                   _fmt(m.get("avg_monthly_deposits")),
                   f"{n_months} month{'s' if n_months!=1 else ''}",
                   GREEN_BG, GREEN),
        _card_cell("Avg Monthly True Deposits",
                   _fmt(m.get("avg_monthly_true_deposits")),
                   f"{n_months} month{'s' if n_months!=1 else ''}",
                   TEAL_BG, TEAL),
        _card_cell("Avg Monthly Daily Balance",
                   _fmt(m.get("avg_monthly_daily_balance")),
                   "avg of monthly avgs",
                   LIGHT_BLUE, BLUE),
        _card_cell("Avg Monthly Ending Balance",
                   _fmt(m.get("avg_monthly_ending_balance")),
                   "avg month-end",
                   SLATE_BG, NAVY),
        _card_cell("Avg # Monthly Deposits",
                   str(m.get("avg_monthly_deposit_count", 0)),
                   "deposits/month",
                   SLATE_BG, NAVY),
    ]

    # Bottom row: 4 risk/loan metrics
    bot = [
        _card_cell("Negative Days",
                   str(nd),
                   "days below $0",
                   RED_BG if nd > 0 else SLATE_BG,
                   RED if nd > 0 else NAVY),
        _card_cell("NSF / OD Fees",
                   str(nf),
                   _fmt(m.get("nsf_total")) + " total",
                   RED_BG if nf > 0 else SLATE_BG,
                   RED if nf > 0 else NAVY),
        _card_cell("Loans Found",
                   str(loan_cnt),
                   "lender(s)",
                   PURPLE_BG if loan_cnt > 0 else SLATE_BG,
                   PURPLE if loan_cnt > 0 else NAVY),
        _card_cell("Avg Monthly Loan Pmts",
                   _fmt(m.get("monthly_loan_payments")),
                   _fmt(m.get("total_loan_payments")) + " total",
                   PURPLE_BG if loan_cnt > 0 else SLATE_BG,
                   PURPLE if loan_cnt > 0 else NAVY),
    ]

    cw5 = [W / 5] * 5
    cw4 = [W / 4] * 4

    top_tbl = Table([top], colWidths=cw5)
    top_tbl.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0),(-1,-1), 2),
        ("RIGHTPADDING", (0,0),(-1,-1), 2),
        ("TOPPADDING",   (0,0),(-1,-1), 0),
        ("BOTTOMPADDING",(0,0),(-1,-1), 0),
    ]))
    bot_tbl = Table([bot], colWidths=cw4)
    bot_tbl.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0),(-1,-1), 2),
        ("RIGHTPADDING", (0,0),(-1,-1), 2),
        ("TOPPADDING",   (0,0),(-1,-1), 0),
        ("BOTTOMPADDING",(0,0),(-1,-1), 0),
    ]))

    wrapper = Table([[top_tbl], [bot_tbl]], colWidths=[W])
    wrapper.setStyle(TableStyle([
        ("TOPPADDING",   (0,0),(-1,-1), 2),
        ("BOTTOMPADDING",(0,0),(-1,-1), 2),
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
    ]))
    return wrapper


# ── Month-by-month table ──────────────────────────────────────────────────────

def _build_monthly_table(metrics: dict, S: dict, W: float) -> Table:
    rows = metrics.get("monthly_summary", [])
    if not rows:
        return Paragraph("No monthly data available.", S["tbl_cell"])

    def H(txt):
        return Paragraph(txt, S["tbl_hdr"])
    def C(txt, right=True, bold=False):
        style = S["tbl_total"] if bold else (S["tbl_cell_r"] if right else S["tbl_cell_c"])
        return Paragraph(str(txt), style)

    header = [
        H("Month"),
        H("Total\nDeposits"),
        H("True\nDeposits"),
        H("# Dep"),
        H("Avg Daily\nBalance"),
        H("Ending\nBalance"),
        H("NSF\nCount"),
        H("NSF\nFees"),
        H("Loan\nPayments"),
    ]

    data = [header]
    totals = {
        "total_deposits": 0.0, "true_deposits": 0.0, "deposit_count": 0,
        "avg_daily_balance": [], "ending_balance": [],
        "nsf_count": 0, "nsf_total": 0.0, "loan_payments": 0.0,
    }

    for i, r in enumerate(rows):
        totals["total_deposits"]   += r.get("total_deposits", 0)
        totals["true_deposits"]    += r.get("true_deposits", 0)
        totals["deposit_count"]    += r.get("deposit_count", 0)
        totals["avg_daily_balance"].append(r.get("avg_daily_balance", 0))
        totals["ending_balance"].append(r.get("ending_balance", 0))
        totals["nsf_count"]        += r.get("nsf_count", 0)
        totals["nsf_total"]        += r.get("nsf_total", 0)
        totals["loan_payments"]    += r.get("loan_payments", 0)

        nsf_c = r.get("nsf_count", 0)
        data.append([
            C(r["month"], right=False),
            C(_fmt(r.get("total_deposits"))),
            C(_fmt(r.get("true_deposits"))),
            C(str(r.get("deposit_count", 0))),
            C(_fmt(r.get("avg_daily_balance"))),
            C(_fmt(r.get("ending_balance"))),
            C(str(nsf_c)),
            C(_fmt(r.get("nsf_total", 0))),
            C(_fmt(r.get("loan_payments", 0))),
        ])

    # Totals / averages row
    n = len(rows)
    import statistics
    data.append([
        C("TOTAL / AVG", right=False, bold=True),
        C(_fmt(totals["total_deposits"]), bold=True),
        C(_fmt(totals["true_deposits"]),  bold=True),
        C(str(totals["deposit_count"]),   bold=True),
        C(_fmt(sum(totals["avg_daily_balance"]) / n if n else 0), bold=True),
        C(_fmt(totals["ending_balance"][-1] if totals["ending_balance"] else 0), bold=True),
        C(str(totals["nsf_count"]),        bold=True),
        C(_fmt(totals["nsf_total"]),       bold=True),
        C(_fmt(totals["loan_payments"]),   bold=True),
    ])

    # Column widths — sum = W
    cw = [W*0.10, W*0.13, W*0.13, W*0.06,
          W*0.13, W*0.13, W*0.07, W*0.12, W*0.13]

    t = Table(data, colWidths=cw, repeatRows=1)
    n_data = len(data)

    row_styles = [
        ("BACKGROUND",   (0,0), (-1,0),        HEADER_ROW),
        ("TEXTCOLOR",    (0,0), (-1,0),        WHITE),
        ("BACKGROUND",   (0,-1),(-1,-1),       LIGHT_BLUE),
        ("FONTNAME",     (0,-1),(-1,-1),       "Helvetica-Bold"),
        ("INNERGRID",    (0,0), (-1,-1), 0.3,  colors.HexColor("#e2e8f0")),
        ("BOX",          (0,0), (-1,-1), 0.5,  colors.HexColor("#cbd5e1")),
        ("TOPPADDING",   (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
        ("LEFTPADDING",  (0,0), (-1,-1), 5),
        ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        ("ROWBACKGROUNDS",(0,1),(-1,-2), [WHITE, ROW_ALT]),
    ]

    # Highlight NSF months red
    for i, r in enumerate(rows, start=1):
        if r.get("nsf_count", 0) > 0:
            row_styles.append(("BACKGROUND", (6, i), (7, i), RED_BG))
            row_styles.append(("TEXTCOLOR",  (6, i), (7, i), RED))

    t.setStyle(TableStyle(row_styles))
    return t


# ── Loans table ───────────────────────────────────────────────────────────────

def _build_loans_table(metrics: dict, S: dict, W: float):
    loans = metrics.get("loans", [])
    if not loans:
        return None

    def H(txt): return Paragraph(txt, S["tbl_hdr"])
    def C(txt, bold=False):
        st = S["tbl_total"] if bold else S["tbl_cell_r"]
        return Paragraph(str(txt), st)

    header = [H("Lender / Type"), H("Transactions"), H("Total Paid")]
    data   = [header]
    for loan in loans:
        total = loan.get("total", 0)
        data.append([
            Paragraph(loan.get("loan_type", "Loan"), S["tbl_cell"]),
            C(str(loan.get("count", 0))),
            C(_fmt(abs(float(total)) if total else 0)),
        ])

    cw = [W * 0.55, W * 0.2, W * 0.25]
    t  = Table(data, colWidths=cw)
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,0), HEADER_ROW),
        ("TEXTCOLOR",    (0,0),(-1,0), WHITE),
        ("BACKGROUND",   (0,1),(-1,-1), PURPLE_BG),
        ("INNERGRID",    (0,0),(-1,-1), 0.3, colors.HexColor("#e9d5ff")),
        ("BOX",          (0,0),(-1,-1), 0.5, colors.HexColor("#c4b5fd")),
        ("TOPPADDING",   (0,0),(-1,-1), 4),
        ("BOTTOMPADDING",(0,0),(-1,-1), 4),
        ("LEFTPADDING",  (0,0),(-1,-1), 6),
        ("RIGHTPADDING", (0,0),(-1,-1), 6),
        ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
    ]))
    return t


# ── Public entry point ────────────────────────────────────────────────────────

def generate_pdf(metrics: dict, df: pd.DataFrame) -> bytes:
    """
    Build a single-page landscape A4 PDF report.
    """
    logger.info("Generating single-page PDF for period %s", metrics.get("period_label", ""))

    buf    = io.BytesIO()
    PW, PH = landscape(A4)
    MARGIN = 10 * mm
    W      = PW - 2 * MARGIN

    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN,  bottomMargin=10 * mm,
        title="Bank Statement Analysis Report",
    )

    S     = _styles()
    story = []

    # 1. Header
    story.append(_build_header(metrics, S, W))
    story.append(Spacer(1, 3 * mm))

    # 2. Summary cards
    story.append(_build_summary(metrics, W))
    story.append(Spacer(1, 3 * mm))

    # 3. Month-by-month table
    story.append(Paragraph("Month-by-Month Breakdown", S["sec"]))
    story.append(_build_monthly_table(metrics, S, W))

    # 4. Loans (if any)
    loans_tbl = _build_loans_table(metrics, S, W * 0.5)
    if loans_tbl:
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph("Loan / Financing Activity", S["sec"]))
        story.append(loans_tbl)

    # 5. Footer
    story.append(Spacer(1, 2 * mm))
    if metrics.get("ai_assisted"):
        story.append(Paragraph(
            "<b>AI-assisted extraction</b> — figures were inferred by an AI model; verify "
            "against your original statement.",
            S["ai_warn"],
        ))
        story.append(Spacer(1, 1 * mm))
    generated = datetime.utcnow().strftime("%B %d, %Y at %H:%M UTC")
    story.append(Paragraph(
        f"Generated by YourCRM Bank Analyzer – {generated}  |  CONFIDENTIAL",
        S["footer"]
    ))

    doc.build(story)
    pdf_bytes = buf.getvalue()
    logger.info("Single-page PDF: %d bytes", len(pdf_bytes))
    return pdf_bytes
