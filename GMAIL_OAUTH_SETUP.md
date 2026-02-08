# 📧 Gmail OAuth Setup (Super Simple!)

## ✅ What's Been Built

- Gmail OAuth flow using Google APIs
- Secure token storage in Supabase
- "Connect Gmail" button on dashboard
- Auto sends from YOUR Gmail when connected
- Falls back to Resend if not connected

---

## 🎯 What YOU Need to Do (4 Easy Steps)

### **Step 1: Update Database** (2 minutes)

Run this SQL in Supabase to add Gmail OAuth support:

1. Go to https://supabase.com/dashboard
2. Click your Pannash project
3. Click **"SQL Editor"**
4. Click **"New query"**
5. Open file: `supabase-add-oauth-support.sql`
6. Copy everything
7. Paste into Supabase
8. Click **"Run"**
9. See "Success" ✅

**What this does:** Adds columns for Gmail tokens (access_token, refresh_token, etc.) to your email_connections table.

---

### **Step 2: Get Google Credentials** (5 minutes)

You said you already have these from Resend! If so, skip to Step 3.

If you need them:

1. Go to https://console.cloud.google.com/
2. Create a project or select existing
3. Enable **Gmail API**:
   - Click "APIs & Services" → "Library"
   - Search "Gmail API" → Click it → "Enable"
4. Create credentials:
   - Click "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - If asked about consent screen:
     - Choose "External"
     - App name: "Pannash"
     - Your email in support & developer email
     - Save
   - Application type: **Web application**
   - Name: "Pannash"
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`
   - Click "Create"
5. **Copy both:**
   - Client ID (looks like: 123-abc.apps.googleusercontent.com)
   - Client Secret (looks like: GOCSPX-abc123)

---

### **Step 3: Add Credentials to .env.local** (1 minute)

1. Open `.env.local` in Cursor
2. Find these lines:
   ```
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   ```
3. Replace with your REAL values from Step 2
4. Save (Cmd+S)

**Example:**
```env
GOOGLE_CLIENT_ID=123456-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123xyz789
```

---

### **Step 4: Restart & Test!** (2 minutes)

1. **Restart app:**
   - In terminal: Press `Ctrl+C`
   - Type: `npm run dev`
   - Wait for "Ready"

2. **Connect Gmail:**
   - Go to http://localhost:3000/dashboard
   - Scroll to **"Connect Gmail"** section (blue box)
   - Click **"Connect Gmail with OAuth"** button
   - Google will ask "Let Pannash send emails from Gmail?" → Click **"Allow"**
   - You'll come back to dashboard → See green success message ✅

3. **Test it:**
   - Scroll to **"Test Email Sending"**
   - Click **"Send Test Email to Myself"**
   - Check your inbox (bobbygulinello@gmail.com)
   - Email should come FROM your Gmail address! 🎉

---

## 🎨 What You'll See on Dashboard

Two separate sections:

**1. Connect Gmail (Blue box)**
- Uses OAuth (more secure, easier)
- Click button → Google login → Done
- Shows: "Gmail Connected (OAuth) ✓" with your email

**2. Connect Outlook via SMTP (Purple box)**
- Enter your Outlook email & password manually
- Shows: "Outlook Connected (SMTP) ✓" with your email

**You can connect BOTH if you want!** The test email will prefer Gmail if both are connected.

---

## 🔐 Security

- ✅ Tokens stored in Supabase (encrypted in transit)
- ✅ RLS enabled (only YOU can see your tokens)
- ✅ Never exposed to client-side code
- ✅ Google automatically refreshes expired tokens

---

## 📋 Priority Order for Sending

When you click "Send Test Email", the app checks in this order:

1. **Gmail OAuth connected?** → Send from Gmail ✅
2. **Outlook SMTP connected?** → Send from Outlook ✅
3. **Nothing connected?** → Use Resend default sender

---

## ❓ Troubleshooting

**"Google OAuth not configured"**
- You didn't add credentials to `.env.local`
- Go back to Step 3

**"Redirect URI mismatch"**
- In Google Console, make sure redirect URI is EXACTLY:
  `http://localhost:3000/api/auth/google/callback`
- No extra slashes or spaces!

**"Gmail connected" but emails still from Resend**
- Check dev server logs (should say "Sending via Gmail OAuth")
- Refresh the dashboard page
- Try clicking "Send Test Email" again

---

## 🚀 Ready?

**Quick checklist:**
- [ ] Step 1: Run `supabase-add-oauth-support.sql` in Supabase
- [ ] Step 2: Have Google Client ID & Secret (you said you already have these!)
- [ ] Step 3: Add them to `.env.local`
- [ ] Step 4: Restart app and test

**Start with Step 1!** Let me know when you're done and I'll help with the next step! 🎉
