# Disable Email Confirmation in Supabase

**Quick guide to enable instant signup without email verification**

---

## 🎯 Why Do This?

**Problem**: Users sign up but see no feedback because Supabase is waiting for email confirmation.

**Solution**: Disable email confirmation for instant signup (perfect for MVP/testing).

---

## 📋 Steps to Disable Email Confirmation

### **Step 1: Go to Supabase Dashboard**
```
https://supabase.com/dashboard/project/clcszcalvarxflhdjuar
```

### **Step 2: Navigate to Authentication**
```
Left sidebar → Authentication → Providers
```

### **Step 3: Find Email Provider**
```
Scroll down to "Email" in the providers list
Click on it to expand settings
```

### **Step 4: Disable Confirmation**
```
Find the checkbox: "Confirm email"
☐ Uncheck it
```

### **Step 5: Save Changes**
```
Click "Save" button at the bottom
```

---

## 🎊 Done!

Now users can:
- ✅ Sign up instantly
- ✅ No email verification needed
- ✅ Immediate redirect to onboarding
- ✅ Start using Pannash right away

---

## 🧪 Test It

1. Go to `/auth`
2. Click "Sign Up"
3. Enter new email + password
4. Click "Create Account"
5. Should see: **"Account created! Redirecting..."**
6. Redirects to `/onboarding` after 1 second

---

## 🔄 If You Want Email Verification Back

### **For Production:**

1. Go back to Supabase → Authentication → Providers → Email
2. ☑ Check "Confirm email"
3. Configure SMTP settings (SendGrid, Mailgun, etc.)
4. Save

### **Then users will:**
- Sign up
- Get verification email
- Click link in email
- Then sign in
- Redirect to onboarding

---

## 🎯 Recommended for Now

**MVP/Development**: ☐ Confirm email (DISABLED)
**Production**: ☑ Confirm email (ENABLED with SMTP)

---

**Do this now for instant signup!** ⚡
