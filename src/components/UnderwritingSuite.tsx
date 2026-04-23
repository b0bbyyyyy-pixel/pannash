'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, BarChart, Bar, ComposedChart, Cell } from 'recharts';

interface UnderwritingData {
  // Merchant Info
  timeInBusiness: number;
  industry: string;
  creditScore: number;
  
  // Bank Statement Data (last 3 months)
  month1Revenue: number;
  month2Revenue: number;
  month3Revenue: number;
  avgDailyBalance: number;
  endingBalance: number;
  nsfCount: number;
  depositsCount: number;
  hasOtherMCALoans: boolean;
  otherMCAMonthlyPayment: number;
  otherMCALenders: string;
  
  // Additional Info
  requestedAmount: number;
  purposeOfFunds: string;
  
  // Offers Received Section
  actualOffers?: Array<{ 
    id: string; 
    lenderName: string; 
    amount: number; 
    factorRate: number; 
    buyRate?: number;
    addedPoints?: number;
    myCommissionPercent?: number;
    termLength?: number; 
    paymentFrequency?: string; 
    url?: string;
  }>;
  offersNotes?: string;
  selectedOfferId?: string | null;
  adjustedAmount?: number;
  negotiationAddedPoints?: number;
  
  // Commission & Funding
  points?: number;
  myPercentage?: number;
  commission?: number;
  isFunded?: boolean;
  
  // System will calculate these
  hasCalculated?: boolean;
  lastUpdated?: string;
  leadMaxAddedPoints?: number;
}

interface UnderwritingSuiteProps {
  leadId: string;
  leadName: string;
  initialData?: UnderwritingData;
  onClose: () => void;
  onSave: (data: UnderwritingData) => Promise<void>;
}

const DEFAULT_DATA: UnderwritingData = {
  timeInBusiness: 0,
  industry: 'Retail - General',
  creditScore: 0,
  month1Revenue: 0,
  month2Revenue: 0,
  month3Revenue: 0,
  avgDailyBalance: 0,
  endingBalance: 0,
  nsfCount: 0,
  depositsCount: 0,
  hasOtherMCALoans: false,
  otherMCAMonthlyPayment: 0,
  otherMCALenders: '',
  requestedAmount: 0,
  purposeOfFunds: '',
};

/** Hard cap for added / negotiation commission points (UI never goes above this). */
const COMMISSION_ADDED_POINTS_MAX = 15;

const INDUSTRIES = [
  // Retail & Food Service
  'Retail - General',
  'Retail - Clothing/Apparel',
  'Retail - Electronics',
  'Retail - Furniture',
  'Retail - Automotive Parts',
  'Retail - Grocery/Convenience Store',
  'Restaurant - Full Service',
  'Restaurant - Fast Food/QSR',
  'Restaurant - Bar/Nightclub',
  'Restaurant - Coffee Shop/Cafe',
  'Restaurant - Food Truck',
  'Catering Services',
  
  // E-commerce & Technology
  'E-commerce - General',
  'E-commerce - Dropshipping',
  'E-commerce - Amazon FBA',
  'Software/SaaS',
  'IT Services',
  'Web Design/Development',
  'Digital Marketing Agency',
  
  // Professional Services
  'Accounting/Bookkeeping',
  'Legal Services',
  'Consulting',
  'Real Estate Services',
  'Insurance Agency',
  'Financial Services',
  'Marketing/Advertising',
  'Staffing/Recruiting',
  
  // Healthcare & Wellness
  'Medical Practice',
  'Dental Practice',
  'Chiropractic',
  'Physical Therapy',
  'Mental Health Services',
  'Home Healthcare',
  'Medical Billing',
  'Pharmacy',
  'Fitness/Gym',
  'Spa/Salon',
  'Beauty Services',
  
  // Construction & Trades
  'General Contractor',
  'Plumbing',
  'Electrical',
  'HVAC',
  'Roofing',
  'Landscaping',
  'Painting',
  'Flooring',
  'Remodeling/Renovation',
  
  // Transportation & Logistics
  'Trucking/Freight',
  'Delivery Services',
  'Moving Company',
  'Auto Repair/Service',
  'Towing',
  'Courier Services',
  'Warehousing',
  
  // Manufacturing & Wholesale
  'Manufacturing - General',
  'Manufacturing - Food/Beverage',
  'Manufacturing - Textiles',
  'Wholesale Distribution',
  'Import/Export',
  
  // Hospitality & Entertainment
  'Hotel/Motel',
  'Event Planning',
  'Photography/Videography',
  'Entertainment Services',
  'Travel Agency',
  
  // Personal & Home Services
  'Cleaning Services',
  'Janitorial Services',
  'Pest Control',
  'Security Services',
  'Property Management',
  'Childcare/Daycare',
  'Pet Services',
  
  // Automotive
  'Auto Dealership - New',
  'Auto Dealership - Used',
  'Auto Detailing',
  'Car Wash',
  'Tire Shop',
  
  // Other Industries
  'Agriculture/Farming',
  'Education/Training',
  'Non-Profit',
  'Publishing/Media',
  'Telecommunications',
  'Printing Services',
  'Other',
];

