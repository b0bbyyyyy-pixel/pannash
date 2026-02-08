# Gmail/Outlook OAuth Setup Guide

## ✅ What's Been Implemented

- OAuth authorization flow for Gmail and Outlook
- Secure token storage in Supabase
- Connect Email buttons on dashboard
- Success/error messaging
- RLS policies for data protection

## 📋 Setup Steps

### 1. Create the Database Table

Run this SQL in your Supabase SQL Editor:

```bash
# Open Supabase dashboard → SQL Editor → New query
# Copy and paste the contents of: supabase-email-connections.sql
```

Or run directly:
```sql
-- See supabase-email-connections.sql for full code
```

### 2. Get OAuth Credentials

#### **Google (Gmail)**

1. Go to https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable **Gmail API**:
   - APIs & Services → Library → Search "Gmail API" → Enable
4. Create OAuth credentials:
   - APIs & Services → Credentials
   - Create Credentials → OAuth client ID
   - Application type: **Web application**
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback`
     - (Add production URL later: `https://your-domain.com/api/auth/callback`)
5. Copy **Client ID** and **Client Secret**

#### **Microsoft (Outlook)**

1. Go to https://portal.azure.com/
2. Azure Active Directory → App registrations → New registration
3. Settings:
   - Name: Pannash
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: **Web** → `http://localhost:3000/api/auth/callback`
4. After creation:
   - Copy **Application (client) ID**
   - Certificates & secrets → New client secret → Copy **Value**
5. API permissions:
   - Add a permission → Microsoft Graph → Delegated permissions
   - Add: **Mail.Send** and **User.Read**
   - Click "Grant admin consent"

### 3. Update Environment Variables

Edit `.env.local` with your real credentials:

```env
GOOGLE_CLIENT_ID=your_actual_google_client_id
GOOGLE_CLIENT_SECRET=your_actual_google_client_secret
MICROSOFT_CLIENT_ID=your_actual_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_actual_microsoft_client_secret
```

### 4. Restart Dev Server

```bash
# Stop current server (Ctrl+C)
npm run dev
```

### 5. Test the Flow

1. Go to http://localhost:3000/dashboard
2. Find the "Email Connection" section
3. Click "Connect Gmail" or "Connect Outlook"
4. Authorize the app
5. You should be redirected back with a success message
6. The connected email will show with a green checkmark ✓

## 🔒 Security Notes

- Access tokens are stored in Supabase with RLS enabled
- Only the user can access their own tokens
- Tokens are automatically refreshed when expired (Gmail/Outlook handle this)
- Never expose Client IDs/Secrets in client-side code (they're only used in API routes)

## 🚀 What's Next

To actually send emails from the connected account, you need to:

1. Install email API packages:
   ```bash
   npm install googleapis @microsoft/microsoft-graph-client
   ```

2. Update `/api/test-email/route.ts` to:
   - Check if user has a connected email
   - If yes, use Gmail/Outlook API to send
   - If no, fall back to Resend

3. Handle token refresh when expired

## 📝 Files Created

- `src/app/api/auth/connect/[provider]/route.ts` - OAuth start
- `src/app/api/auth/callback/route.ts` - OAuth callback
- `src/app/dashboard/ConnectEmailButtons.tsx` - UI component
- `supabase-email-connections.sql` - Database schema
- Updated: `src/app/dashboard/page.tsx` - Added email connection section

## ❓ Troubleshooting

**"OAuth not configured" error**
- Make sure you've added the credentials to `.env.local`
- Restart the dev server after editing `.env.local`

**"storage_failed" error**
- Run the SQL migration in Supabase
- Check that the `email_connections` table exists

**Redirect not working**
- Verify redirect URI matches exactly in Google/Microsoft console
- Check `NEXT_PUBLIC_BASE_URL` in `.env.local`

**"Invalid state" error**
- This happens if you refresh during OAuth flow
- Just try connecting again
