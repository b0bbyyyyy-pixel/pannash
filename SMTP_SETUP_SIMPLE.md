# 📧 Simple SMTP Setup Guide (Like You're 8!)

## ✅ What You Already Did
- ✅ Step 1: Created database table in Supabase
- ✅ Step 2: Got Google credentials (Gmail OAuth)

## 🎯 What to Do Next (SMTP for Outlook)

### Step 1: Update the Database Table 🗄️

The old table was for OAuth. We need a new one for SMTP (simpler way to send emails).

1. Go to https://supabase.com/dashboard
2. Click on your Pannash project
3. Click **"SQL Editor"** on the left
4. Click **"New query"**
5. Open the file `supabase-smtp-connections.sql` (it's in your Pannash folder)
6. Copy EVERYTHING from that file
7. Paste it into Supabase
8. Click **"Run"** (or Cmd+Enter)
9. You should see "Success" ✅

**Why?** This creates a place to store your Outlook email settings securely.

---

### Step 2: Restart Your App 🔄

The app needs to restart to use the new code.

1. Go to your terminal in Cursor (bottom panel)
2. Press `Ctrl+C` to stop
3. Type `npm run dev` and press Enter
4. Wait for "Ready"

---

### Step 3: Connect Your Outlook Email 📨

1. Go to http://localhost:3000/dashboard
2. Scroll down to **"Connect Outlook via SMTP"** section
3. You'll see a form with:
   - **SMTP Host**: Leave as `smtp.office365.com` ✅
   - **SMTP Port**: Leave as `587` ✅
   - **Email Address**: Type your Outlook/Microsoft email (like: `you@outlook.com` or `you@yourcompany.com`)
   - **From Name**: Type your name (optional) - this shows up as "Your Name" in emails
   - **Password**: READ BELOW 👇

---

### 🔑 About the Password Field

**If you DON'T have 2-step verification (MFA) on your Microsoft account:**
- Just type your regular password
- Click "Save Outlook SMTP"
- Done! ✅

**If you DO have 2-step verification (MFA) on your Microsoft account:**
- You can't use your regular password
- You need to create an **App Password** (special password just for this app)
- Here's how:
  1. Go to https://account.live.com/proofs/AppPassword
  2. Sign in with your Microsoft account
  3. Click "Create a new app password"
  4. It will show you a password like: `abcd-efgh-ijkl-mnop`
  5. Copy that password (it only shows once!)
  6. Paste it in the "Password" field in Pannash
  7. Click "Save Outlook SMTP"
  8. Done! ✅

**How do I know if I have 2-step verification?**
- If Microsoft asks you for a code from your phone when you log in, you have it
- If not, you don't have it

---

### Step 4: Test It! 🎉

1. After saving, scroll to **"Test Email Sending"** section
2. Click **"Send Test Email to Myself"**
3. Check your email inbox (bobbygulinello@gmail.com)
4. You should get an email FROM your Outlook address! ✅

**What's cool:** The email will show as coming from YOUR email (like you@outlook.com), not from Resend!

---

## 🎈 Summary

**What files you need to run in order:**
1. Run `supabase-smtp-connections.sql` in Supabase (SQL Editor)
2. Restart app: `Ctrl+C` then `npm run dev`
3. Fill in the form on dashboard with your Outlook email & password
4. Test it!

**Security note:** Your password is stored securely in Supabase with RLS protection. Only you can see it, and it's encrypted in transit.

---

## ❓ Troubleshooting

**"Authentication failed" when testing**
- Wrong email or password
- If you have MFA/2-step, use an App Password (not your regular password)
- Make sure email is fully typed correctly

**"Could not connect to server"**
- Check if `smtp.office365.com` and port `587` are correct
- Try port `25` if 587 doesn't work

**"Unauthorized" error**
- You're not logged in. Go to /auth and log in first

**"No table found"**
- You didn't run Step 1 (SQL in Supabase)
- Go back and run `supabase-smtp-connections.sql`

---

## 🚀 What's Next?

Once connected:
- All test emails will send from YOUR Outlook
- In the future, all campaign emails will also send from YOUR email
- This helps with deliverability (looks more personal!)

Need help? Let me know which step you're stuck on!