export default function UnderwritingSuite({
  leadId,
  leadName,
  initialData,
  onClose,
  onSave,
}: UnderwritingSuiteProps) {
  const [data, setData] = useState<UnderwritingData>({ ...DEFAULT_DATA, ...initialData });
  const commissionPointsMax = COMMISSION_ADDED_POINTS_MAX;
  const [saving, setSaving] = useState(false);
  const [hasCalculated, setHasCalculated] = useState(initialData?.hasCalculated || false);
  
  // Actual offers received tracking
  const [actualOffers, setActualOffers] = useState<Array<{ 
    id: string; 
    lenderName: string; 
    amount: number; 
    offerType?: 'mca' | 'loc';
    // MCA fields
    factorRate: number; 
    buyRate?: number;
    addedPoints?: number;
    myCommissionPercent?: number;
    termLength?: number; 
    paymentFrequency?: string;
    // LOC fields
    monthlyAPR?: number;
    locTermMonths?: number;
    locPaymentFrequency?: string;
    url?: string;
  }>>(
    initialData?.actualOffers || []
  );
  const [newOfferType, setNewOfferType] = useState<'mca' | 'loc'>('mca');
  const [newOfferLender, setNewOfferLender] = useState('');
  const [newOfferAmount, setNewOfferAmount] = useState('');
  const [newOfferFactorRate, setNewOfferFactorRate] = useState('');
  const [newOfferBuyRate, setNewOfferBuyRate] = useState('');
  const [newOfferAddedPoints, setNewOfferAddedPoints] = useState('');
  const [newOfferMyCommissionPercent, setNewOfferMyCommissionPercent] = useState('');
  const [newOfferTermLength, setNewOfferTermLength] = useState('');
  const [newOfferPaymentFreq, setNewOfferPaymentFreq] = useState('Daily');
  const [newOfferUrl, setNewOfferUrl] = useState('');
  // LOC-specific state
  const [newOfferMonthlyAPR, setNewOfferMonthlyAPR] = useState('');
  const [newOfferLocTermMonths, setNewOfferLocTermMonths] = useState('');
  const [newOfferLocPaymentFreq, setNewOfferLocPaymentFreq] = useState('Monthly');
  const [offersNotes, setOffersNotes] = useState(initialData?.offersNotes || '');
  
  // Selected offer for negotiation
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(initialData?.selectedOfferId || null);
  const [adjustedAmount, setAdjustedAmount] = useState<number>(initialData?.adjustedAmount || 0);
  const [negotiationAddedPoints, setNegotiationAddedPoints] = useState(() => {
    const cap = COMMISSION_ADDED_POINTS_MAX;
    if (initialData?.negotiationAddedPoints != null) {
      return Math.min(initialData.negotiationAddedPoints, cap);
    }
    const o = (initialData?.actualOffers || []).find((x) => x.id === initialData?.selectedOfferId);
    if (o) {
      const br = o.buyRate ?? 1.2;
      if (o.addedPoints != null) return Math.max(0, Math.min(cap, o.addedPoints));
      const d = (o.factorRate - br) * 100;
      if (!Number.isNaN(d)) return Math.max(0, Math.min(cap, Math.round(d * 10) / 10));
    }
    return Math.min(5, cap);
  });

  useEffect(() => {
    setNegotiationAddedPoints((p) => Math.min(p, commissionPointsMax));
  }, [commissionPointsMax]);
  
  // Negotiation section collapse state
  const [isNegotiationCollapsed, setIsNegotiationCollapsed] = useState(false);

  // LOC draw slider
  const [locDrawAmount, setLocDrawAmount] = useState(0);
  // Quick view-mode type override per selected offer (so user can flip LOC↔MCA without editing)
  const [selectedOfferViewType, setSelectedOfferViewType] = useState<'loc' | 'mca' | null>(null);
  const effectiveSelectedOfferType = (offer: (typeof actualOffers)[number]) =>
    selectedOfferViewType ?? (offer.offerType === 'loc' ? 'loc' : 'mca');
  
  // Editing offers
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [editOfferType, setEditOfferType] = useState<'mca' | 'loc'>('mca');
  const [editOfferLender, setEditOfferLender] = useState('');
  const [editOfferAmount, setEditOfferAmount] = useState('');
  const [editOfferFactorRate, setEditOfferFactorRate] = useState('');
  const [editOfferBuyRate, setEditOfferBuyRate] = useState('');
  const [editOfferAddedPoints, setEditOfferAddedPoints] = useState('');
  const [editOfferMyCommissionPercent, setEditOfferMyCommissionPercent] = useState('');
  const [editOfferTermLength, setEditOfferTermLength] = useState('');
  const [editOfferPaymentFreq, setEditOfferPaymentFreq] = useState('Daily');
  const [editOfferUrl, setEditOfferUrl] = useState('');
  // LOC edit fields
  const [editOfferMonthlyAPR, setEditOfferMonthlyAPR] = useState('');
  const [editOfferLocTermMonths, setEditOfferLocTermMonths] = useState('');
  const [editOfferLocPaymentFreq, setEditOfferLocPaymentFreq] = useState('Monthly');
  
  // Commission: legacy `points` / `myPercentage` in saved data (no in-form editors — use offer "My Commission %")
  const [points] = useState<number>(initialData?.points || 0);
  const [myPercentage] = useState<number>(initialData?.myPercentage || 0);
  const [isFunded, setIsFunded] = useState<boolean>(initialData?.isFunded || false);
  
  // Get the selected offer
  const selectedOffer = actualOffers.find(o => o.id === selectedOfferId);
  const offerBuyForNegotiation = selectedOffer ? (selectedOffer.buyRate ?? 1.2) : 1.2;
  const negotiatedFactorRate = selectedOffer ? offerBuyForNegotiation + negotiationAddedPoints / 100 : 1.25;
  
  // When an offer is selected, initialize the adjusted amount to its original amount
  const handleSelectOffer = (offerId: string) => {
    // Allow deselection by clicking the same offer again
    if (selectedOfferId === offerId) {
      setSelectedOfferId(null);
      setAdjustedAmount(0);
      return;
    }
    
    const offer = actualOffers.find(o => o.id === offerId);
    if (offer) {
      setSelectedOfferId(offerId);
      setAdjustedAmount(offer.amount);
      setSelectedOfferViewType(null); // reset view-type toggle on new selection
      if (offer.offerType === 'loc') {
        setLocDrawAmount(offer.amount); // default draw = full credit limit
      } else {
        const br = offer.buyRate ?? 1.2;
        if (offer.addedPoints != null) {
          setNegotiationAddedPoints(Math.max(0, Math.min(commissionPointsMax, offer.addedPoints)));
        } else {
          const d = (offer.factorRate - br) * 100;
          setNegotiationAddedPoints(
            !Number.isNaN(d) ? Math.max(0, Math.min(commissionPointsMax, Math.round(d * 10) / 10)) : Math.min(5, commissionPointsMax)
          );
        }
      }
    }
  };

  // Extract and validate input data
  const requestedAmount = Number(data.requestedAmount) || 0;
  const creditScore = Number(data.creditScore) || 650;
  const timeInBusiness = Number(data.timeInBusiness) || 24;
  const month1Revenue = Number(data.month1Revenue) || 0;
  const month2Revenue = Number(data.month2Revenue) || 0;
  const month3Revenue = Number(data.month3Revenue) || 0;
  const avgDailyBalance = Number(data.avgDailyBalance) || 0;
  const endingBalance = Number(data.endingBalance) || 0;
  const nsfCount = Number(data.nsfCount) || 0;
  const depositsCount = Number(data.depositsCount) || 0;
  const hasOtherMCALoans = Boolean(data.hasOtherMCALoans);
  const otherMCAMonthlyPayment = Number(data.otherMCAMonthlyPayment) || 0;
  
  // Calculate average monthly revenue
  const avgMonthlyRevenue = (month1Revenue + month2Revenue + month3Revenue) / 3;
  // Underwriting rule of thumb: advance size is tied to the *weakest* month, not the average
  const revenueMonthValues = [month1Revenue, month2Revenue, month3Revenue].filter((r) => r > 0);
  const lowestMonthlyRevenue = revenueMonthValues.length > 0 ? Math.min(...revenueMonthValues) : 0;
  const revenueStability = month1Revenue > 0 && month2Revenue > 0 && month3Revenue > 0 
    ? 1 - (Math.abs(month1Revenue - month2Revenue) + Math.abs(month2Revenue - month3Revenue)) / (month1Revenue + month2Revenue + month3Revenue)
    : 0.5;
  
  // Calculate available revenue after existing MCA obligations
  const availableMonthlyRevenue = avgMonthlyRevenue - otherMCAMonthlyPayment;
  
  // CALCULATE RECOMMENDED OFFER TERMS based on financials
  const calculateOfferTerms = () => {
    let factorRate = 1.35; // Start higher, improve based on profile
    let holdbackPercent = 12; // Start moderate
    let termMonths = 9; // Start shorter
    let paymentFrequency: 'Daily' | 'Weekly' = 'Daily';
    let maxApprovedAmount = 0;
    
    // Industry Risk Adjustments (affects factor rate and approval amount)
    const industry = data.industry || 'Other';
    let industryRiskMultiplier = 1.0; // Default multiplier for max approved amount
    
    // LOW RISK Industries (better terms, higher approval amounts)
    if (industry.includes('Healthcare') || industry.includes('Medical') || industry.includes('Dental') || 
        industry.includes('Legal') || industry.includes('Accounting') || industry.includes('Insurance')) {
      factorRate -= 0.07;
      industryRiskMultiplier = 1.15;
    }
    // MODERATE-LOW RISK
    else if (industry.includes('Professional Services') || industry.includes('IT Services') || 
             industry.includes('Software') || industry.includes('SaaS') || industry.includes('Consulting') ||
             industry.includes('Financial Services')) {
      factorRate -= 0.04;
      industryRiskMultiplier = 1.10;
    }
    // MODERATE RISK
    else if (industry.includes('Retail - General') || industry.includes('E-commerce - General') ||
             industry.includes('Restaurant - Full Service') || industry.includes('Coffee Shop') ||
             industry.includes('Contractor') || industry.includes('Plumbing') || industry.includes('Electrical') ||
             industry.includes('HVAC') || industry.includes('Auto Repair')) {
      // No adjustment - baseline
      industryRiskMultiplier = 1.0;
    }
    // MODERATE-HIGH RISK
    else if (industry.includes('Restaurant - Fast Food') || industry.includes('Food Truck') ||
             industry.includes('Retail - Clothing') || industry.includes('Fitness') || industry.includes('Gym') ||
             industry.includes('Salon') || industry.includes('Beauty') || industry.includes('Pet Services') ||
             industry.includes('Cleaning') || industry.includes('Landscaping')) {
      factorRate += 0.04;
      industryRiskMultiplier = 0.90;
    }
    // HIGH RISK Industries (stricter terms, lower approval amounts)
    else if (industry.includes('Bar') || industry.includes('Nightclub') || 
             industry.includes('Trucking') || industry.includes('Moving') ||
             industry.includes('Construction') || industry.includes('Roofing') ||
             industry.includes('Auto Dealership') || industry.includes('Travel Agency') ||
             industry.includes('Entertainment') || industry.includes('Catering')) {
      factorRate += 0.07;
      industryRiskMultiplier = 0.80;
      holdbackPercent += 2; // Higher holdback for high-risk
    }
    // VERY HIGH RISK
    else if (industry.includes('Dropshipping') || industry.includes('Amazon FBA') ||
             industry.includes('Restaurant - Bar') || industry.includes('Event Planning') ||
             industry.includes('Non-Profit')) {
      factorRate += 0.10;
      industryRiskMultiplier = 0.70;
      holdbackPercent += 3;
    }
    
    // Factor Rate adjustments (1.15 - 1.45)
    if (creditScore >= 700) factorRate -= 0.10;
    else if (creditScore >= 650) factorRate -= 0.05;
    else if (creditScore < 600) factorRate += 0.05;
    
    if (timeInBusiness >= 36) factorRate -= 0.05;
    else if (timeInBusiness < 12) factorRate += 0.05;
    
    if (nsfCount === 0) factorRate -= 0.03;
    else if (nsfCount >= 3) factorRate += 0.05;
    
    if (revenueStability > 0.8) factorRate -= 0.03;
    else if (revenueStability < 0.5) factorRate += 0.03;
    
    // Deposits count adjustments (more deposits = better cash flow)
    if (depositsCount >= 13) factorRate -= 0.03; // Frequent deposits (13+ per month)
    else if (depositsCount >= 8) factorRate -= 0.01; // Good deposit frequency (8-12 per month)
    else if (depositsCount < 3) factorRate += 0.03; // Low deposits = higher risk (less than 3/month)
    
    // Existing MCA debt burden adjustments
    const debtToRevenueRatio = avgMonthlyRevenue > 0 ? otherMCAMonthlyPayment / avgMonthlyRevenue : 0;
    if (hasOtherMCALoans && otherMCAMonthlyPayment > 0) {
      if (debtToRevenueRatio > 0.25) factorRate += 0.08; // High debt burden (>25%)
      else if (debtToRevenueRatio > 0.15) factorRate += 0.05; // Moderate debt (15-25%)
      else if (debtToRevenueRatio > 0.10) factorRate += 0.03; // Low debt (10-15%)
    }
    
    // Holdback adjustments (8% - 18%)
    if (avgMonthlyRevenue >= 100000) holdbackPercent = 8;
    else if (avgMonthlyRevenue >= 50000) holdbackPercent = 10;
    else if (avgMonthlyRevenue >= 25000) holdbackPercent = 12;
    else holdbackPercent = 15;
    
    if (nsfCount >= 2) holdbackPercent += 2;
    if (avgDailyBalance < 5000) holdbackPercent += 2;
    
    // Increase holdback if they have existing MCA debt
    if (hasOtherMCALoans && debtToRevenueRatio > 0.15) holdbackPercent += 2;
    
    // Term length adjustments (6 - 18 months)
    if (creditScore >= 700 && timeInBusiness >= 36) termMonths = 15;
    else if (creditScore >= 650 && timeInBusiness >= 24) termMonths = 12;
    else if (timeInBusiness >= 12) termMonths = 9;
    else termMonths = 6;
    
    // Payment frequency
    if (avgMonthlyRevenue >= 75000 && revenueStability > 0.7) {
      paymentFrequency = 'Daily';
    } else if (avgMonthlyRevenue < 30000 || nsfCount >= 2) {
      paymentFrequency = 'Weekly';
    }
    
    // Max approved amount: industry practice is often ~1–2x the *lowest* month (weakest month drive servicing).
    // Do NOT use average×2.5 (that was inflating offers).
    const revenueForAdvance = lowestMonthlyRevenue > 0 ? lowestMonthlyRevenue : (avgMonthlyRevenue > 0 ? avgMonthlyRevenue : 0);
    if (revenueForAdvance <= 0) {
      maxApprovedAmount = 0;
    } else {
      // Base multiplier 1.0 – 1.25 before adjustments (stay in realistic 1–2x range)
      let advanceMult = 1.2;
      if (creditScore >= 720) advanceMult = 1.45;
      else if (creditScore >= 700) advanceMult = 1.35;
      else if (creditScore >= 650) advanceMult = 1.2;
      else if (creditScore >= 600) advanceMult = 1.05;
      else advanceMult = 0.95; // sub-600

      if (revenueStability < 0.4) advanceMult *= 0.9; // choppy revenue
      else if (revenueStability < 0.55) advanceMult *= 0.95;
      else if (revenueStability > 0.8) advanceMult *= 1.04;

      // Industry: stretch or tighten within ~0.9–1.1 on top of 1.2x base (not 0.7–1.15 on raw $)
      advanceMult *= Math.min(1.1, Math.max(0.88, industryRiskMultiplier * 0.95));

      if (hasOtherMCALoans && otherMCAMonthlyPayment > 0) {
        advanceMult *= debtToRevenueRatio > 0.25 ? 0.86 : debtToRevenueRatio > 0.15 ? 0.91 : 0.96;
        if (debtToRevenueRatio > 0.2) advanceMult *= 0.9;
        if (availableMonthlyRevenue > 0 && availableMonthlyRevenue < revenueForAdvance * 0.5) {
          advanceMult *= 0.94;
        }
      }

      if (nsfCount >= 3) advanceMult *= 0.9;
      else if (nsfCount >= 1) advanceMult *= 0.97;

      if (avgDailyBalance < 5000) advanceMult *= 0.95;
      else if (avgDailyBalance < 10000) advanceMult *= 0.98;

      // Hard cap: never above 2.0x lowest (or 2x single filled month) — aligns with "usually 1–2x"
      advanceMult = Math.max(0.85, Math.min(2.0, advanceMult));
      maxApprovedAmount = Math.floor(revenueForAdvance * advanceMult);
    }
    
    // Cap factor rate
    factorRate = Math.max(1.15, Math.min(1.50, factorRate)); // Increased max to 1.50 for high-risk
    holdbackPercent = Math.max(8, Math.min(20, holdbackPercent)); // Increased max to 20 for high-risk
    
    return {
      factorRate: Number(factorRate.toFixed(2)),
      holdbackPercent: Math.round(holdbackPercent),
      termMonths,
      paymentFrequency,
      maxApprovedAmount,
      approvedAmount: maxApprovedAmount
    };
  };
  
  const offerTerms = calculateOfferTerms();
  const approvedAmount = offerTerms.approvedAmount;
  const factorRate = offerTerms.factorRate;
  const holdbackPercent = offerTerms.holdbackPercent;
  const termMonths = offerTerms.termMonths;
  const paymentFrequency = offerTerms.paymentFrequency;
  
  const totalRepayment = approvedAmount * factorRate;
  const totalCost = totalRepayment - approvedAmount;
  const paymentsPerMonth = paymentFrequency === 'Daily' ? 22 : 4;
  const totalPayments = termMonths * paymentsPerMonth;
  const paymentAmount = totalPayments > 0 ? totalRepayment / totalPayments : 0;
  // Average $ applied per calendar month and per week (for UI — aligns with "weekly" quote style)
  const monthlyPaybackAvg = termMonths > 0 && totalRepayment > 0 ? totalRepayment / termMonths : 0;
  const WEEKS_PER_MONTH = 4.33;
  const weeklyPaymentEstimate = monthlyPaybackAvg > 0 ? monthlyPaybackAvg / WEEKS_PER_MONTH : 0;
  const dailyHoldback = avgMonthlyRevenue * (holdbackPercent / 100) / 22;
  
  // Simple APR calculation (approximate)
  const effectiveAPR = approvedAmount > 0 && termMonths > 0 
    ? ((totalCost / approvedAmount) / termMonths * 12 * 100).toFixed(1)
    : '0.0';
  
  // Commission: use My Commission % on the selected offer; legacy two-field (points × my share) if no offer
  const commissionBaseAmount = selectedOffer && adjustedAmount > 0 ? adjustedAmount : approvedAmount;
  const calculatedCommission = selectedOffer
    ? commissionBaseAmount * ((selectedOffer.myCommissionPercent || 0) / 100)
    : commissionBaseAmount * (points / 100) * (myPercentage / 100);
  
  // Risk score (0-100) — shown in Expected Offer box only
  const calculateRiskScore = (): number => {
    let score = 40;

    const industry = data.industry || 'Other';
    if (industry.includes('Healthcare') || industry.includes('Medical') || industry.includes('Dental') ||
        industry.includes('Legal') || industry.includes('Accounting') || industry.includes('Insurance')) {
      score += 20;
    } else if (industry.includes('IT Services') || industry.includes('Software') || industry.includes('SaaS') ||
               industry.includes('Consulting') || industry.includes('Financial Services')) {
      score += 12;
    } else if (industry.includes('Retail') && !industry.includes('Bar') && !industry.includes('Nightclub')) {
      score += 5;
    } else if (industry.includes('Restaurant') || industry.includes('Food')) {
      score -= 5;
    } else if (industry.includes('Agriculture') || industry.includes('Farming') || industry.includes('Farm')) {
      score -= 20;
    } else if (industry.includes('Bar') || industry.includes('Nightclub') || industry.includes('Trucking') ||
               industry.includes('Construction') || industry.includes('Roofing') || industry.includes('Auto Dealership')) {
      score -= 15;
    } else if (industry.includes('Dropshipping') || industry.includes('Amazon FBA') ||
               industry.includes('Event Planning') || industry.includes('Non-Profit')) {
      score -= 25;
    }

    if (creditScore >= 720) score += 25;
    else if (creditScore >= 680) score += 15;
    else if (creditScore >= 650) score += 5;
    else if (creditScore >= 620) score -= 5;
    else if (creditScore >= 580) score -= 15;
    else if (creditScore < 580) score -= 25;

    if (timeInBusiness >= 48) score += 18;
    else if (timeInBusiness >= 36) score += 12;
    else if (timeInBusiness >= 24) score += 6;
    else if (timeInBusiness >= 12) score -= 5;
    else if (timeInBusiness < 12) score -= 15;

    if (revenueStability > 0.9) score += 15;
    else if (revenueStability > 0.75) score += 8;
    else if (revenueStability > 0.5) score += 2;
    else if (revenueStability < 0.4) score -= 12;
    else if (revenueStability < 0.3) score -= 20;

    if (nsfCount === 0) score += 15;
    else if (nsfCount === 1) score -= 5;
    else if (nsfCount === 2) score -= 12;
    else if (nsfCount >= 3) score -= 20;
    else if (nsfCount >= 5) score -= 30;

    if (depositsCount >= 15) score += 12;
    else if (depositsCount >= 10) score += 6;
    else if (depositsCount >= 5) score += 0;
    else if (depositsCount < 5) score -= 10;
    else if (depositsCount < 3) score -= 18;

    if (avgDailyBalance >= 30000) score += 15;
    else if (avgDailyBalance >= 15000) score += 8;
    else if (avgDailyBalance >= 8000) score += 3;
    else if (avgDailyBalance < 5000) score -= 12;
    else if (avgDailyBalance < 2000) score -= 20;

    const monthlyRevRatio = approvedAmount > 0 && avgMonthlyRevenue > 0 ? avgMonthlyRevenue / approvedAmount : 0;
    if (monthlyRevRatio >= 0.6) score += 12;
    else if (monthlyRevRatio >= 0.4) score += 6;
    else if (monthlyRevRatio >= 0.25) score += 0;
    else if (monthlyRevRatio < 0.2) score -= 15;

    const debtRatio = avgMonthlyRevenue > 0 ? otherMCAMonthlyPayment / avgMonthlyRevenue : 0;
    if (debtRatio === 0) score += 8;
    else if (debtRatio > 0.30) score -= 20;
    else if (debtRatio > 0.20) score -= 12;
    else if (debtRatio > 0.10) score -= 5;

    return Math.max(0, Math.min(100, score));
  };

  const riskScore = calculateRiskScore();
  const riskScoreTextClass =
    riskScore >= 70 ? 'text-emerald-700' : riskScore >= 50 ? 'text-amber-700' : 'text-red-700';

  // Monthly payment for charts: per-period = totalRepay / termLength (same as offer card); scale to monthly using the offer’s frequency
  const calculateMonthlyPayment = (revenue: number) => {
    if (selectedOffer && adjustedAmount > 0) {
      const totalRepay = adjustedAmount * negotiatedFactorRate;
      const termLength = selectedOffer.termLength || 250;
      const perPeriod = totalRepay / termLength;
      const freq = selectedOffer.paymentFrequency || 'Daily';
      switch (freq) {
        case 'Daily':
          return perPeriod * 22;
        case 'Weekly':
          return perPeriod * 4.33;
        case 'Bi-Weekly':
          return perPeriod * 2.17;
        case 'Monthly':
        default:
          return perPeriod;
      }
    }
    if (hasCalculated && holdbackPercent > 0 && revenue > 0) {
      return revenue * (holdbackPercent / 100);
    }
    return 0;
  };

  // Generate revenue trend line chart data
  const generateRevenueTrendData = () => {
    const avgMonthlyRevenue = (month1Revenue + month2Revenue + month3Revenue) / 3;
    const projectedRevenue = avgMonthlyRevenue || month1Revenue || month2Revenue || month3Revenue || 0;
    
    return [
      { 
        month: 'Month 1', 
        revenue: month1Revenue || 0, 
        projection: month1Revenue || 0,
        payment: calculateMonthlyPayment(month1Revenue || projectedRevenue)
      },
      { 
        month: 'Month 2', 
        revenue: month2Revenue || 0, 
        projection: month2Revenue || 0,
        payment: calculateMonthlyPayment(month2Revenue || projectedRevenue)
      },
      { 
        month: 'Month 3', 
        revenue: month3Revenue || 0, 
        projection: month3Revenue || 0,
        payment: calculateMonthlyPayment(month3Revenue || projectedRevenue)
      },
      { 
        month: 'Projected', 
        revenue: null, 
        projection: projectedRevenue,
        payment: calculateMonthlyPayment(projectedRevenue)
      }
    ];
  };

  // Generate cash flow impact bar chart data - showing impact on key metrics
  const generateCashFlowImpactData = () => {
    const avgMonthlyRevenue = (month1Revenue + month2Revenue + month3Revenue) / 3 || 
                              month1Revenue || month2Revenue || month3Revenue || 0;
    const monthlyPayment = calculateMonthlyPayment(avgMonthlyRevenue);
    
    // Calculate impact on cash flow (retained after payment)
    const cashFlowAfterPayment = avgMonthlyRevenue - monthlyPayment;
    
    // Calculate impact on daily balance (estimate payment reduces it proportionally)
    const dailyPaymentImpact = monthlyPayment / 22; // ~22 business days
    const avgDailyBalanceAfter = Math.max(0, avgDailyBalance - (dailyPaymentImpact * 10)); // Impact over ~10 days
    
    // Calculate impact on ending balance (payment reduces monthly)
    const endingBalanceAfter = Math.max(0, endingBalance - monthlyPayment);
    
    return [
      {
        name: 'Monthly Cash Flow',
        before: avgMonthlyRevenue,
        after: cashFlowAfterPayment,
        impact: monthlyPayment
      },
      {
        name: 'Avg Daily Balance',
        before: avgDailyBalance,
        after: avgDailyBalanceAfter,
        impact: avgDailyBalance - avgDailyBalanceAfter
      },
      {
        name: 'Ending Balance',
        before: endingBalance,
        after: endingBalanceAfter,
        impact: monthlyPayment
      }
    ];
  };

  const revenueTrendData = generateRevenueTrendData();
  const cashFlowImpactData = generateCashFlowImpactData();

  const handleCalculate = () => {
    setHasCalculated(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ 
        ...data, 
        actualOffers,
        offersNotes,
        selectedOfferId,
        adjustedAmount,
        negotiationAddedPoints,
        leadMaxAddedPoints: commissionPointsMax,
        points,
        myPercentage,
        commission: calculatedCommission,
        isFunded,
        hasCalculated,
        lastUpdated: new Date().toISOString() 
      });
      alert('Underwriting data saved successfully!');
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save underwriting data');
    } finally {
      setSaving(false);
    }
  };

  const addActualOffer = () => {
    if (!newOfferLender.trim() || !newOfferAmount) {
      alert('Please fill in at least lender name and amount');
      return;
    }

    let newOffer: (typeof actualOffers)[number];

    if (newOfferType === 'loc') {
      if (!newOfferMonthlyAPR || !newOfferLocTermMonths) {
        alert('Please fill in Monthly APR % and Term Length for the Line of Credit');
        return;
      }
      newOffer = {
        id: Date.now().toString(),
        lenderName: newOfferLender.trim(),
        amount: Number(newOfferAmount),
        offerType: 'loc',
        factorRate: 0, // not used for LOC
        monthlyAPR: Number(newOfferMonthlyAPR),
        locTermMonths: Number(newOfferLocTermMonths),
        locPaymentFrequency: newOfferLocPaymentFreq || 'Monthly',
        url: newOfferUrl.trim() || undefined,
      };
    } else {
      const buyRate = Number(newOfferBuyRate) || 1.20;
      const addedPoints = Math.min(commissionPointsMax, newOfferAddedPoints === '' ? 0 : Number(newOfferAddedPoints));
      const calculatedFactorRate = buyRate + (addedPoints / 100);
      newOffer = {
        id: Date.now().toString(),
        lenderName: newOfferLender.trim(),
        amount: Number(newOfferAmount),
        offerType: 'mca',
        factorRate: calculatedFactorRate,
        buyRate,
        addedPoints,
        myCommissionPercent: Number(newOfferMyCommissionPercent) || 0,
        termLength: Number(newOfferTermLength) || 250,
        paymentFrequency: newOfferPaymentFreq || 'Daily',
        url: newOfferUrl.trim() || undefined,
      };
    }

    setActualOffers([...actualOffers, newOffer]);
    setNewOfferLender('');
    setNewOfferAmount('');
    setNewOfferFactorRate('');
    setNewOfferBuyRate('');
    setNewOfferAddedPoints('');
    setNewOfferMyCommissionPercent('');
    setNewOfferTermLength('');
    setNewOfferPaymentFreq('Daily');
    setNewOfferUrl('');
    setNewOfferMonthlyAPR('');
    setNewOfferLocTermMonths('');
    setNewOfferLocPaymentFreq('Monthly');
  };

  const deleteActualOffer = (offerId: string) => {
    setActualOffers(actualOffers.filter(offer => offer.id !== offerId));
    // Clear selection and editing if the deleted offer was selected/being edited
    if (selectedOfferId === offerId) {
      setSelectedOfferId(null);
      setAdjustedAmount(0);
    }
    if (editingOfferId === offerId) {
      setEditingOfferId(null);
    }
  };

  const startEditOffer = (offer: (typeof actualOffers)[number]) => {
    setEditingOfferId(offer.id);
    setEditOfferType(offer.offerType === 'loc' ? 'loc' : 'mca');
    setEditOfferLender(offer.lenderName);
    setEditOfferAmount(offer.amount.toString());
    setEditOfferFactorRate(offer.factorRate.toString());
    setEditOfferBuyRate((offer.buyRate || 1.20).toString());
    setEditOfferAddedPoints((offer.addedPoints || 0).toString());
    setEditOfferMyCommissionPercent((offer.myCommissionPercent || 0).toString());
    setEditOfferTermLength((offer.termLength || 250).toString());
    setEditOfferPaymentFreq(offer.paymentFrequency || 'Daily');
    setEditOfferUrl(offer.url || '');
    // LOC fields
    setEditOfferMonthlyAPR((offer.monthlyAPR ?? '').toString());
    setEditOfferLocTermMonths((offer.locTermMonths ?? '').toString());
    setEditOfferLocPaymentFreq(offer.locPaymentFrequency || 'Monthly');
  };

  const saveEditOffer = () => {
    if (!editOfferLender.trim() || !editOfferAmount) {
      alert('Please fill in at least lender name and amount');
      return;
    }

    if (editOfferType === 'loc') {
      if (!editOfferMonthlyAPR || !editOfferLocTermMonths) {
        alert('Please fill in Monthly APR % and Term Length for the Line of Credit');
        return;
      }
      setActualOffers(actualOffers.map(offer =>
        offer.id === editingOfferId
          ? {
              ...offer,
              lenderName: editOfferLender.trim(),
              amount: Number(editOfferAmount),
              offerType: 'loc' as const,
              factorRate: 0,
              buyRate: undefined,
              addedPoints: undefined,
              myCommissionPercent: undefined,
              termLength: undefined,
              paymentFrequency: undefined,
              monthlyAPR: Number(editOfferMonthlyAPR),
              locTermMonths: Number(editOfferLocTermMonths),
              locPaymentFrequency: editOfferLocPaymentFreq || 'Monthly',
              url: editOfferUrl.trim() || undefined,
            }
          : offer
      ));
    } else {
      const buyRate = Number(editOfferBuyRate) || 1.20;
      const addedPoints = Math.min(commissionPointsMax, editOfferAddedPoints === '' ? 0 : Number(editOfferAddedPoints));
      const calculatedFactorRate = buyRate + (addedPoints / 100);
      setActualOffers(actualOffers.map(offer =>
        offer.id === editingOfferId
          ? {
              ...offer,
              lenderName: editOfferLender.trim(),
              amount: Number(editOfferAmount),
              offerType: 'mca' as const,
              factorRate: calculatedFactorRate,
              buyRate,
              addedPoints,
              myCommissionPercent: Number(editOfferMyCommissionPercent) || 0,
              termLength: Number(editOfferTermLength) || 250,
              paymentFrequency: editOfferPaymentFreq || 'Daily',
              monthlyAPR: undefined,
              locTermMonths: undefined,
              locPaymentFrequency: undefined,
              url: editOfferUrl.trim() || undefined,
            }
          : offer
      ));
      if (selectedOfferId === editingOfferId) {
        setAdjustedAmount(Number(editOfferAmount));
        setNegotiationAddedPoints(addedPoints);
      }
    }

    setEditingOfferId(null);
  };

  const cancelEditOffer = () => {
    setEditingOfferId(null);
    setEditOfferLender('');
    setEditOfferAmount('');
    setEditOfferFactorRate('');
    setEditOfferUrl('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-[1600px] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Underwriting Suite</h1>
            <p className="text-sm text-gray-600 mt-1">{leadName}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[#5a7fc7] text-white rounded-md text-sm font-medium hover:bg-[#4a6fb7] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Deal'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Financial Data Inputs */}
          <div className="w-80 border-r border-gray-200 p-6 overflow-y-auto bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Input Financials</h2>
            
            {/* Business Info */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Business Info</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-2">Time in Business</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Years</label>
                      <input
                        type="number"
                        value={Math.floor((data.timeInBusiness || 0) / 12)}
                        onChange={(e) => {
                          const years = Number(e.target.value) || 0;
                          const months = (data.timeInBusiness || 0) % 12;
                          setData({ ...data, timeInBusiness: years * 12 + months });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                        min="0"
                        placeholder="2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Months</label>
                      <input
                        type="number"
                        value={(data.timeInBusiness || 0) % 12}
                        onChange={(e) => {
                          const years = Math.floor((data.timeInBusiness || 0) / 12);
                          const months = Number(e.target.value) || 0;
                          setData({ ...data, timeInBusiness: years * 12 + months });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                        min="0"
                        max="11"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Industry</label>
                  <select
                    value={data.industry || 'Retail - General'}
                    onChange={(e) => setData({ ...data, industry: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                  >
                    {INDUSTRIES.map((industry) => (
                      <option key={industry} value={industry}>{industry}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Credit Score</label>
                  <input
                    type="number"
                    value={data.creditScore || ''}
                    onChange={(e) => setData({ ...data, creditScore: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    min="300"
                    max="850"
                    placeholder="650"
                  />
                </div>
              </div>
            </div>

            {/* Bank Statement Data */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Bank Statements (Last 3 Months)</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs text-gray-600">Month 1 Revenue</label>
                    <span className="text-sm font-semibold text-gray-900">${Math.round(data.month1Revenue || 0).toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    value={data.month1Revenue || 0}
                    onChange={(e) => setData({ ...data, month1Revenue: Number(e.target.value) })}
                    min="0"
                    max="500000"
                    step="500"
                    className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-[#5a7fc7]"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>$0</span>
                    <span>$500k</span>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs text-gray-600">Month 2 Revenue</label>
                    <span className="text-sm font-semibold text-gray-900">${Math.round(data.month2Revenue || 0).toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    value={data.month2Revenue || 0}
                    onChange={(e) => setData({ ...data, month2Revenue: Number(e.target.value) })}
                    min="0"
                    max="500000"
                    step="500"
                    className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-[#5a7fc7]"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>$0</span>
                    <span>$500k</span>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs text-gray-600">Month 3 Revenue</label>
                    <span className="text-sm font-semibold text-gray-900">${Math.round(data.month3Revenue || 0).toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    value={data.month3Revenue || 0}
                    onChange={(e) => setData({ ...data, month3Revenue: Number(e.target.value) })}
                    min="0"
                    max="500000"
                    step="500"
                    className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-[#5a7fc7]"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>$0</span>
                    <span>$500k</span>
                  </div>
                </div>
                
                <div className="pt-2 border-t border-gray-300">
                  <div className="text-xs text-gray-600 mb-1">Average Monthly Revenue</div>
                  <div className="text-lg font-bold text-gray-900">
                    ${Math.round(avgMonthlyRevenue).toLocaleString()}
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs text-gray-600">Average Daily Balance</label>
                    <span className="text-sm font-semibold text-gray-900">${Math.round(data.avgDailyBalance || 0).toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    value={data.avgDailyBalance || 0}
                    onChange={(e) => setData({ ...data, avgDailyBalance: Number(e.target.value) })}
                    min="0"
                    max="100000"
                    step="500"
                    className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-[#5a7fc7]"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>$0</span>
                    <span>$100k</span>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs text-gray-600">Ending Balance</label>
                    <span className="text-sm font-semibold text-gray-900">${Math.round(data.endingBalance || 0).toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    value={data.endingBalance || 0}
                    onChange={(e) => setData({ ...data, endingBalance: Number(e.target.value) })}
                    min="0"
                    max="100000"
                    step="500"
                    className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-[#5a7fc7]"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>$0</span>
                    <span>$100k</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 mb-1">NSF Count (3 months)</label>
                  <input
                    type="number"
                    value={data.nsfCount || ''}
                    onChange={(e) => setData({ ...data, nsfCount: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    min="0"
                    max="50"
                    placeholder="0"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Average Monthly Deposits</label>
                  <input
                    type="number"
                    value={data.depositsCount || ''}
                    onChange={(e) => setData({ ...data, depositsCount: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    min="0"
                    max="100"
                    placeholder="10"
                  />
                  <p className="text-xs text-gray-500 mt-1">Average deposits per month</p>
                </div>
                
                <div className="pt-3 border-t border-gray-300 space-y-3">
                  <label className="flex items-center text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                    <input
                      type="checkbox"
                      checked={data.hasOtherMCALoans || false}
                      onChange={(e) => setData({ ...data, hasOtherMCALoans: e.target.checked, otherMCAMonthlyPayment: e.target.checked ? data.otherMCAMonthlyPayment : 0 })}
                      className="mr-2 w-4 h-4 text-[#5a7fc7] focus:ring-[#5a7fc7] border-gray-300 rounded"
                    />
                    <span>Has Other MCA Loans</span>
                  </label>
                  
                  {data.hasOtherMCALoans && (
                    <div className="ml-6 bg-orange-50 border border-orange-200 rounded-md p-3 space-y-3">
                      <div>
                        <label className="block text-xs text-gray-700 mb-1 font-medium">MCA Lender Names</label>
                        <input
                          type="text"
                          value={data.otherMCALenders || ''}
                          onChange={(e) => setData({ ...data, otherMCALenders: e.target.value })}
                          className="w-full px-3 py-2 border border-orange-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="e.g., Fundbox, OnDeck..."
                        />
                        <p className="text-xs text-gray-600 mt-1">List all MCA lenders (comma separated)</p>
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-700 mb-1 font-medium">Monthly MCA Payment</label>
                        <input
                          type="number"
                          value={data.otherMCAMonthlyPayment || ''}
                          onChange={(e) => setData({ ...data, otherMCAMonthlyPayment: Number(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-orange-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          min="0"
                          step="100"
                          placeholder="e.g., 5000"
                        />
                        <p className="text-xs text-gray-600 mt-1">Total monthly payment for all existing MCA loans</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Expected Offer */}
            <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-3">Expected Offer</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-blue-800">Max Approved Amount:</span>
                  <span className="text-lg font-bold text-blue-900">
                    ${Math.round(approvedAmount).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-blue-800">Factor Rate:</span>
                  <span className="text-base font-semibold text-blue-900">
                    {Number(factorRate).toFixed(2)}x
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-blue-800">Risk score:</span>
                  <span className={`text-base font-bold tabular-nums ${riskScoreTextClass}`}>
                    {riskScore}
                    <span className="text-xs font-semibold text-blue-800/80 ml-1">/ 100</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-blue-800">Est. weekly payback (avg. over {termMonths} mo):</span>
                  <span className="text-base font-semibold text-blue-900">
                    ${Math.round(weeklyPaymentEstimate).toLocaleString()}
                  </span>
                </div>
                <p className="text-[10px] text-blue-700/80 leading-tight">
                  Modeled {paymentFrequency.toLowerCase()} remittance; week = monthly payback ÷ 4.33
                </p>
                <div className="flex justify-between items-center pt-2 border-t border-blue-300">
                  <span className="text-xs text-blue-800">Holdback %:</span>
                  <span className="text-sm font-medium text-blue-900">
                    {holdbackPercent}%
                  </span>
                </div>
              </div>
              <p className="text-xs text-blue-700 mt-3">
                Click "Calculate Offer" to see full analysis
              </p>
            </div>
            
            {/* Calculate Button */}
            <div className="mt-6">
              <button
                onClick={handleCalculate}
                className="w-full px-4 py-3 bg-[#5a7fc7] text-white rounded-md text-sm font-semibold hover:bg-[#4a6fb7] transition-colors"
              >
                Calculate Offer
              </button>
            </div>
          </div>

          {/* Center - Analysis & Charts */}
          <div className="flex-1 p-6 overflow-y-auto">
            {!hasCalculated ? (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Ready to Calculate</h3>
                <p className="text-gray-600 max-w-md">
                  Enter the merchant's financial data in the left panel and click "Calculate Offer" to see recommended terms and analysis.
                </p>
              </div>
            ) : (
              <>
                {/* Calculate display values - use selected offer if available, otherwise use calculated recommendation */}
                {(() => {
                  let displayAmount: number;
                  let displayFactorRate: number;
                  let displayAPR: string;
                  let displayMonthlyPayment: number;
                  let displayTermLength: number = 250; // Default fallback
                  let displayPaymentFreq: string = 'Daily'; // Default fallback
                  
                  if (selectedOffer && adjustedAmount > 0) {
                    // Use selected offer data
                    displayAmount = adjustedAmount;
                    displayFactorRate = negotiatedFactorRate;
                    displayTermLength = selectedOffer.termLength || 250;
                    displayPaymentFreq = selectedOffer.paymentFrequency || 'Daily';
                    
                    const selectedTotalRepayment = displayAmount * displayFactorRate;
                    const selectedTotalCost = selectedTotalRepayment - displayAmount;
                    const selectedPayment = selectedTotalRepayment / displayTermLength;
                    
                    // Convert term length to months for APR calculation
                    let paymentsPerMonthForOffer = 0;
                    switch (displayPaymentFreq) {
                      case 'Daily': paymentsPerMonthForOffer = 22; break;
                      case 'Weekly': paymentsPerMonthForOffer = 4; break;
                      case 'Bi-Weekly': paymentsPerMonthForOffer = 2; break;
                      case 'Monthly': paymentsPerMonthForOffer = 1; break;
                    }
                    const termMonthsForOffer = displayTermLength / paymentsPerMonthForOffer;
                    displayAPR = displayAmount > 0 && termMonthsForOffer > 0 
                      ? ((selectedTotalCost / displayAmount) / termMonthsForOffer * 12 * 100).toFixed(1)
                      : '0.0';
                    displayMonthlyPayment = selectedPayment * paymentsPerMonthForOffer;
                  } else {
                    // Use calculated recommendation — quote weekly (avg) for clarity; % of sales still from monthly model
                    displayAmount = approvedAmount;
                    displayFactorRate = factorRate;
                    displayAPR = effectiveAPR;
                    displayMonthlyPayment = monthlyPaybackAvg;
                    displayTermLength = totalPayments;
                    displayPaymentFreq = 'Weekly';
                  }
                  
                  const displayPaymentPercent = ((displayMonthlyPayment / avgMonthlyRevenue) * 100).toFixed(1);
                  const displayRevenueAfterPayment = avgMonthlyRevenue - displayMonthlyPayment;
                  const displayRetainedPercent = ((displayRevenueAfterPayment / avgMonthlyRevenue) * 100).toFixed(0);
                  const displayRevenueRatio = (avgMonthlyRevenue / displayMonthlyPayment).toFixed(1);

                  const tibMonths = Math.max(0, Math.round(Number(data.timeInBusiness) || 0));
                  const tibY = Math.floor(tibMonths / 12);
                  const tibM = tibMonths % 12;
                  const timeInBusinessLabel =
                    tibMonths === 0
                      ? '—'
                      : tibY > 0 && tibM > 0
                        ? `${tibY} yr${tibY === 1 ? '' : 's'} ${tibM} mo`
                        : tibY > 0
                          ? `${tibY} yr${tibY === 1 ? '' : 's'}`
                          : `${tibM} mo`;
                  
                  // Calculate individual payment per frequency
                  let displayIndividualPayment;
                  let displayFrequency;
                  if (selectedOffer && adjustedAmount > 0) {
                    displayFrequency = displayPaymentFreq;
                    const totalRepay = adjustedAmount * displayFactorRate;
                    displayIndividualPayment = totalRepay / displayTermLength;
                  } else {
                    displayFrequency = 'Weekly';
                    displayIndividualPayment = weeklyPaymentEstimate;
                  }
                  
                  const hasActualOffer = !!(selectedOffer && adjustedAmount > 0);

                  return (
                    <>
                      {/* Big 3 Colored Boxes - Top (only populated from actual selected offer) */}
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className={`bg-gradient-to-br from-green-50 to-emerald-50 border-2 rounded-lg p-5 ${hasActualOffer ? 'border-green-300' : 'border-green-100'}`}>
                          <div className="text-xs text-green-700 font-medium mb-1">Offer Amount</div>
                          {hasActualOffer ? (
                            <>
                              <div className="text-4xl font-bold text-green-600">
                                ${Math.round(displayAmount).toLocaleString()}
                              </div>
                              <div className="text-sm text-green-700 mt-1 font-medium">Funding amount</div>
                            </>
                          ) : (
                            <>
                              <div className="text-4xl font-bold text-green-200">—</div>
                              <div className="text-sm text-green-400 mt-1">Select an actual offer</div>
                            </>
                          )}
                        </div>
                        
                        <div className={`bg-gradient-to-br from-blue-50 to-indigo-50 border-2 rounded-lg p-5 ${hasActualOffer ? 'border-blue-300' : 'border-blue-100'}`}>
                          <div className="text-xs text-blue-700 font-medium mb-1">{displayFrequency} Payment</div>
                          {hasActualOffer ? (
                            <>
                              <div className="text-4xl font-bold text-blue-600">
                                ${Math.round(displayIndividualPayment).toLocaleString()}
                              </div>
                              <div className="text-sm text-blue-700 mt-1">{displayFrequency} payment amount</div>
                            </>
                          ) : (
                            <>
                              <div className="text-4xl font-bold text-blue-200">—</div>
                              <div className="text-sm text-blue-400 mt-1">Select an actual offer</div>
                            </>
                          )}
                        </div>
                        
                        <div className={`bg-gradient-to-br from-purple-50 to-violet-50 border-2 rounded-lg p-5 ${hasActualOffer ? 'border-purple-300' : 'border-purple-100'}`}>
                          <div className="text-xs text-purple-700 font-medium mb-1">Monthly Payment % of Sales</div>
                          {hasActualOffer ? (
                            <>
                              <div className="text-4xl font-bold text-purple-600">{displayPaymentPercent}%</div>
                              <div className="text-sm text-purple-700 mt-1">Of monthly revenue</div>
                            </>
                          ) : (
                            <>
                              <div className="text-4xl font-bold text-purple-200">—</div>
                              <div className="text-sm text-purple-400 mt-1">Select an actual offer</div>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* 4 Smaller Boxes — Credit Score & Time in Business always show (inputs), rest need actual offer */}
                      <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="text-sm text-gray-600 mb-2 font-medium">Credit Score</div>
                          <div className="text-3xl font-bold text-gray-900">{creditScore}</div>
                        </div>
                        
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="text-sm text-gray-600 mb-2 font-medium">Loan APR</div>
                          {hasActualOffer ? (
                            <div className="text-3xl font-bold text-gray-900">{displayAPR}%</div>
                          ) : (
                            <div className="text-3xl font-bold text-gray-300">—</div>
                          )}
                        </div>
                        
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="text-sm text-gray-600 mb-2 font-medium">Time in Business</div>
                          <div className="text-3xl font-bold text-gray-900">{timeInBusinessLabel}</div>
                        </div>
                        
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="text-sm text-gray-600 mb-2 font-medium">Revenue After Payment</div>
                          {hasActualOffer ? (
                            <>
                              <div className="text-2xl font-bold text-blue-600">
                                ${Math.round(displayRevenueAfterPayment).toLocaleString()}
                              </div>
                              <div className="text-sm text-gray-500 mt-1 font-medium">{displayRetainedPercent}% retained</div>
                            </>
                          ) : (
                            <div className="text-3xl font-bold text-gray-300">—</div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* Revenue Trend Line Chart */}
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-6 mb-6 shadow-lg">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Revenue Trend Analysis</h3>
                  <p className="text-sm text-gray-600 mb-4">Track revenue patterns and forecast future performance</p>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart 
                      data={revenueTrendData}
                      margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9d5ff" />
                      <XAxis 
                        dataKey="month" 
                        tick={{ fill: '#6b21a8', fontWeight: 600 }}
                        axisLine={{ stroke: '#c084fc' }}
                      />
                      <YAxis 
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                        tick={{ fill: '#6b21a8', fontWeight: 500 }}
                        axisLine={{ stroke: '#c084fc' }}
                      />
                      <Tooltip 
                        formatter={(value: any) => typeof value === 'number' ? `$${value.toLocaleString()}` : value}
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          border: '2px solid #8b5cf6',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                          fontWeight: 600
                        }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#8b5cf6" 
                        strokeWidth={4} 
                        dot={{ r: 6, fill: '#8b5cf6', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 8 }}
                        name="Actual Revenue"
                        connectNulls={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="projection" 
                        stroke="#ec4899" 
                        strokeWidth={3} 
                        strokeDasharray="8 4"
                        dot={{ r: 4, fill: '#ec4899' }}
                        name="Projection"
                      />
                      {(selectedOffer || hasCalculated) && (
                        <Line 
                          type="monotone" 
                          dataKey="payment" 
                          stroke="#ef4444" 
                          strokeWidth={3} 
                          strokeDasharray="4 4"
                          dot={{ r: 5, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                          name="Monthly Payment"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Financial Impact Analysis Chart - Dark Theme */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-gray-900 border-2 border-slate-700 rounded-xl p-6 mb-6 shadow-2xl">
                  <h3 className="text-2xl font-bold text-white mb-2">Financial Impact Analysis</h3>
                  <p className="text-sm text-slate-300 mb-4">See how payments affect your key financial metrics</p>
                  <ResponsiveContainer width="100%" height={420}>
                    <BarChart 
                      data={cashFlowImpactData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    >
                      <defs>
                        <linearGradient id="colorBefore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1e293b" stopOpacity={1}/>
                          <stop offset="95%" stopColor="#334155" stopOpacity={0.95}/>
                        </linearGradient>
                        <linearGradient id="colorAfter" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.95}/>
                          <stop offset="95%" stopColor="#059669" stopOpacity={0.9}/>
                        </linearGradient>
                        
                        {/* Glow effects */}
                        <filter id="glow">
                          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                          <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.3} />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fill: '#cbd5e1', fontWeight: 700, fontSize: 12 }}
                        axisLine={{ stroke: '#64748b', strokeWidth: 2 }}
                      />
                      <YAxis 
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                        tick={{ fill: '#cbd5e1', fontWeight: 600, fontSize: 12 }}
                        axisLine={{ stroke: '#64748b', strokeWidth: 2 }}
                      />
                      <Tooltip 
                        formatter={(value: any) => typeof value === 'number' ? `$${value.toLocaleString()}` : value}
                        contentStyle={{ 
                          backgroundColor: '#1e293b', 
                          border: '2px solid #475569',
                          borderRadius: '12px',
                          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                          fontWeight: 700,
                          color: '#f1f5f9'
                        }}
                        labelStyle={{ color: '#f1f5f9', fontWeight: 700 }}
                        cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
                      />
                      <Legend 
                        wrapperStyle={{ color: '#cbd5e1', fontWeight: 600 }}
                        iconType="circle"
                      />
                      <Bar 
                        dataKey="before" 
                        fill="url(#colorBefore)"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={80}
                        name="Before Payment"
                        stroke="#475569"
                        strokeWidth={2}
                        filter="url(#glow)"
                      />
                      <Bar 
                        dataKey="after" 
                        fill="url(#colorAfter)"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={80}
                        name="After Payment"
                        stroke="#065f46"
                        strokeWidth={2}
                        filter="url(#glow)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  {cashFlowImpactData[0]?.before > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {cashFlowImpactData.map((item, idx) => (
                        <div key={idx} className="bg-slate-800/50 border border-slate-600 rounded-lg p-3 text-center">
                          <p className="text-xs font-semibold text-slate-400 mb-1">{item.name}</p>
                          <p className="text-lg font-black text-red-400">
                            -{item.impact > 0 ? `$${Math.round(item.impact / 1000)}k` : '$0'}
                          </p>
                          <p className="text-xs text-slate-500">Impact</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </>
            )}
          </div>

          {/* Right Panel - Actual Offers Received */}
          <div className="w-96 border-l border-gray-200 p-6 overflow-y-auto bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actual Offers Received</h2>
            
            {/* Saved Offers List - Now at top */}
            {actualOffers.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Saved Offers</h3>
                <div className="space-y-2">
                  {actualOffers.map((offer, index) => {
                    const totalRepayment = offer.amount * offer.factorRate;
                    const color = ['#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][index % 4];
                    const isEditing = editingOfferId === offer.id;
                    
                    return (
                      <div 
                        key={offer.id}
                        className={`bg-white border-2 rounded-lg p-3 hover:shadow-md transition-all ${selectedOfferId === offer.id ? 'ring-2 ring-green-500' : ''}`}
                        style={{ borderColor: color }}
                      >
                        {isEditing ? (
                          // Edit Mode
                          <div className="space-y-3">
                            {/* Type toggle */}
                            <div className="flex rounded-md overflow-hidden border border-gray-300 text-xs font-medium">
                              <button type="button" onClick={() => setEditOfferType('mca')}
                                className={`flex-1 py-1.5 transition-colors ${editOfferType === 'mca' ? 'bg-[#5a7fc7] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                                MCA / Term Loan
                              </button>
                              <button type="button" onClick={() => setEditOfferType('loc')}
                                className={`flex-1 py-1.5 transition-colors border-l border-gray-300 ${editOfferType === 'loc' ? 'bg-[#5a7fc7] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                                Line of Credit
                              </button>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Lender Name</label>
                              <input type="text" value={editOfferLender} onChange={(e) => setEditOfferLender(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">{editOfferType === 'loc' ? 'Credit Limit' : 'Amount'}</label>
                              <input type="number" value={editOfferAmount} onChange={(e) => setEditOfferAmount(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                                min="0" step="1000" />
                            </div>

                            {editOfferType === 'loc' ? (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-xs text-gray-600 mb-1">Monthly APR %</label>
                                    <input type="number" value={editOfferMonthlyAPR} onChange={(e) => setEditOfferMonthlyAPR(e.target.value)}
                                      placeholder="e.g., 2.5"
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                                      min="0" step="0.1" />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-600 mb-1">Term (months)</label>
                                    <input type="number" value={editOfferLocTermMonths} onChange={(e) => setEditOfferLocTermMonths(e.target.value)}
                                      placeholder="e.g., 12"
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                                      min="1" step="1" />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Payment Frequency</label>
                                  <select value={editOfferLocPaymentFreq} onChange={(e) => setEditOfferLocPaymentFreq(e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]">
                                    <option value="Weekly">Weekly</option>
                                    <option value="Monthly">Monthly</option>
                                  </select>
                                </div>
                                {editOfferAmount && editOfferMonthlyAPR && editOfferLocTermMonths && (() => {
                                  const P = Number(editOfferAmount);
                                  const r = Number(editOfferMonthlyAPR) / 100;
                                  const n = Number(editOfferLocTermMonths);
                                  const moPmt = r === 0 ? P / n : P * (r * Math.pow(1+r,n)) / (Math.pow(1+r,n)-1);
                                  const freq = editOfferLocPaymentFreq;
                                  const pmt = freq === 'Weekly' ? moPmt * 12 / 52 : moPmt;
                                  return <p className="text-xs text-gray-500">{freq} payment: <span className="font-semibold text-gray-700">${Math.round(pmt).toLocaleString()}</span></p>;
                                })()}
                              </>
                            ) : (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-xs text-gray-600 mb-1">Buy Rate</label>
                                    <input type="number" value={editOfferBuyRate} onChange={(e) => setEditOfferBuyRate(e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                                      min="1" max="2" step="0.01" />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-600 mb-1">Added Points</label>
                                    <input type="number" value={editOfferAddedPoints} onChange={(e) => setEditOfferAddedPoints(e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                                      min="0" max={commissionPointsMax} step="0.5" />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">My Commission %</label>
                                  <input type="number" value={editOfferMyCommissionPercent} onChange={(e) => setEditOfferMyCommissionPercent(e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                                    min="0" max="100" step="5" />
                                  <p className="text-xs text-gray-500 mt-1">
                                    Factor Rate: {(Number(editOfferBuyRate || 1.20) + ((editOfferAddedPoints === '' ? 0 : Number(editOfferAddedPoints)) / 100)).toFixed(3)}x
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Term Length (# Payments)</label>
                                  <input type="number" value={editOfferTermLength} onChange={(e) => setEditOfferTermLength(e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                                    min="1" step="1" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Payment Frequency</label>
                                  <select value={editOfferPaymentFreq} onChange={(e) => setEditOfferPaymentFreq(e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]">
                                    <option value="Daily">Daily</option>
                                    <option value="Weekly">Weekly</option>
                                    <option value="Bi-Weekly">Bi-Weekly</option>
                                    <option value="Monthly">Monthly</option>
                                  </select>
                                </div>
                              </>
                            )}

                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Link (Optional)</label>
                              <input type="url" value={editOfferUrl} onChange={(e) => setEditOfferUrl(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={saveEditOffer}
                                className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
                                Save
                              </button>
                              <button onClick={cancelEditOffer}
                                className="flex-1 px-3 py-1.5 bg-gray-400 text-white rounded text-xs font-medium hover:bg-gray-500">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <>
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="selectedOffer"
                                  checked={selectedOfferId === offer.id}
                                  onChange={() => handleSelectOffer(offer.id)}
                                  className="w-4 h-4 text-green-600 focus:ring-green-500 cursor-pointer"
                                />
                                <div className="font-medium text-gray-900" style={{ color }}>{offer.lenderName}</div>
                                {offer.offerType === 'loc' && selectedOfferId !== offer.id && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">LOC</span>
                                )}
                                {selectedOfferId === offer.id && (
                                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">Selected</span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => startEditOffer(offer)}
                                  className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => deleteActualOffer(offer.id)}
                                  className="text-red-500 hover:text-red-700 text-xs font-medium"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                            {/* LOC ↔ Loan toggle — clean tab row, only interactive when this offer is selected */}
                            {offer.offerType === 'loc' && (
                              <div className="flex mb-3 rounded-lg overflow-hidden border border-gray-200 text-xs font-semibold">
                                <button
                                  type="button"
                                  disabled={selectedOfferId !== offer.id}
                                  onClick={() => setSelectedOfferViewType('loc')}
                                  className={`flex-1 py-1.5 transition-colors ${
                                    effectiveSelectedOfferType(offer) === 'loc'
                                      ? 'bg-blue-600 text-white'
                                      : selectedOfferId === offer.id
                                        ? 'bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer'
                                        : 'bg-gray-50 text-gray-400 cursor-default'
                                  }`}
                                >
                                  Line of Credit
                                </button>
                                <button
                                  type="button"
                                  disabled={selectedOfferId !== offer.id}
                                  onClick={() => setSelectedOfferViewType('mca')}
                                  className={`flex-1 py-1.5 border-l border-gray-200 transition-colors ${
                                    effectiveSelectedOfferType(offer) === 'mca'
                                      ? 'bg-blue-600 text-white'
                                      : selectedOfferId === offer.id
                                        ? 'bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer'
                                        : 'bg-gray-50 text-gray-400 cursor-default'
                                  }`}
                                >
                                  Loan / MCA
                                </button>
                              </div>
                            )}

                            <div className="space-y-1 text-xs text-gray-700">
                              {effectiveSelectedOfferType(offer) === 'loc' ? (() => {
                                const P = offer.amount;
                                const r = (offer.monthlyAPR ?? 0) / 100;
                                const n = offer.locTermMonths ?? 12;
                                const payment = r === 0 ? P / n : P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
                                const totalRepaymentLOC = payment * n;
                                return (
                                  <>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Credit Limit:</span>
                                      <span className="font-medium">${offer.amount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Monthly APR:</span>
                                      <span className="font-medium">{offer.monthlyAPR}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Term Length:</span>
                                      <span className="font-medium">{n} months</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Frequency:</span>
                                      <span className="font-medium">{offer.locPaymentFrequency || 'Monthly'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Total Repayment:</span>
                                      <span className="font-medium">${Math.round(totalRepaymentLOC).toLocaleString()}</span>
                                    </div>
                                    {(() => {
                                      const freq = offer.locPaymentFrequency || 'Monthly';
                                      const displayPmt = freq === 'Weekly' ? payment * 12 / 52 : payment;
                                      return (
                                        <div className="flex justify-between pt-1 border-t border-gray-200 mt-1">
                                          <span className="text-gray-600 font-medium">{freq} Payment:</span>
                                          <span className="font-bold text-green-700">${Math.round(displayPmt).toLocaleString()}</span>
                                        </div>
                                      );
                                    })()}
                                  </>
                                );
                              })() : (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Amount:</span>
                                    <span className="font-medium">${offer.amount.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Factor:</span>
                                    <span className="font-medium">{Number(offer.factorRate).toFixed(2)}x</span>
                                  </div>
                                  {offer.buyRate && (
                                    <div className="flex justify-between text-[10px] text-gray-500">
                                      <span>Buy Rate: {offer.buyRate}x</span>
                                      <span>+ {offer.addedPoints}pts</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Total Repayment:</span>
                                    <span className="font-medium">${totalRepayment.toLocaleString()}</span>
                                  </div>
                                  {offer.myCommissionPercent && offer.myCommissionPercent > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">My Commission %:</span>
                                      <span className="font-medium text-green-600">{offer.myCommissionPercent}%</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Term Length:</span>
                                    <span className="font-medium">{offer.termLength || 250} payments</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Frequency:</span>
                                    <span className="font-medium">{offer.paymentFrequency || 'Daily'}</span>
                                  </div>
                                  <div className="flex justify-between pt-1 border-t border-gray-200 mt-1">
                                    <span className="text-gray-600 font-medium">{offer.paymentFrequency || 'Daily'} Payment:</span>
                                    <span className="font-bold text-green-700">
                                      ${Math.round(totalRepayment / (offer.termLength || 250)).toLocaleString()}
                                    </span>
                                  </div>
                                </>
                              )}
                              {offer.url && (
                                <div className="pt-2 border-t border-gray-200 mt-2">
                                  <a
                                    href={offer.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#5a7fc7] hover:text-[#4a6fb7] font-medium flex items-center gap-1"
                                  >
                                    View Offer
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </a>
                                </div>
                              )}
                            </div>
                            
                            {/* LOC Draw Panel */}
                            {selectedOfferId === offer.id && effectiveSelectedOfferType(offer) === 'loc' && (() => {
                              const P = locDrawAmount;
                              const r = (offer.monthlyAPR ?? 0) / 100;
                              const n = offer.locTermMonths ?? 12;
                              const freq = offer.locPaymentFrequency || 'Monthly';
                              const monthlyPmt = r === 0 ? P / n : P * (r * Math.pow(1+r,n)) / (Math.pow(1+r,n)-1);
                              const weeklyPmt = monthlyPmt * 12 / 52;
                              const displayPmt = freq === 'Weekly' ? weeklyPmt : monthlyPmt;
                              const monthlyInterest = P * r;
                              const totalCost = monthlyPmt * n - P;
                              return (
                                <div className="mt-4 pt-4 border-t-2 border-blue-300 bg-gradient-to-r from-blue-50 to-sky-50 rounded-b-lg p-3 -mx-3 -mb-3">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-xs font-semibold text-blue-900">Line of Credit Draw</h4>
                                    <button onClick={() => setIsNegotiationCollapsed(!isNegotiationCollapsed)} className="text-blue-700 hover:text-blue-900">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        {isNegotiationCollapsed
                                          ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                          : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />}
                                      </svg>
                                    </button>
                                  </div>
                                  {!isNegotiationCollapsed && (
                                    <div className="space-y-3">
                                      {/* Draw slider */}
                                      <div>
                                        <div className="flex justify-between items-center text-xs text-gray-700 mb-1">
                                          <span className="font-medium">Draw Amount:</span>
                                          <span className="text-base font-bold text-blue-700">${Math.round(P).toLocaleString()}</span>
                                        </div>
                                        <input type="range" min={0} max={offer.amount} step={500}
                                          value={locDrawAmount}
                                          onChange={(e) => setLocDrawAmount(Number(e.target.value))}
                                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                                          <span>$0</span>
                                          <span>${offer.amount.toLocaleString()} (full limit)</span>
                                        </div>
                                      </div>
                                      {/* Calc results */}
                                      <div className="pt-2 border-t border-blue-200 space-y-1.5 text-xs">
                                        <div className="flex justify-between">
                                          <span className="text-gray-700">{freq} Payment:</span>
                                          <span className="font-bold text-blue-700">${Math.round(displayPmt).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-700">Monthly Interest Cost:</span>
                                          <span className="font-medium text-orange-600">${Math.round(monthlyInterest).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-700">Total Interest (full term):</span>
                                          <span className="font-medium text-orange-600">${Math.round(totalCost).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-700">Total Repayment:</span>
                                          <span className="font-medium">${Math.round(monthlyPmt * n).toLocaleString()}</span>
                                        </div>
                                      </div>
                                      {/* Deal Funded toggle */}
                                      <div className="pt-3 border-t border-blue-300">
                                        <label className="flex items-center justify-between cursor-pointer">
                                          <div>
                                            <span className="text-xs font-semibold text-blue-900">Deal Funded</span>
                                            <p className="text-xs text-blue-700">Mark when money is received</p>
                                          </div>
                                          <div className="relative inline-block w-10 h-5">
                                            <input type="checkbox" checked={isFunded} onChange={(e) => setIsFunded(e.target.checked)} className="sr-only peer" />
                                            <div className="w-10 h-5 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                          </div>
                                        </label>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Negotiation Slider - MCA / Loan view */}
                            {selectedOfferId === offer.id && effectiveSelectedOfferType(offer) === 'mca' && (
                              <div className="mt-4 pt-4 border-t-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 rounded-b-lg p-3 -mx-3 -mb-3">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-xs font-semibold text-green-900">
                                    Negotiate This Offer
                                  </h4>
                                  <button
                                    onClick={() => setIsNegotiationCollapsed(!isNegotiationCollapsed)}
                                    className="text-green-700 hover:text-green-900 transition-colors"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      {isNegotiationCollapsed ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                      )}
                                    </svg>
                                  </button>
                                </div>
                                
                                {!isNegotiationCollapsed && (
                                  <div className="space-y-3">
                                  {/* Amount Slider */}
                                  <div>
                                    <div className="flex justify-between items-center text-xs text-gray-700 mb-1">
                                      <span className="font-medium">Adjust Amount:</span>
                                      <span className="text-base font-bold text-green-700">
                                        ${Math.round(adjustedAmount).toLocaleString()}
                                      </span>
                                    </div>
                                    
                                    <input
                                      type="range"
                                      min={0}
                                      max={offer.amount}
                                      step={1000}
                                      value={adjustedAmount}
                                      onChange={(e) => setAdjustedAmount(Number(e.target.value))}
                                      className="w-full h-2 bg-green-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                                    />
                                    
                                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                                      <span>$0</span>
                                      <span>${offer.amount.toLocaleString()}</span>
                                    </div>
                                  </div>
                                  
                                  {/* Added points (commission) — same logic as add offer: buy rate + points/100 = factor */}
                                  <div>
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs text-gray-700 mb-1">
                                      <span className="font-medium">Added points (commission):</span>
                                      <div className="text-right">
                                        <span className="text-base font-bold text-green-700">
                                          {negotiationAddedPoints} pts
                                        </span>
                                        <p className="text-[10px] text-gray-500 font-normal">
                                          Buy {(offer.buyRate ?? 1.2).toFixed(2)}x + {negotiationAddedPoints} pts = {negotiatedFactorRate.toFixed(3)}x factor
                                        </p>
                                      </div>
                                    </div>
                                    <input
                                      key={`negotiate-pts-${leadId}`}
                                      type="range"
                                      min={0}
                                      max={commissionPointsMax}
                                      step={0.5}
                                      value={Math.min(negotiationAddedPoints, commissionPointsMax)}
                                      onChange={(e) => setNegotiationAddedPoints(Number(e.target.value))}
                                      className="w-full h-2 bg-green-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                                    />
                                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                                      <span>0</span>
                                      <span className="tabular-nums">{commissionPointsMax}</span>
                                    </div>
                                  </div>
                                  
                                  {/* Calculations */}
                                  <div className="pt-2 border-t border-green-200 space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Original Amount:</span>
                                      <span className="font-medium">${offer.amount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Factor rate (live):</span>
                                      <span className="font-medium">{negotiatedFactorRate.toFixed(3)}x</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Adjusted Total Repayment:</span>
                                      <span className="font-bold text-green-700">
                                        ${Math.round(adjustedAmount * negotiatedFactorRate).toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Total Cost:</span>
                                      <span className="font-medium text-orange-600">
                                        ${Math.round(adjustedAmount * (negotiatedFactorRate - 1)).toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">
                                        {(offer.paymentFrequency || 'Daily')} payment (per period):
                                      </span>
                                      <span className="font-medium">
                                        ${Math.round(
                                          (adjustedAmount * negotiatedFactorRate) / (offer.termLength || 250)
                                        ).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  <div className="pt-3 border-t border-green-300">
                                    <label className="flex items-center justify-between cursor-pointer">
                                      <div>
                                        <span className="text-xs font-semibold text-green-900">Deal Funded</span>
                                        <p className="text-xs text-green-700">Mark when money is received</p>
                                      </div>
                                      <div className="relative inline-block w-10 h-5">
                                        <input
                                          type="checkbox"
                                          checked={isFunded}
                                          onChange={(e) => setIsFunded(e.target.checked)}
                                          className="sr-only peer"
                                        />
                                        <div className="w-10 h-5 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                                      </div>
                                    </label>
                                  </div>
                                </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Add New Offer Form */}
            <div className="bg-white border border-gray-300 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Add Competitor Offer</h3>
              <div className="space-y-3">

                {/* Offer type toggle */}
                <div className="flex rounded-md overflow-hidden border border-gray-300 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setNewOfferType('mca')}
                    className={`flex-1 py-2 transition-colors ${newOfferType === 'mca' ? 'bg-[#5a7fc7] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    MCA / Term Loan
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewOfferType('loc')}
                    className={`flex-1 py-2 transition-colors border-l border-gray-300 ${newOfferType === 'loc' ? 'bg-[#5a7fc7] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    Line of Credit
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Lender Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newOfferLender}
                    onChange={(e) => setNewOfferLender(e.target.value)}
                    placeholder="e.g., Fundbox, OnDeck..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    {newOfferType === 'loc' ? 'Credit Limit' : 'Offer Amount'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={newOfferAmount}
                    onChange={(e) => setNewOfferAmount(e.target.value)}
                    placeholder="e.g., 100000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    min="0"
                    step="1000"
                  />
                </div>

                {newOfferType === 'loc' ? (
                  /* LOC fields */
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Monthly APR % <span className="text-red-500">*</span></label>
                        <input
                          type="number"
                          value={newOfferMonthlyAPR}
                          onChange={(e) => setNewOfferMonthlyAPR(e.target.value)}
                          placeholder="e.g., 2.5"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                          min="0"
                          step="0.1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Term Length (months) <span className="text-red-500">*</span></label>
                        <input
                          type="number"
                          value={newOfferLocTermMonths}
                          onChange={(e) => setNewOfferLocTermMonths(e.target.value)}
                          placeholder="e.g., 12"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                          min="1"
                          step="1"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Payment Frequency</label>
                      <select value={newOfferLocPaymentFreq} onChange={(e) => setNewOfferLocPaymentFreq(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]">
                        <option value="Weekly">Weekly</option>
                        <option value="Monthly">Monthly</option>
                      </select>
                    </div>
                    {newOfferAmount && newOfferMonthlyAPR && newOfferLocTermMonths && (() => {
                      const P = Number(newOfferAmount);
                      const r = Number(newOfferMonthlyAPR) / 100;
                      const n = Number(newOfferLocTermMonths);
                      const moPmt = r === 0 ? P / n : P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
                      const pmt = newOfferLocPaymentFreq === 'Weekly' ? moPmt * 12 / 52 : moPmt;
                      return (
                        <p className="text-xs text-gray-500">
                          Est. {newOfferLocPaymentFreq.toLowerCase()} payment: <span className="font-semibold text-gray-700">${Math.round(pmt).toLocaleString()}</span>
                          {' '}· Total repayment: <span className="font-semibold text-gray-700">${Math.round(moPmt * n).toLocaleString()}</span>
                        </p>
                      );
                    })()}
                  </>
                ) : (
                  /* MCA fields */
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Buy Rate (defaults to 1.20)</label>
                        <input
                          type="number"
                          value={newOfferBuyRate}
                          onChange={(e) => setNewOfferBuyRate(e.target.value)}
                          placeholder="1.20"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                          min="1"
                          max="2"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Added Points</label>
                        <input
                          type="number"
                          value={newOfferAddedPoints}
                          onChange={(e) => setNewOfferAddedPoints(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                          min="0"
                          max={commissionPointsMax}
                          step="0.5"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">My Commission % (optional)</label>
                      <input
                        type="number"
                        value={newOfferMyCommissionPercent}
                        onChange={(e) => setNewOfferMyCommissionPercent(e.target.value)}
                        placeholder="e.g., 50"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                        min="0"
                        max="100"
                        step="5"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Factor Rate: {((Number(newOfferBuyRate) || 1.20) + ((newOfferAddedPoints === '' ? 0 : Number(newOfferAddedPoints)) / 100)).toFixed(3)}x
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Term Length (defaults to 250)</label>
                      <input
                        type="number"
                        value={newOfferTermLength}
                        onChange={(e) => setNewOfferTermLength(e.target.value)}
                        placeholder="250"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                        min="1"
                        step="1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Payment Frequency</label>
                      <select
                        value={newOfferPaymentFreq}
                        onChange={(e) => setNewOfferPaymentFreq(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                      >
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Bi-Weekly">Bi-Weekly</option>
                        <option value="Monthly">Monthly</option>
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs text-gray-600 mb-1">Link to Offer (Optional)</label>
                  <input
                    type="url"
                    value={newOfferUrl}
                    onChange={(e) => setNewOfferUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                  />
                </div>
                <button
                  onClick={addActualOffer}
                  className="w-full px-3 py-2 bg-[#5a7fc7] text-white rounded-md text-sm font-medium hover:bg-[#4a6fb7] transition-colors"
                >
                  + Add Offer
                </button>
              </div>
            </div>
            
            {/* Notes Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
              <textarea
                value={offersNotes}
                onChange={(e) => setOffersNotes(e.target.value)}
                placeholder="Enter notes about offers, lender terms, or other details..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                rows={6}
              />
            </div>
            
            {/* Quick Comparison */}
            {hasCalculated && actualOffers.length > 0 && (
              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-900 mb-3">Quick Comparison</h3>
                <div className="space-y-2 text-xs text-blue-800">
                  {actualOffers.map((offer) => (
                    <div key={offer.id} className="flex justify-between">
                      <span>{offer.lenderName}{offer.offerType === 'loc' ? ' (LOC)' : ''}:</span>
                      {offer.offerType === 'loc'
                        ? <span className="font-medium">${offer.amount.toLocaleString()} @ {offer.monthlyAPR}%/mo · {offer.locTermMonths}mo</span>
                        : <span className="font-medium">${offer.amount.toLocaleString()} @ {Number(offer.factorRate).toFixed(2)}x</span>
                      }
                    </div>
                  ))}
                  {selectedOffer && adjustedAmount !== selectedOffer.amount && (
                    <div className="flex justify-between border-t border-green-300 pt-2 mt-2">
                      <span className="font-semibold text-green-800">Negotiated ({selectedOffer.lenderName}):</span>
                      <span className="font-bold text-green-800">
                        ${Math.round(adjustedAmount).toLocaleString()} @ {negotiatedFactorRate.toFixed(3)}x
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
