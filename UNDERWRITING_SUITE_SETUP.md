# Underwriting Suite - Setup Guide

## 🎉 What's New

Your CRM now has a **professional Underwriting Suite** that transforms the simple "Offers" field into a full-featured deal analysis tool!

### Features:
✅ **Deal Input Form** - Capture all merchant details and deal parameters
✅ **Real-time Calculations** - Instant metrics for pitching deals
✅ **Repayment Schedule Chart** - Visual bar chart showing payment progression
✅ **Risk Scoring** - Automated risk assessment (0-100 scale)
✅ **Pitch Summary** - One-click copyable pitch text
✅ **Analysis & Insights** - Deal strengths, weaknesses, and recommendations
✅ **Approval Probability** - Confidence score for deal approval

## 📋 Setup Steps

### 1. Run Database Migration

Open your Supabase SQL Editor and run:

```bash
add-underwriting-data.sql
```

This adds the `underwriting_data` JSONB column to your leads table.

### 2. Test the Feature

1. **Open any lead** in your CRM dashboard
2. Look for the **Offers** column
3. Click the **"+ Create Deal"** button (blue button)
4. The Underwriting Suite will open!

### 3. Using the Suite

**Left Sidebar - Input Deal Data:**
- Merchant Snapshot (time in business, industry, credit score, revenue)
- Deal Structure (amount, factor rate, holdback %, frequency, term)
- Purpose of funds

**Center - Analysis Tab:**
- 6 key metric cards (repayment, payment amount, APR, risk score, etc.)
- Interactive repayment schedule bar chart
- Real-time calculations as you type

**Center - Insights Tab:**
- Deal strengths & considerations
- Pitch talking points
- Recommendations based on risk profile

**Right Panel - Pitch Summary:**
- Formatted pitch text ready to copy
- "Copy to Clipboard" button
- "Generate Email" placeholder (coming soon)

## 🎯 Key Metrics Explained

### Factor Rate (1.1x - 1.5x)
The multiplier applied to the advance amount. Default is 1.25x.
- **1.25x** = merchant pays back $1.25 for every $1.00 borrowed
- Lower = better deal for merchant

### Holdback Percentage (5% - 20%)
The percentage of daily/weekly revenue collected as payment.
- **10%** = default, balanced cash flow impact
- Higher = faster payback but more aggressive

### Risk Score (0-100)
Automated assessment based on:
- Credit score (300-850)
- Time in business (months)
- Revenue-to-advance ratio

**Score Ranges:**
- 70-100: Low Risk (green)
- 50-69: Medium Risk (yellow)
- 0-49: High Risk (red)

### Effective APR
Approximate annual percentage rate for comparison purposes.
- Calculated from total cost over term length
- Higher APR = more expensive for merchant

## 💾 How Data is Saved

All underwriting data is stored in the `underwriting_data` JSONB column on each lead:

```json
{
  "timeInBusiness": 36,
  "industry": "Restaurant",
  "creditScore": 680,
  "monthlyRevenue": 75000,
  "requestedAmount": 150000,
  "factorRate": 1.25,
  "holdbackPercent": 10,
  "paymentFrequency": "Daily",
  "termMonths": 12,
  "purposeOfFunds": "Equipment upgrade",
  "lastUpdated": "2026-04-17T..."
}
```

## 🚀 Quick Workflow

1. **Client calls asking for funding**
2. **Open their lead** → Click "Offers" column → Click "+ Create Deal"
3. **Fill in their details** (takes 60 seconds):
   - Time in business
   - Monthly revenue
   - Requested amount
   - Adjust factor rate and holdback as needed
4. **Review metrics** - Check risk score and approval probability
5. **Copy pitch summary** - Click "Copy to Clipboard"
6. **Paste in email or text** - Pitch is ready to send!
7. **Click "Save Deal"** - Data saved for future reference

## 📊 Chart Visualization

The repayment schedule chart shows:
- **Green bars**: Amount paid over time
- **Gray bars**: Remaining balance
- **12 data points**: From start through full term
- **Hover for details**: Exact dollar amounts at each period

## 🔮 Future Enhancements (Commented in Code)

```typescript
// TODO: AI Integration
// - AI-generated insights from deal parameters
// - Smart risk assessment with ML models

// TODO: Document OCR + Vision API
// - Upload bank statements, tax returns
// - Automatic data extraction
// - Document analysis for risk scoring
```

## 🎨 Customization

### Change Risk Scoring Logic

Edit `src/components/UnderwritingSuite.tsx`, function `calculateRiskScore()`:

```typescript
const calculateRiskScore = (): number => {
  let score = 50; // Start neutral
  
  // Adjust these weights as needed:
  if (data.creditScore >= 700) score += 20;
  if (data.timeInBusiness >= 36) score += 15;
  // Add your own criteria...
  
  return Math.max(0, Math.min(100, score));
};
```

### Add More Industries

Edit the `INDUSTRIES` array in `UnderwritingSuite.tsx`:

```typescript
const INDUSTRIES = [
  'Retail',
  'Restaurant',
  'E-commerce',
  'Services',
  'Your Industry Here', // Add more
];
```

### Customize Pitch Template

Edit the `generatePitchSummary()` function to match your pitch style.

## 🐛 Troubleshooting

**Button shows "+ Create Deal" but should show "📊 View Deal":**
- Make sure you clicked "Save Deal" after filling in data
- Check that the API route is working (check browser console)

**Charts not showing:**
- Recharts should be installed (we ran `npm install recharts`)
- Try refreshing the page

**Modal not opening:**
- Check browser console for errors
- Make sure UnderwritingSuite component is imported correctly

## 📁 Files Modified/Created

### New Files:
- `/src/components/UnderwritingSuite.tsx` - Main underwriting component
- `/src/app/api/leads/underwriting/route.ts` - API for saving data
- `/add-underwriting-data.sql` - Database migration
- `/UNDERWRITING_SUITE_SETUP.md` - This guide

### Modified Files:
- `/src/app/dashboard/CRMTable.tsx` - Integrated underwriting modal
- `/package.json` - Added recharts dependency

---

**You're all set!** 🎉

Your "Offers" column is now a powerful underwriting tool. Click any lead's "Offers" button to start creating professional deal analysis in seconds.

Questions? Check the inline comments in `UnderwritingSuite.tsx` for detailed explanations of each section.
