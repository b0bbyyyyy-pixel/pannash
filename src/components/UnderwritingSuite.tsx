'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

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
  hasOtherMCALoans: boolean;
  otherMCAMonthlyPayment: number;
  
  // Additional Info
  requestedAmount: number;
  purposeOfFunds: string;
  
  // Offers Received Section
  actualOffers?: Array<{ id: string; lenderName: string; amount: number; factorRate: number; url?: string }>;
  offersNotes?: string;
  
  // System will calculate these
  lastUpdated?: string;
}

interface UnderwritingSuiteProps {
  leadId: string;
  leadName: string;
  initialData?: UnderwritingData;
  onClose: () => void;
  onSave: (data: UnderwritingData) => Promise<void>;
}

const DEFAULT_DATA: UnderwritingData = {
  timeInBusiness: 24,
  industry: 'Retail - General',
  creditScore: 650,
  month1Revenue: 50000,
  month2Revenue: 50000,
  month3Revenue: 50000,
  avgDailyBalance: 15000,
  endingBalance: 20000,
  nsfCount: 0,
  hasOtherMCALoans: false,
  otherMCAMonthlyPayment: 0,
  requestedAmount: 100000,
  purposeOfFunds: '',
};

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
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'insights'>('analysis');
  const [hasCalculated, setHasCalculated] = useState(false);
  
  // Actual offers received tracking
  const [actualOffers, setActualOffers] = useState<Array<{ id: string; lenderName: string; amount: number; factorRate: number; url?: string }>>(
    initialData?.actualOffers || []
  );
  const [newOfferLender, setNewOfferLender] = useState('');
  const [newOfferAmount, setNewOfferAmount] = useState('');
  const [newOfferFactorRate, setNewOfferFactorRate] = useState('');
  const [newOfferUrl, setNewOfferUrl] = useState('');
  const [offersNotes, setOffersNotes] = useState(initialData?.offersNotes || '');
  
  // Selected offer for negotiation
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [adjustedAmount, setAdjustedAmount] = useState<number>(0);
  const [negotiationPaymentFrequency, setNegotiationPaymentFrequency] = useState<'Daily' | 'Weekly' | 'Bi-Weekly' | 'Monthly'>('Daily');
  
  // Editing offers
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [editOfferLender, setEditOfferLender] = useState('');
  const [editOfferAmount, setEditOfferAmount] = useState('');
  const [editOfferFactorRate, setEditOfferFactorRate] = useState('');
  const [editOfferUrl, setEditOfferUrl] = useState('');
  
  // Get the selected offer
  const selectedOffer = actualOffers.find(o => o.id === selectedOfferId);
  
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
  const hasOtherMCALoans = Boolean(data.hasOtherMCALoans);
  const otherMCAMonthlyPayment = Number(data.otherMCAMonthlyPayment) || 0;
  
  // Calculate average monthly revenue
  const avgMonthlyRevenue = (month1Revenue + month2Revenue + month3Revenue) / 3;
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
    
    // Max approved amount (based on available revenue after existing MCA obligations)
    const revenueMultiplier = creditScore >= 700 ? 2.5 : creditScore >= 650 ? 2.0 : 1.5;
    const baseMaxAmount = Math.floor(avgMonthlyRevenue * revenueMultiplier * industryRiskMultiplier);
    
    // Reduce max amount if they have existing MCA debt
    if (hasOtherMCALoans && otherMCAMonthlyPayment > 0) {
      // Use available revenue for calculation if debt burden is high
      const adjustedRevenue = debtToRevenueRatio > 0.20 ? availableMonthlyRevenue : avgMonthlyRevenue;
      maxApprovedAmount = Math.floor(adjustedRevenue * revenueMultiplier * industryRiskMultiplier * 0.85); // 15% haircut for risk
    } else {
      maxApprovedAmount = baseMaxAmount;
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
      approvedAmount: Math.min(requestedAmount, maxApprovedAmount)
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
  const dailyHoldback = avgMonthlyRevenue * (holdbackPercent / 100) / 22;
  
  // Simple APR calculation (approximate)
  const effectiveAPR = approvedAmount > 0 && termMonths > 0 
    ? ((totalCost / approvedAmount) / termMonths * 12 * 100).toFixed(1)
    : '0.0';
  
  // Risk score (0-100, comprehensive algorithm)
  const calculateRiskScore = (): number => {
    let score = 50; // Start neutral
    
    // Industry risk impact (±15 points)
    const industry = data.industry || 'Other';
    if (industry.includes('Healthcare') || industry.includes('Medical') || industry.includes('Dental') || 
        industry.includes('Legal') || industry.includes('Accounting') || industry.includes('Insurance')) {
      score += 15; // Low-risk industries
    } else if (industry.includes('IT Services') || industry.includes('Software') || industry.includes('SaaS') || 
               industry.includes('Consulting') || industry.includes('Financial Services')) {
      score += 10; // Moderate-low risk
    } else if (industry.includes('Bar') || industry.includes('Nightclub') || industry.includes('Trucking') ||
               industry.includes('Construction') || industry.includes('Roofing') || industry.includes('Auto Dealership')) {
      score -= 10; // High-risk industries
    } else if (industry.includes('Dropshipping') || industry.includes('Amazon FBA') || 
               industry.includes('Event Planning') || industry.includes('Non-Profit')) {
      score -= 15; // Very high-risk industries
    }
    
    // Credit score impact (±20 points)
    if (creditScore >= 700) score += 20;
    else if (creditScore >= 650) score += 10;
    else if (creditScore < 600) score -= 15;
    
    // Time in business impact (±15 points)
    if (timeInBusiness >= 36) score += 15;
    else if (timeInBusiness >= 24) score += 10;
    else if (timeInBusiness < 12) score -= 10;
    
    // Revenue stability (±10 points)
    if (revenueStability > 0.8) score += 10;
    else if (revenueStability > 0.6) score += 5;
    else if (revenueStability < 0.4) score -= 10;
    
    // NSF impact (±10 points)
    if (nsfCount === 0) score += 10;
    else if (nsfCount === 1) score += 5;
    else if (nsfCount >= 3) score -= 10;
    
    // Bank balance health (±10 points)
    if (avgDailyBalance >= 20000) score += 10;
    else if (avgDailyBalance >= 10000) score += 5;
    else if (avgDailyBalance < 5000) score -= 10;
    
    // Revenue vs requested amount (±10 points)
    const monthlyRevRatio = approvedAmount > 0 && avgMonthlyRevenue > 0 ? avgMonthlyRevenue / approvedAmount : 0;
    if (monthlyRevRatio >= 0.5) score += 10;
    else if (monthlyRevRatio >= 0.3) score += 5;
    else if (monthlyRevRatio < 0.2) score -= 10;
    
    // Existing MCA debt burden (±10 points)
    const debtRatio = avgMonthlyRevenue > 0 ? otherMCAMonthlyPayment / avgMonthlyRevenue : 0;
    if (debtRatio === 0) score += 5; // No debt is good
    else if (debtRatio > 0.25) score -= 10; // High debt burden
    else if (debtRatio > 0.15) score -= 5; // Moderate debt burden
    
    return Math.max(0, Math.min(100, score));
  };
  
  const riskScore = calculateRiskScore();
  const approvalProbability = Math.min(95, riskScore + 10);
  
  // Generate revenue chart data
  const generateRevenueChartData = () => {
    return [
      {
        month: 'Month 1',
        revenue: month1Revenue,
        proposedAdvance: hasCalculated ? approvedAmount : null,
      },
      {
        month: 'Month 2',
        revenue: month2Revenue,
        proposedAdvance: hasCalculated ? approvedAmount : null,
      },
      {
        month: 'Month 3',
        revenue: month3Revenue,
        proposedAdvance: hasCalculated ? approvedAmount : null,
      },
    ];
  };

  const revenueChartData = generateRevenueChartData();

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
    if (!newOfferLender.trim() || !newOfferAmount || !newOfferFactorRate) {
      alert('Please fill in lender name, amount, and factor rate');
      return;
    }
    
    const newOffer = {
      id: Date.now().toString(),
      lenderName: newOfferLender.trim(),
      amount: Number(newOfferAmount),
      factorRate: Number(newOfferFactorRate),
      url: newOfferUrl.trim() || undefined,
    };
    
    setActualOffers([...actualOffers, newOffer]);
    setNewOfferLender('');
    setNewOfferAmount('');
    setNewOfferFactorRate('');
    setNewOfferUrl('');
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

  const startEditOffer = (offer: { id: string; lenderName: string; amount: number; factorRate: number; url?: string }) => {
    setEditingOfferId(offer.id);
    setEditOfferLender(offer.lenderName);
    setEditOfferAmount(offer.amount.toString());
    setEditOfferFactorRate(offer.factorRate.toString());
    setEditOfferUrl(offer.url || '');
  };

  const saveEditOffer = () => {
    if (!editOfferLender.trim() || !editOfferAmount || !editOfferFactorRate) {
      alert('Please fill in lender name, amount, and factor rate');
      return;
    }

    setActualOffers(actualOffers.map(offer => 
      offer.id === editingOfferId
        ? {
            ...offer,
            lenderName: editOfferLender.trim(),
            amount: Number(editOfferAmount),
            factorRate: Number(editOfferFactorRate),
            url: editOfferUrl.trim() || undefined,
          }
        : offer
    ));

    // Update adjusted amount if we're editing the selected offer
    if (selectedOfferId === editingOfferId) {
      setAdjustedAmount(Number(editOfferAmount));
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

  const getRiskColor = (score: number): string => {
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRiskLabel = (score: number): string => {
    if (score >= 70) return 'Low Risk';
    if (score >= 50) return 'Medium Risk';
    return 'High Risk';
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
                  <label className="block text-xs text-gray-600 mb-1">Month 1 Revenue</label>
                  <input
                    type="number"
                    value={data.month1Revenue || ''}
                    onChange={(e) => setData({ ...data, month1Revenue: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    min="0"
                    step="1000"
                    placeholder="50000"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Month 2 Revenue</label>
                  <input
                    type="number"
                    value={data.month2Revenue || ''}
                    onChange={(e) => setData({ ...data, month2Revenue: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    min="0"
                    step="1000"
                    placeholder="50000"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Month 3 Revenue</label>
                  <input
                    type="number"
                    value={data.month3Revenue || ''}
                    onChange={(e) => setData({ ...data, month3Revenue: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    min="0"
                    step="1000"
                    placeholder="50000"
                  />
                </div>
                
                <div className="pt-2 border-t border-gray-300">
                  <div className="text-xs text-gray-600 mb-1">Average Monthly Revenue</div>
                  <div className="text-lg font-bold text-gray-900">
                    ${Math.round(avgMonthlyRevenue).toLocaleString()}
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Average Daily Balance</label>
                  <input
                    type="number"
                    value={data.avgDailyBalance || ''}
                    onChange={(e) => setData({ ...data, avgDailyBalance: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    min="0"
                    step="1000"
                    placeholder="15000"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Ending Balance</label>
                  <input
                    type="number"
                    value={data.endingBalance || ''}
                    onChange={(e) => setData({ ...data, endingBalance: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    min="0"
                    step="1000"
                    placeholder="20000"
                  />
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
                    <div className="ml-6 bg-orange-50 border border-orange-200 rounded-md p-3">
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
                  )}
                </div>
              </div>
            </div>

            {/* Request Details */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Request Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Requested Amount</label>
                  <input
                    type="number"
                    value={data.requestedAmount || ''}
                    onChange={(e) => setData({ ...data, requestedAmount: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    min="0"
                    step="5000"
                    placeholder="100000"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Purpose of Funds</label>
                  <textarea
                    value={data.purposeOfFunds || ''}
                    onChange={(e) => setData({ ...data, purposeOfFunds: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    rows={3}
                    placeholder="e.g., Equipment purchase, inventory..."
                  />
                </div>
              </div>
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
            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('analysis')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'analysis'
                    ? 'border-[#5a7fc7] text-[#5a7fc7]'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Analysis
              </button>
              <button
                onClick={() => setActiveTab('insights')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'insights'
                    ? 'border-[#5a7fc7] text-[#5a7fc7]'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Insights
              </button>
            </div>

            {activeTab === 'analysis' && (
              <div>
                {!hasCalculated ? (
                  <div className="flex flex-col items-center justify-center h-96 text-center">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Ready to Calculate</h3>
                    <p className="text-gray-600 max-w-md">
                      Enter the merchant's financial data in the left panel and click "Calculate Offer" to see recommended terms and analysis.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Recommended Offer Terms */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 mb-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Recommended Offer</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Approved Amount</div>
                      <div className="text-3xl font-bold text-[#5a7fc7]">
                        ${Math.round(approvedAmount).toLocaleString()}
                      </div>
                      {approvedAmount < requestedAmount && (
                        <div className="text-xs text-orange-600 mt-1">
                          Max available: ${Math.round(offerTerms.maxApprovedAmount).toLocaleString()}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Factor Rate</div>
                      <div className="text-3xl font-bold text-gray-900">
                        {factorRate}x
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {factorRate <= 1.20 ? 'Excellent terms' : factorRate <= 1.30 ? 'Good terms' : 'Standard terms'}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-xs text-gray-600 mb-1">{paymentFrequency} Payment</div>
                      <div className="text-2xl font-bold text-gray-900">
                        ${Math.round(paymentAmount).toLocaleString()}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Holdback %</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {holdbackPercent}%
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        ~${Math.round(dailyHoldback).toLocaleString()}/day
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Term Length</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {termMonths} months
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Total Repayment</div>
                      <div className="text-2xl font-bold text-gray-900">
                        ${Math.round(totalRepayment).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Metrics */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Cost</div>
                    <div className="text-xl font-bold text-orange-600">
                      ${Math.round(totalCost).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-xs text-gray-600 mb-1">Effective APR</div>
                    <div className="text-xl font-bold text-gray-900">
                      {effectiveAPR}%
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Payments</div>
                    <div className="text-xl font-bold text-gray-900">
                      {totalPayments}
                    </div>
                  </div>
                </div>
                
                {/* Risk Assessment */}
                <div className={`grid ${hasOtherMCALoans && otherMCAMonthlyPayment > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-4 mb-6`}>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-xs text-gray-600 mb-1">Risk Score</div>
                    <div className={`text-3xl font-bold ${getRiskColor(riskScore)}`}>
                      {riskScore}/100
                    </div>
                    <div className={`text-sm font-medium ${getRiskColor(riskScore)}`}>
                      {getRiskLabel(riskScore)}
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-xs text-gray-600 mb-1">Approval Probability</div>
                    <div className="text-3xl font-bold text-green-600">
                      {approvalProbability}%
                    </div>
                    <div className="text-sm text-gray-600">
                      {approvalProbability >= 80 ? 'Strong approval' : approvalProbability >= 60 ? 'Likely approval' : 'Needs review'}
                    </div>
                  </div>
                  
                  {hasOtherMCALoans && otherMCAMonthlyPayment > 0 && (
                    <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
                      <div className="text-xs text-orange-700 font-medium mb-1">Available Revenue</div>
                      <div className="text-2xl font-bold text-orange-800">
                        ${Math.round(availableMonthlyRevenue).toLocaleString()}/mo
                      </div>
                      <div className="text-xs text-orange-600 mt-1">
                        After ${otherMCAMonthlyPayment.toLocaleString()}/mo MCA debt
                      </div>
                    </div>
                  )}
                </div>

                {/* Revenue & Offers Chart */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue vs. Offer Comparison</h3>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={revenueChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis 
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        formatter={(value: any) => typeof value === 'number' ? `$${value.toLocaleString()}` : value}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5' }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#5a7fc7" 
                        strokeWidth={3} 
                        name="Monthly Revenue" 
                        dot={{ r: 6, fill: '#5a7fc7' }}
                      />
                      {hasCalculated && (
                        <ReferenceLine 
                          y={approvedAmount} 
                          stroke="#10b981" 
                          strokeWidth={2} 
                          strokeDasharray="5 5" 
                          label={{ value: 'Your Offer', position: 'right', fill: '#10b981', fontWeight: 'bold' }}
                        />
                      )}
                      {actualOffers.map((offer, index) => (
                        <ReferenceLine 
                          key={offer.id}
                          y={offer.amount} 
                          stroke={['#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][index % 4]} 
                          strokeWidth={2} 
                          strokeDasharray="3 3" 
                          label={{ value: offer.lenderName, position: 'right', fill: ['#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][index % 4], fontSize: 12 }}
                        />
                      ))}
                      {selectedOffer && adjustedAmount !== selectedOffer.amount && (
                        <ReferenceLine 
                          y={adjustedAmount} 
                          stroke="#059669" 
                          strokeWidth={3} 
                          strokeDasharray="8 4" 
                          label={{ 
                            value: `Negotiated: $${Math.round(adjustedAmount / 1000)}k`, 
                            position: 'right', 
                            fill: '#059669', 
                            fontWeight: 'bold',
                            fontSize: 13
                          }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'insights' && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Deal Insights</h3>
                
                {/* TODO: AI Integration - This will be replaced with actual AI-generated insights */}
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">Deal Strengths</h4>
                    <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                      {creditScore >= 650 && <li>Good credit profile ({creditScore})</li>}
                      {timeInBusiness >= 24 && <li>Established business ({Math.floor(timeInBusiness / 12)}+ years)</li>}
                      {nsfCount === 0 && <li>Zero NSFs - excellent bank health</li>}
                      {revenueStability > 0.7 && <li>Stable revenue pattern ({(revenueStability * 100).toFixed(0)}% stability)</li>}
                      {avgDailyBalance >= 15000 && <li>Strong average daily balance (${Math.round(avgDailyBalance).toLocaleString()})</li>}
                      {requestedAmount > 0 && avgMonthlyRevenue > 0 && avgMonthlyRevenue / requestedAmount >= 0.3 && <li>Strong revenue-to-advance ratio</li>}
                    </ul>
                  </div>
                  
                  {(creditScore < 600 || timeInBusiness < 12 || nsfCount >= 2 || avgDailyBalance < 8000 || (requestedAmount > 0 && avgMonthlyRevenue / requestedAmount < 0.2) || (hasOtherMCALoans && otherMCAMonthlyPayment > 0)) && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="font-medium text-yellow-900 mb-2">Risk Factors</h4>
                      <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                        {creditScore < 600 && <li>Lower credit score ({creditScore}) - higher factor rate applied</li>}
                        {timeInBusiness < 12 && <li>Less than 1 year in business - higher risk category</li>}
                        {nsfCount >= 2 && <li>{nsfCount} NSFs in last 3 months - cash flow concerns</li>}
                        {avgDailyBalance < 8000 && <li>Low average daily balance - increased holdback recommended</li>}
                        {requestedAmount > 0 && avgMonthlyRevenue > 0 && avgMonthlyRevenue / requestedAmount < 0.2 && <li>Advance amount high relative to revenue - may need reduction</li>}
                        {revenueStability < 0.5 && <li>Unstable revenue pattern - stricter terms applied</li>}
                        {hasOtherMCALoans && otherMCAMonthlyPayment > 0 && (
                          <li>
                            Existing MCA debt: ${otherMCAMonthlyPayment.toLocaleString()}/mo 
                            ({((otherMCAMonthlyPayment / avgMonthlyRevenue) * 100).toFixed(1)}% of revenue)
                            {(otherMCAMonthlyPayment / avgMonthlyRevenue) > 0.25 && ' - High debt burden'}
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                  
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-medium text-green-900 mb-2">Why This Offer Works</h4>
                    <ul className="text-sm text-green-800 space-y-1 list-disc list-inside">
                      <li>Flexible {paymentFrequency.toLowerCase()} payments based on their revenue pattern</li>
                      <li>{holdbackPercent}% holdback calculated from their ${Math.round(avgMonthlyRevenue).toLocaleString()}/mo average</li>
                      <li>Factor rate of {factorRate}x reflects their {getRiskLabel(riskScore).toLowerCase()} profile</li>
                      <li>{termMonths}-month term optimized for their business age and stability</li>
                      <li>Fast funding (24-48 hours) for {data.purposeOfFunds || 'business needs'}</li>
                    </ul>
                  </div>
                  
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">Underwriter Notes</h4>
                    <div className="text-sm text-gray-700 space-y-2">
                      <div className="mb-2">
                        Based on <strong>{approvalProbability}% approval probability</strong> and <strong>{getRiskLabel(riskScore).toLowerCase()}</strong> assessment, 
                        this deal is <strong>{approvalProbability >= 75 ? 'highly recommended for approval' : approvalProbability >= 50 ? 'recommended with standard monitoring' : 'requires additional review'}</strong>.
                      </div>
                      <div className="mt-2">
                        The ${Math.round(paymentAmount).toLocaleString()} {paymentFrequency.toLowerCase()} payment represents approximately{' '}
                        <strong>
                        {avgMonthlyRevenue > 0 
                          ? ((paymentAmount / (avgMonthlyRevenue / paymentsPerMonth)) * 100).toFixed(1)
                          : '0.0'}%
                        </strong> of their average {paymentFrequency.toLowerCase()} revenue, ensuring sustainable cash flow.
                      </div>
                      {approvedAmount < requestedAmount && (
                        <div className="mt-2 text-orange-700">
                          <strong>Note:</strong> Approved amount reduced from ${requestedAmount.toLocaleString()} to align with revenue capacity. Maximum available: ${Math.round(offerTerms.maxApprovedAmount).toLocaleString()}.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
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
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Lender Name</label>
                              <input
                                type="text"
                                value={editOfferLender}
                                onChange={(e) => setEditOfferLender(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Amount</label>
                              <input
                                type="number"
                                value={editOfferAmount}
                                onChange={(e) => setEditOfferAmount(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                                min="0"
                                step="1000"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Factor Rate</label>
                              <input
                                type="number"
                                value={editOfferFactorRate}
                                onChange={(e) => setEditOfferFactorRate(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                                min="1"
                                max="2"
                                step="0.01"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Link (Optional)</label>
                              <input
                                type="url"
                                value={editOfferUrl}
                                onChange={(e) => setEditOfferUrl(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={saveEditOffer}
                                className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditOffer}
                                className="flex-1 px-3 py-1.5 bg-gray-400 text-white rounded text-xs font-medium hover:bg-gray-500"
                              >
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
                            <div className="space-y-1 text-xs text-gray-700">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Amount:</span>
                                <span className="font-medium">${offer.amount.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Factor:</span>
                                <span className="font-medium">{offer.factorRate}x</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Total Repayment:</span>
                                <span className="font-medium">${totalRepayment.toLocaleString()}</span>
                              </div>
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
                            
                            {/* Negotiation Slider - Shows right below selected offer */}
                            {selectedOfferId === offer.id && (
                              <div className="mt-4 pt-4 border-t-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 rounded-b-lg p-3 -mx-3 -mb-3">
                                <h4 className="text-xs font-semibold text-green-900 mb-3">
                                  Negotiate This Offer
                                </h4>
                                
                                <div className="space-y-3">
                                  {/* Payment Frequency Toggle */}
                                  <div>
                                    <label className="block text-xs text-gray-700 font-medium mb-2">Payment Frequency</label>
                                    <div className="grid grid-cols-2 gap-2">
                                      {(['Daily', 'Weekly', 'Bi-Weekly', 'Monthly'] as const).map((freq) => (
                                        <button
                                          key={freq}
                                          onClick={() => setNegotiationPaymentFrequency(freq)}
                                          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                            negotiationPaymentFrequency === freq
                                              ? 'bg-green-600 text-white'
                                              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                          }`}
                                        >
                                          {freq}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  
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
                                      min={Math.max(10000, offer.amount * 0.5)}
                                      max={offer.amount}
                                      step={1000}
                                      value={adjustedAmount}
                                      onChange={(e) => setAdjustedAmount(Number(e.target.value))}
                                      className="w-full h-2 bg-green-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                                    />
                                    
                                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                                      <span>${Math.round(offer.amount * 0.5).toLocaleString()}</span>
                                      <span>${offer.amount.toLocaleString()}</span>
                                    </div>
                                  </div>
                                  
                                  {/* Calculations */}
                                  <div className="pt-2 border-t border-green-200 space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Original Amount:</span>
                                      <span className="font-medium">${offer.amount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Factor Rate (Fixed):</span>
                                      <span className="font-medium">{offer.factorRate}x</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Adjusted Total Repayment:</span>
                                      <span className="font-bold text-green-700">
                                        ${Math.round(adjustedAmount * offer.factorRate).toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Total Cost:</span>
                                      <span className="font-medium text-orange-600">
                                        ${Math.round(adjustedAmount * (offer.factorRate - 1)).toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">
                                        {negotiationPaymentFrequency} Payment:
                                      </span>
                                      <span className="font-medium">
                                        ${(() => {
                                          const totalRepay = adjustedAmount * offer.factorRate;
                                          let paymentsPerYear = 0;
                                          switch (negotiationPaymentFrequency) {
                                            case 'Daily': paymentsPerYear = 250; break;
                                            case 'Weekly': paymentsPerYear = 52; break;
                                            case 'Bi-Weekly': paymentsPerYear = 26; break;
                                            case 'Monthly': paymentsPerYear = 12; break;
                                          }
                                          return Math.round(totalRepay / paymentsPerYear).toLocaleString();
                                        })()}
                                      </span>
                                    </div>
                                  </div>
                                </div>
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
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Lender Name</label>
                  <input
                    type="text"
                    value={newOfferLender}
                    onChange={(e) => setNewOfferLender(e.target.value)}
                    placeholder="e.g., Fundbox, OnDeck..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Offer Amount</label>
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
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Factor Rate</label>
                  <input
                    type="number"
                    value={newOfferFactorRate}
                    onChange={(e) => setNewOfferFactorRate(e.target.value)}
                    placeholder="e.g., 1.25"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
                    min="1"
                    max="2"
                    step="0.01"
                  />
                </div>
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
                  <div className="flex justify-between">
                    <span>Your Offer:</span>
                    <span className="font-bold">${Math.round(approvedAmount).toLocaleString()} @ {factorRate}x</span>
                  </div>
                  {actualOffers.map((offer) => (
                    <div key={offer.id} className="flex justify-between">
                      <span>{offer.lenderName}:</span>
                      <span className="font-medium">${offer.amount.toLocaleString()} @ {offer.factorRate}x</span>
                    </div>
                  ))}
                  {selectedOffer && adjustedAmount !== selectedOffer.amount && (
                    <div className="flex justify-between border-t border-green-300 pt-2 mt-2">
                      <span className="font-semibold text-green-800">Negotiated ({selectedOffer.lenderName}):</span>
                      <span className="font-bold text-green-800">
                        ${Math.round(adjustedAmount).toLocaleString()} @ {selectedOffer.factorRate}x
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
