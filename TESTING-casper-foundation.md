# Casper foundation — test plan

Unit (from repo root):

```bash
npx tsx scripts/casper-foundation.test.ts
```

Covers `dealStageFromLead` for every default status, submission overrides, each rail (opt-out, casper_off, paused, submitted lockout, cooldown, quiet hours ET/CT/PT, banned phrase), `bankAnalysisIsStale`, and missing-table fallbacks.

## Preview manual tests

Use your own test phone. Casper on for **one test lead only**.

1. **Before the migration:** text the test lead. Casper should still reply like today. Server logs show a single `[casper] missing schema (...)` warn, not a crash.
2. Run `add-casper-foundation.sql` in Supabase. **Set your business name in Settings → Profile** (password-protected) before expecting more replies — a blank name logs `blocked: business_name_missing`. Then send 3 texts in 15s → exactly **one** `casper_runs` row, it covers all 3 texts, reply lands in the reply-delay range counted from the first text.
3. Two texts 50s apart → the second extends `wait_until`; still one reply. Kill test: set `lock_until` in the past by hand → the next text runs (stale lock recovered).
4. Set the lead to `Submitted` → nothing proactive goes out. Text "any update?" → Casper replies (merchant texted first). A pending draft made before the status change is blocked at send time with `blocked: submitted_lockout`. Set `Approved` → lockout lifts.
5. Reply by hand from Inbox while a Casper draft is queued → draft cancelled. Activity says it was cancelled because you replied (`cancelled: owner_replied`).
6. Temporarily set send window to now+1h, then text → `overridden: quiet_hours` / rescheduled as specified.
7. Text STOP → no Casper send, lead is DNC.
8. Photo-only MMS → Casper sees `Attachment: 1 Photo`, not empty.
9. Fake POST to `/api/webhooks/twilio` without a signature → 403 (`TWILIO_VALIDATE_SIGNATURE` true).
10. Upload a new bank statement after an analysis → briefing shows `new statement since last analysis`; a rerun is allowed.
11. Regression: global toggle off, per-lead force on/off, owner activity alerts on/off, drip send window, follow-up auto-text, needs_human ping, email_application, update_lead_email, Queue panel list/send-now.
12. Docs-received pause: text from the test phone → no reply, Activity shows `blocked: paused (docs_received)` (or `banks_received` / `app_received`). Turn Casper back on for that lead → next text gets a reply.
13. Business name: wrong password → rejected. Right password → saved, audit row written, next Casper reply uses the new name. Blank name → `blocked: business_name_missing` and Inbox shows "Set your business name in Settings."
14. Grep: no `working capital` in SMS-producing Casper code; no hardcoded `One Funding` in Casper prompts/fallbacks. `npm run build` and lint pass. Vercel: no new crons in `vercel.json`.

Preview URL will be the Vercel deployment for `feature/casper-foundation`.
