'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const UnderwritingSuite    = dynamic(() => import('@/components/UnderwritingSuite'), { ssr: false });
const ScheduleEmailModal   = dynamic(() => import('@/components/ScheduleEmailModal'), { ssr: false });
const DocumentsModal       = dynamic(() => import('@/components/DocumentsModal'), { ssr: false });
const SendToLenderModal    = dynamic(() => import('@/components/SendToLenderModal'), { ssr: false });
const CallHistoryPanel     = dynamic(() => import('@/components/CallHistoryPanel'), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────────────────
interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  last_contact?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  lead_status?: string | null;
  temperature?: string | null;
  assigned_to?: string | null;
  in_pipeline?: boolean;
  month_key?: string | null;
  stage?: string | null;
  value?: number | null;
  lead_source?: string | null;
  underwriting_data?: Record<string, unknown> | null;
}

interface LeadWorkspaceClientProps {
  lead: Lead;
  allLeadIds: string[];
  userId: string;
  userName: string;
  /** True when opened from the Leads page — always shows "Add to Pipeline" */
  fromLeads?: boolean;
}

// ── Status helpers (dynamic) ───────────────────────────────────────────────────
interface DBStatus { id: string; name: string; color: string; bg_color: string; }

function getStatusStyle(status: string | null | undefined, list?: DBStatus[]) {
  if (!status) return { bg: '#f5f5f5', text: '#6b6b6b' };
  if (list) {
    const found = list.find(s => s.name === status);
    if (found) return { bg: found.bg_color, text: found.color };
  }
  return { bg: '#f5f5f5', text: '#6b6b6b' };
}

// ── Inline editable field ──────────────────────────────────────────────────────
function Field({
  label,
  value,
  onSave,
  masked = false,
  readOnly = false,
  type = 'text',
  valueStyle,
}: {
  label: string;
  value: string | null | undefined;
  onSave?: (val: string) => Promise<void>;
  masked?: boolean;
  readOnly?: boolean;
  type?: string;
  valueStyle?: React.CSSProperties;
}) {
  const [editing, setEditing]   = useState(false);
  const [editVal, setEditVal]   = useState(value || '');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving]     = useState(false);

  const display = masked && !revealed
    ? (value ? '•••-••-••••' : '—')
    : (value || '—');

  const handleSave = async () => {
    if (!onSave) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(editVal); } finally { setSaving(false); setEditing(false); }
  };

  return (
    <div className="flex items-start gap-2 py-2 border-b border-[#f5f5f5] last:border-b-0">
      <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-0.5">{label}</span>
      {editing ? (
        <div className="flex-1 flex gap-1">
          <input
            type={type}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={handleSave}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
            className="flex-1 px-2 py-0.5 text-sm border border-[#e5e5e5] rounded focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
          />
          {saving && <span className="text-xs text-[#9b9b9b] pt-1">…</span>}
        </div>
      ) : (
        <div className="flex-1 min-w-0 flex items-center gap-1 group">
          <span
            className={`text-sm text-[#1a1a1a] flex-1 min-w-0 truncate ${!readOnly ? 'cursor-pointer hover:underline underline-offset-2 decoration-dotted' : ''}`}
            style={valueStyle}
            title={value || undefined}
            onClick={() => { if (!readOnly && !masked) { setEditVal(value || ''); setEditing(true); } }}
          >
            {masked && !revealed ? <span className="text-[#9b9b9b]">{display}</span> : display}
          </span>
          {masked && value && (
            <button
              onClick={() => setRevealed(r => !r)}
              className="text-[10px] text-[#9b9b9b] hover:text-[#1a1a1a] px-1"
            >
              {revealed ? 'hide' : 'show'}
            </button>
          )}
          {!readOnly && !masked && (
            <button
              onClick={() => { setEditVal(value || ''); setEditing(true); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#9b9b9b] hover:text-[#1a1a1a]"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Time-in-business field (Years + Months) ────────────────────────────────────
function TIBField({ valueMonths, onSave }: { valueMonths: number | null | undefined; onSave: (months: number) => void }) {
  const total = Number(valueMonths) || 0;
  const [years,  setYears]  = useState(Math.floor(total / 12));
  const [months, setMonths] = useState(total % 12);
  const [editing, setEditing] = useState(false);

  const display = total === 0 ? '—' : `${Math.floor(total / 12)}y ${total % 12}m`;

  const save = () => {
    onSave(years * 12 + months);
    setEditing(false);
  };

  return (
    <div className="flex items-start gap-2 py-2 border-b border-[#f5f5f5]">
      <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-0.5">Time in Biz</span>
      {editing ? (
        <div className="flex-1 flex items-center gap-1">
          <input type="number" min={0} value={years} onChange={e => setYears(Number(e.target.value) || 0)}
            className="w-14 px-2 py-0.5 text-sm border border-[#e5e5e5] rounded focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]" placeholder="Yr" />
          <span className="text-xs text-[#9b9b9b]">yr</span>
          <input type="number" min={0} max={11} value={months} onChange={e => setMonths(Number(e.target.value) || 0)}
            className="w-14 px-2 py-0.5 text-sm border border-[#e5e5e5] rounded focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]" placeholder="Mo" />
          <span className="text-xs text-[#9b9b9b]">mo</span>
          <button onClick={save} className="text-xs text-[#1a1a1a] font-medium hover:underline ml-1">Save</button>
          <button onClick={() => setEditing(false)} className="text-xs text-[#9b9b9b]">✕</button>
        </div>
      ) : (
        <span onClick={() => { setYears(Math.floor(total/12)); setMonths(total%12); setEditing(true); }}
          className="text-sm text-[#1a1a1a] cursor-pointer hover:underline underline-offset-2 decoration-dotted">{display}</span>
      )}
    </div>
  );
}

// ── Checkbox field ─────────────────────────────────────────────────────────────
function CheckboxField({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[#f5f5f5]">
      <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0">{label}</span>
      <button
        onClick={onToggle}
        className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${checked ? 'bg-[#1a1a1a]' : 'bg-[#d4d4d4]'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-xs text-[#6b6b6b]">{checked ? 'Yes' : 'No'}</span>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function Section({ title, children, collapsible = false }: { title: string; children: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-4">
      <button
        className="flex items-center gap-1.5 w-full text-left mb-2"
        onClick={() => collapsible && setOpen(o => !o)}
      >
        <span className="text-[11px] font-semibold text-[#9b9b9b] uppercase tracking-wider">{title}</span>
        {collapsible && (
          <svg className={`w-3 h-3 text-[#9b9b9b] transition-transform ${open ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

import FinancialsModal, { type BankSnap } from '@/components/FinancialsModal';
// ── Main component ─────────────────────────────────────────────────────────────
export default function LeadWorkspaceClient({
  lead: initialLead,
  allLeadIds,
  userId,
  userName,
  fromLeads = false,
}: LeadWorkspaceClientProps) {
  const router = useRouter();
  const [lead, setLead]               = useState(initialLead);
  const [centerTab, setCenterTab]     = useState<'submissions' | 'notes' | 'updates'>('submissions');
  const [notes, setNotes]             = useState(initialLead.notes || '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEmailModal, setShowEmailModal]     = useState(false);
  const [showDocsModal, setShowDocsModal]       = useState(false);
  const [showSendModal, setShowSendModal]       = useState(false);
  const [showFinancials, setShowFinancials]     = useState(false);
  const [dbStatuses, setDbStatuses]           = useState<DBStatus[]>([]);

  // ── Click-to-call (rings SIP desk phone first, then dials the lead) ────────
  const [callBusy, setCallBusy]   = useState(false);
  const [callMsg, setCallMsg]     = useState<string | null>(null);
  const [callSeq, setCallSeq]     = useState(0); // remounts CallHistoryPanel to refresh

  const startCall = useCallback(async () => {
    setCallBusy(true);
    setCallMsg(null);
    try {
      const res = await fetch('/api/telephony/click-to-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Call failed');
      setCallMsg(
        data.dryRun
          ? `Dry run — would dial ${data.wouldDial?.to} via ${data.wouldDial?.sip || 'SIP (not set)'}`
          : 'Ringing your desk phone…'
      );
      setCallSeq((s) => s + 1);
    } catch (e) {
      setCallMsg(e instanceof Error ? e.message : 'Call failed');
    } finally {
      setCallBusy(false);
    }
  }, [lead.id]);

  // Load dynamic statuses
  useEffect(() => {
    fetch('/api/lead-statuses', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.statuses) setDbStatuses(j.statuses); })
      .catch(() => {});
  }, []);

  // Prev/Next navigation
  const currentIdx = allLeadIds.indexOf(lead.id);
  const prevId = currentIdx > 0 ? allLeadIds[currentIdx - 1] : null;
  const nextId = currentIdx < allLeadIds.length - 1 ? allLeadIds[currentIdx + 1] : null;

  const status = lead.lead_status || lead.stage || 'New Lead';
  const statusStyle = getStatusStyle(status, dbStatuses);

  // ── SOS / Google lookup (header buttons) ──────────────────────────────────
  const SOS_URLS: Record<string, string> = {
    AL:'https://arc-sos.state.al.us/cgi/corpname.mbr/input',AK:'https://myalaska.state.ak.us/business/soskb/Corp.asp',
    AZ:'https://apps.azsos.gov/apps/tntp/se.html',AR:'https://www.sos.arkansas.gov/corps/search_all.php',
    CA:'https://bizfileonline.sos.ca.gov/search/business',CO:'https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do',
    CT:'https://service.ct.gov/business/s/onlinebusinesssearch',DE:'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx',
    DC:'https://corponline.dcra.dc.gov/Home.aspx',FL:'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName',
    GA:'https://ecorp.sos.ga.gov/BusinessSearch',HI:'https://hbe.ehawaii.gov/documents/search.html',
    ID:'https://sosbiz.idaho.gov/search/business',IL:'https://www.ilsos.gov/corporatellc/',
    IN:'https://bsd.sos.in.gov/publicbusinesssearch',IA:'https://sos.iowa.gov/search/business/search.aspx',
    KS:'https://www.sos.ks.gov/eforms/BusinessEntity/Search.aspx',KY:'https://sosbes.sos.ky.gov/BusSearchNProfile/search.aspx',
    LA:'https://coraweb.sos.la.gov/commercialSearch/CommercialSearch.aspx',ME:'https://apps3.web.maine.gov/nei-sos-icrs/ICRS?MainPage=x',
    MD:'https://egov.maryland.gov/businessexpress/entitysearch',MA:'https://corp.sec.state.ma.us/CorpWeb/CorpSearch/CorpSearch.aspx',
    MI:'https://mibusinessregistry.lara.state.mi.us/search/business',MN:'https://mblsportal.sos.state.mn.us/Business/Search',
    MS:'https://business.sos.ms.gov/star/portal/msbsd/portal.aspx',MO:'https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx',
    MT:'https://biz.sosmt.gov/search',NE:'https://www.nebraska.gov/sos/corp/corpsearch.cgi',
    NV:'https://esos.nv.gov/EntitySearch/OnlineEntitySearch',NH:'https://quickstart.sos.nh.gov/online/Business',
    NJ:'https://www.njportal.com/DOR/BusinessNameSearch/',NM:'https://enterprise.sos.nm.gov/search/business',
    NY:'https://apps.dos.ny.gov/publicInquiry/',NC:'https://www.sosnc.gov/online_services/search/by_title/_Business_Registration',
    ND:'https://firststop.sos.nd.gov/search/business',OH:'https://businesssearch.ohiosos.gov/',
    OK:'https://www.sos.ok.gov/corp/corpInquiryFind.aspx',OR:'https://sos.oregon.gov/business/Pages/find.aspx',
    PA:'https://file.dos.pa.gov/search/business',RI:'https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx',
    SC:'https://businessfilings.sc.gov/BusinessFiling/Entity/Search',SD:'https://sosenterprise.sd.gov/BusinessServices/Business/FilingSearch.aspx',
    TN:'https://tncab.tnsos.gov/business-entity-search',TX:'https://comptroller.texas.gov/taxes/franchise/account-status/search',
    UT:'https://corporations.utah.gov/search/',VT:'https://bizfilings.vermont.gov/online/Filings/PrSearchAction',
    VA:'https://cis.scc.virginia.gov/',WA:'https://ccfs.sos.wa.gov/#/BusinessSearch',
    WV:'https://apps.wv.gov/sos/businessentitysearch/',WI:'https://apps.dfi.wi.gov/apps/corpsearch/search.aspx',
    WY:'https://wyobiz.wyo.gov/Business/FilingSearch.aspx',
  };
  const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
  const [sosOpen, setSosOpen] = useState(false);
  const [sosCopied, setSosCopied] = useState(false);
  const detectedSosState = useMemo(() => {
    const ph = lead.phone || '';
    const digits = ph.replace(/\D/g, '');
    const ac = digits.length === 11 && digits.startsWith('1') ? digits.substring(1, 4) : digits.length === 10 ? digits.substring(0, 3) : null;
    if (!ac) return null;
    const map: Record<string, string> = {
      '205':'AL','251':'AL','256':'AL','334':'AL','659':'AL','938':'AL','907':'AK','480':'AZ','520':'AZ','602':'AZ','623':'AZ','928':'AZ',
      '479':'AR','501':'AR','870':'AR','209':'CA','213':'CA','279':'CA','310':'CA','323':'CA','408':'CA','415':'CA','510':'CA','530':'CA',
      '559':'CA','562':'CA','619':'CA','626':'CA','650':'CA','657':'CA','661':'CA','707':'CA','714':'CA','760':'CA','805':'CA','818':'CA',
      '831':'CA','858':'CA','909':'CA','916':'CA','925':'CA','949':'CA','951':'CA','303':'CO','719':'CO','720':'CO','970':'CO',
      '203':'CT','475':'CT','860':'CT','302':'DE','239':'FL','305':'FL','321':'FL','352':'FL','407':'FL','561':'FL','727':'FL',
      '754':'FL','772':'FL','786':'FL','813':'FL','850':'FL','863':'FL','904':'FL','941':'FL','954':'FL','229':'GA','404':'GA',
      '470':'GA','478':'GA','678':'GA','706':'GA','762':'GA','770':'GA','912':'GA','808':'HI','208':'ID','217':'IL','224':'IL',
      '309':'IL','312':'IL','331':'IL','447':'IL','464':'IL','618':'IL','630':'IL','708':'IL','730':'IL','773':'IL','779':'IL',
      '815':'IL','847':'IL','872':'IL','219':'IN','260':'IN','317':'IN','463':'IN','574':'IN','765':'IN','812':'IN','930':'IN',
      '319':'IA','515':'IA','563':'IA','641':'IA','712':'IA','316':'KS','620':'KS','785':'KS','913':'KS','270':'KY','364':'KY',
      '502':'KY','606':'KY','859':'KY','225':'LA','318':'LA','337':'LA','504':'LA','985':'LA','207':'ME','240':'MD','301':'MD',
      '410':'MD','443':'MD','667':'MD','339':'MA','351':'MA','413':'MA','508':'MA','617':'MA','774':'MA','781':'MA','857':'MA',
      '978':'MA','231':'MI','248':'MI','269':'MI','313':'MI','517':'MI','586':'MI','616':'MI','734':'MI','810':'MI','906':'MI',
      '947':'MI','989':'MI','218':'MN','320':'MN','507':'MN','612':'MN','651':'MN','763':'MN','952':'MN','228':'MS','601':'MS',
      '662':'MS','769':'MS','314':'MO','417':'MO','557':'MO','573':'MO','636':'MO','660':'MO','816':'MO','406':'MT','308':'NE',
      '402':'NE','531':'NE','702':'NV','725':'NV','775':'NV','603':'NH','201':'NJ','551':'NJ','609':'NJ','732':'NJ','848':'NJ',
      '856':'NJ','862':'NJ','908':'NJ','973':'NJ','505':'NM','575':'NM','212':'NY','315':'NY','332':'NY','347':'NY','516':'NY',
      '518':'NY','585':'NY','607':'NY','631':'NY','646':'NY','680':'NY','716':'NY','718':'NY','838':'NY','845':'NY','914':'NY',
      '917':'NY','929':'NY','934':'NY','252':'NC','336':'NC','704':'NC','743':'NC','828':'NC','910':'NC','919':'NC','980':'NC',
      '984':'NC','701':'ND','216':'OH','220':'OH','234':'OH','330':'OH','380':'OH','419':'OH','440':'OH','513':'OH','567':'OH',
      '614':'OH','740':'OH','937':'OH','405':'OK','539':'OK','580':'OK','918':'OK','503':'OR','541':'OR','458':'OR','971':'OR',
      '215':'PA','267':'PA','272':'PA','412':'PA','445':'PA','484':'PA','570':'PA','610':'PA','717':'PA','724':'PA','814':'PA',
      '878':'PA','401':'RI','803':'SC','839':'SC','843':'SC','864':'SC','605':'SD','423':'TN','615':'TN','629':'TN','731':'TN',
      '865':'TN','901':'TN','931':'TN','210':'TX','214':'TX','254':'TX','281':'TX','325':'TX','346':'TX','361':'TX','409':'TX',
      '430':'TX','432':'TX','469':'TX','512':'TX','682':'TX','713':'TX','726':'TX','737':'TX','806':'TX','817':'TX','830':'TX',
      '832':'TX','903':'TX','915':'TX','936':'TX','940':'TX','956':'TX','972':'TX','979':'TX','385':'UT','435':'UT','801':'UT',
      '802':'VT','276':'VA','434':'VA','540':'VA','571':'VA','703':'VA','757':'VA','804':'VA','206':'WA','253':'WA','360':'WA',
      '425':'WA','509':'WA','564':'WA','304':'WV','681':'WV','262':'WI','414':'WI','534':'WI','608':'WI','715':'WI','920':'WI',
      '307':'WY',
    };
    return map[ac] || null;
  }, [lead.phone]);
  const [sosState, setSosState] = useState('');
  useEffect(() => { if (detectedSosState) setSosState(detectedSosState); else setSosState('NY'); }, [detectedSosState]);
  const businessName = lead.company || lead.name || '';

  // Fields that can be updated directly via update-crm
  const DIRECT_FIELDS = new Set([
    'company', 'name', 'email', 'phone', 'notes', 'stage',
    'value', 'lead_source', 'last_contact', 'offers',
  ]);

  // ── Field save helper ────────────────────────────────────────────────────────
  /** Calculate months between a date string and today */
  const calcTIBMonths = (dateStr: string): number | null => {
    if (!dateStr) return null;
    const start = new Date(dateStr);
    if (isNaN(start.getTime())) return null;
    const now = new Date();
    return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
  };

  const saveField = useCallback(async (field: string, value: string) => {
    if (DIRECT_FIELDS.has(field)) {
      const res = await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, field, value }),
      });
      if (res.ok) {
        setLead(prev => ({ ...prev, [field]: value }));
      }
    } else {
      const currentUd = (lead.underwriting_data || {}) as Record<string, unknown>;
      const updatedUd: Record<string, unknown> = { ...currentUd, [field]: value };

      // Auto-calculate Time in Business when Start Date is saved
      if (field === 'businessStartDate') {
        const months = calcTIBMonths(value);
        if (months !== null) updatedUd.timeInBusiness = months;
      }

      const res = await fetch('/api/leads/underwriting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, underwritingData: updatedUd }),
      });
      if (res.ok) {
        setLead(prev => ({ ...prev, underwriting_data: updatedUd }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, lead.underwriting_data]);

  // ── Save bank analysis snapshot to underwriting_data ────────────────────────
  const saveBankAnalysis = useCallback(async (snapshot: Record<string, unknown>) => {
    const currentUd = (lead.underwriting_data || {}) as Record<string, unknown>;
    const updatedUd = { ...currentUd, bankStatementAnalysis: snapshot };
    const res = await fetch('/api/leads/underwriting', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, underwritingData: updatedUd }),
    });
    if (res.ok) {
      setLead(prev => ({ ...prev, underwriting_data: updatedUd }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, lead.underwriting_data]);

  // ── Analyze a bank statement attachment and save result ───────────────────────
  const analyzeBankAttachment = useCallback(async (attachment: { id: string; file_name: string; file_type?: string }) => {
    try {
      const dlRes = await fetch(`/api/attachments/download?id=${attachment.id}`, { credentials: 'include' });
      if (!dlRes.ok) return;
      const { url } = await dlRes.json();
      const blob = await fetch(url).then(r => r.blob());
      const file = new File([blob], attachment.file_name, { type: attachment.file_type || 'application/pdf' });
      const fd = new FormData();
      fd.append('files', file);
      const resp = await fetch('/api/bank-analyze', { method: 'POST', body: fd });
      if (!resp.ok) return;
      const data = await resp.json() as Record<string, unknown>;
      const snapshot = {
        analyzedAt: new Date().toISOString(),
        displayMetrics: data.metrics,
        per_file: data.per_file,
      };
      await saveBankAnalysis(snapshot);
    } catch { /* silent */ }
  }, [saveBankAnalysis]);

  // ── Apply parsed application fields ─────────────────────────────────────────
  const applyParsedApp = async (
    fields: Record<string, string>,
    selected: Set<string>
  ) => {
    const DIRECT = new Set(['company', 'name', 'email', 'phone', 'notes', 'stage', 'value']);
    const directUpdates: Record<string, string> = {};
    const udUpdates: Record<string, string>     = {};

    for (const [k, v] of Object.entries(fields)) {
      if (!selected.has(k) || !v) continue;
      if (DIRECT.has(k)) directUpdates[k] = v;
      else                udUpdates[k]     = v;
    }

    // Direct fields — one PATCH per field
    for (const [field, value] of Object.entries(directUpdates)) {
      await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, field, value }),
        credentials: 'include',
      });
      setLead(prev => ({ ...prev, [field]: value }));
    }

    // Normalize parse-application field names
    if ('depositCount' in udUpdates && !('depositsCount' in udUpdates)) {
      udUpdates.depositsCount = udUpdates.depositCount;
      delete udUpdates.depositCount;
    }

    // Underwriting fields — merge into existing ud
    if (Object.keys(udUpdates).length) {
      const currentUd = (lead.underwriting_data || {}) as Record<string, unknown>;
      const mergedUd  = { ...currentUd, ...udUpdates };
      await fetch('/api/leads/underwriting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, underwritingData: mergedUd }),
        credentials: 'include',
      });
      setLead(prev => ({ ...prev, underwriting_data: mergedUd }));
    }
  };

  // ── Notes save ───────────────────────────────────────────────────────────────
  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, field: 'notes', value: notes }),
      });
      setLead(prev => ({ ...prev, notes }));
    } finally {
      setNotesSaving(false);
    }
  };

  // ── Underwriting save ────────────────────────────────────────────────────────
  const handleUnderwritingSave = async (data: Record<string, unknown>) => {
    await fetch('/api/leads/underwriting', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, underwritingData: data }),
    });
    setLead(prev => ({ ...prev, underwriting_data: data }));
  };

  // ── Delete lead ──────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch('/api/leads/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      // If inside iframe overlay, break out to parent; otherwise navigate normally
      if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
        window.top.location.href = '/pipeline';
      } else {
        router.push('/pipeline');
      }
    } finally {
      setDeleting(false);
    }
  };

  // ── Status / temperature / assigned save ────────────────────────────────────
  const saveLeadStatus = async (val: string) => {
    await fetch('/api/leads/pipeline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, field: 'lead_status', value: val }),
    });
    setLead(prev => ({ ...prev, lead_status: val }));
  };

  const saveTemperature = async (val: string) => {
    await fetch('/api/leads/pipeline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, field: 'temperature', value: val }),
    });
    setLead(prev => ({ ...prev, temperature: val }));
  };

  const saveAssignedTo = async (val: string) => {
    await fetch('/api/leads/pipeline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, field: 'assigned_to', value: val }),
    });
    setLead(prev => ({ ...prev, assigned_to: val }));
  };

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  // ── Derive display values from underwriting_data JSONB ──────────────────────
  const ud = (lead.underwriting_data || {}) as Record<string, unknown>;
  const creditScore = (ud.creditScore != null ? Number(ud.creditScore) : null);
  /** Safely extract a string from unknown JSON value */
  const str = (v: unknown): string | null => (v != null ? String(v) : null);

  // Auto-derive TIB from businessStartDate if timeInBusiness is not set
  const derivedTIB: number | null = (() => {
    if (ud.timeInBusiness != null && ud.timeInBusiness !== '') return Number(ud.timeInBusiness);
    if (!ud.businessStartDate) return null;
    const start = new Date(String(ud.businessStartDate));
    if (isNaN(start.getTime())) return null;
    const now = new Date();
    return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
  })();

  const creditScoreColor =
    !creditScore ? '#9b9b9b' :
    creditScore >= 750 ? '#15803d' :
    creditScore >= 650 ? '#a16207' : '#b91c1c';

  // scrollToUW removed — Underwriting Suite section is no longer visible

  // ── Projected Offer calculation (mirrors UnderwritingSuite logic) ────────────
  const [showProjectedOffer, setShowProjectedOffer] = useState(false);
  const [showOffersModal, setShowOffersModal] = useState(false);

  const projectedOffer = useMemo(() => {
    const rev      = Number(ud.monthlyRevenue  ?? 0);
    const fico     = Number(ud.creditScore     ?? 0);
    const tib      = derivedTIB ?? Number(ud.timeInBusiness ?? 0);
    const nsf      = Number(ud.nsfCount        ?? 0);
    const deps     = Number(ud.depositsCount   ?? 0);
    const adb      = Number(ud.avgDailyBalance ?? 0);
    const industry = String(ud.industry        ?? '');
    const hasMCA   = Boolean(ud.hasOtherMCALoans ?? false);
    const mcaPmt   = Number(ud.otherMCAMonthlyPayment ?? 0);
    const mcaBal   = Number(ud.otherMCAOutstandingBalance ?? 0);
    const m1 = Number(ud.month1Revenue ?? 0), m2 = Number(ud.month2Revenue ?? 0);
    const m3 = Number(ud.month3Revenue ?? 0), m4 = Number(ud.month4Revenue ?? 0);

    if (!rev) return null; // need at least monthly revenue

    // Revenue stability
    const months = [m1, m2, m3, m4].filter(x => x > 0);
    const avg    = months.length ? months.reduce((a, b) => a + b, 0) / months.length : rev;
    const revenueStability = months.length >= 2
      ? 1 - (Math.max(...months) - Math.min(...months)) / avg
      : 0.7;

    const otherMCAMonthlyPayment = hasMCA ? mcaPmt : 0;
    const availableRev = rev - otherMCAMonthlyPayment;

    // Factor rate
    let fr = 1.35;
    let holdback = 12;
    // Industry
    if (/Healthcare|Medical|Dental|Legal|Accounting|Insurance/i.test(industry))           { fr -= 0.07; }
    else if (/Professional Services|IT Services|Software|SaaS|Consulting|Financial/i.test(industry)) { fr -= 0.04; }
    else if (/Bar|Nightclub|Trucking|Moving|Construction|Roofing|Auto Dealership|Travel|Entertainment|Catering/i.test(industry)) { fr += 0.07; holdback += 2; }
    else if (/Dropshipping|Amazon FBA|Event Planning|Non-Profit/i.test(industry))         { fr += 0.10; holdback += 3; }
    else if (/Restaurant.*Fast|Food Truck|Retail.*Clothing|Fitness|Gym|Salon|Beauty|Pet|Cleaning|Landscaping/i.test(industry)) { fr += 0.04; }
    // FICO
    if (fico >= 700)      fr -= 0.10;
    else if (fico >= 650) fr -= 0.05;
    else if (fico < 600)  fr += 0.05;
    // TIB
    if (tib >= 36)      fr -= 0.05;
    else if (tib < 12)  fr += 0.05;
    // NSF
    if (nsf === 0)     fr -= 0.03;
    else if (nsf >= 3) fr += 0.05;
    // Stability
    if (revenueStability > 0.8)      fr -= 0.03;
    else if (revenueStability < 0.5) fr += 0.03;
    // Deposits
    if (deps >= 13)     fr -= 0.03;
    else if (deps >= 8) fr -= 0.01;
    else if (deps < 3)  fr += 0.03;
    // MCA debt burden
    if (hasMCA && otherMCAMonthlyPayment > 0 && rev > 0) {
      const dtr = otherMCAMonthlyPayment / rev;
      if (dtr > 0.25) fr += 0.08;
      else if (dtr > 0.15) fr += 0.05;
      else if (dtr > 0.10) fr += 0.03;
      if (mcaBal > 0) {
        const btr = mcaBal / rev;
        if (btr > 4) fr += 0.06;
        else if (btr > 2.5) fr += 0.03;
      }
    }
    fr = Math.max(1.15, Math.min(1.45, fr));

    // Holdback
    if (rev >= 100000) holdback = 8;
    else if (rev >= 50000) holdback = 10;
    else if (rev >= 25000) holdback = 12;
    else holdback = 15;
    if (nsf >= 2)    holdback += 2;
    if (adb < 5000)  holdback += 2;
    if (hasMCA && otherMCAMonthlyPayment / rev > 0.15) holdback += 2;
    holdback = Math.max(8, Math.min(20, holdback));

    // Approved amount
    let advanceMult = 1.5;
    if (fico >= 700 && tib >= 24) advanceMult = 2.0;
    else if (fico >= 650 && tib >= 12) advanceMult = 1.75;
    else if (fico < 600 || tib < 6) advanceMult = 1.2;
    const revenueForAdvance = Math.max(0, availableRev);
    const maxApproved = revenueForAdvance > 0 ? Math.floor(revenueForAdvance * advanceMult) : 0;

    // Term
    let termMonths = 9;
    if (fico >= 700 && tib >= 36)      termMonths = 15;
    else if (fico >= 650 && tib >= 24) termMonths = 12;
    else if (tib >= 12)                termMonths = 9;
    else                               termMonths = 6;

    // Weekly payback
    const totalRepayment = maxApproved * fr;
    const weeklyPayback  = termMonths > 0 ? (totalRepayment / termMonths) / 4.33 : 0;

    // Risk score
    let score = 40;
    if (/Healthcare|Medical|Dental|Legal|Accounting|Insurance/i.test(industry))           score += 20;
    else if (/IT Services|Software|SaaS|Consulting|Financial/i.test(industry))             score += 12;
    else if (/Retail/i.test(industry) && !/Bar|Night/i.test(industry))                    score += 5;
    else if (/Restaurant|Food/i.test(industry))                                            score -= 5;
    else if (/Bar|Nightclub|Trucking|Construction|Roofing|Auto Dealership/i.test(industry)) score -= 15;
    else if (/Dropshipping|Amazon FBA|Event Planning|Non-Profit/i.test(industry))          score -= 25;
    if (fico >= 720)      score += 25;
    else if (fico >= 680) score += 15;
    else if (fico >= 650) score += 5;
    else if (fico >= 620) score -= 5;
    else if (fico >= 580) score -= 15;
    else                  score -= 25;
    if (tib >= 48)      score += 18;
    else if (tib >= 36) score += 12;
    else if (tib >= 24) score += 6;
    else if (tib >= 12) score -= 5;
    else                score -= 15;
    if (nsf === 0)      score += 15;
    else if (nsf === 1) score -= 5;
    else if (nsf === 2) score -= 12;
    else                score -= 20;
    if (deps >= 15)     score += 12;
    else if (deps >= 10) score += 6;
    else if (deps < 5)  score -= 10;
    if (adb >= 30000)      score += 15;
    else if (adb >= 15000) score += 8;
    else if (adb >= 8000)  score += 3;
    else if (adb < 5000)   score -= 12;
    const riskScore = Math.max(0, Math.min(100, score));

    return {
      maxApproved,
      factorRate: Math.round(fr * 100) / 100,
      riskScore,
      weeklyPayback: Math.round(weeklyPayback),
      holdback,
      termMonths,
    };
  }, [ud]);

  return (
    <div className="flex flex-col">
      {/* ── TOP HEADER BAR ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#e5e5e5] px-6 py-3 flex items-center justify-between flex-shrink-0">
        {/* Left: back + title */}
        <div className="flex items-center gap-4">
          {lead.in_pipeline && !fromLeads ? (
            <a
              href="/pipeline"
              onClick={e => {
                if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
                  e.preventDefault();
                  window.top.location.href = '/pipeline';
                }
              }}
              className="flex items-center gap-1.5 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Pipeline
            </a>
          ) : (
            <button
              onClick={async () => {
                await fetch('/api/leads/pipeline', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ leadId: lead.id }),
                });
                setLead(prev => ({ ...prev, in_pipeline: true }));
                const dest = '/pipeline';
                if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
                  window.top.location.href = dest;
                } else {
                  router.push(dest);
                }
              }}
              className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#1a1a1a] hover:bg-[#333] px-3 py-1 rounded-md transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add to Pipeline
            </button>
          )}
          <span className="text-[#e5e5e5]">|</span>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#1a1a1a]">{lead.company || lead.name}</h2>
            <span className="text-xs text-[#9b9b9b] font-mono">#{lead.id.slice(0, 8)}</span>
          </div>
          <span
            className="px-2.5 py-0.5 rounded text-xs font-medium"
            style={{ background: statusStyle.bg, color: statusStyle.text }}
          >
            {status}
          </span>

          {/* SOS + Google quick lookup buttons */}
          <div className="relative flex items-center gap-1.5">
            <button
              onClick={() => setSosOpen(o => !o)}
              title="SOS Registry Lookup"
              className="px-2.5 py-0.5 rounded text-xs font-medium bg-[#1a1a1a] text-white hover:bg-[#333] transition-colors"
            >
              SOS
            </button>
            <button
              onClick={() => {
                const q = encodeURIComponent(`"${businessName}" ${sosState} reviews`);
                window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener,noreferrer');
              }}
              title="Google this business"
              className="px-2.5 py-0.5 rounded text-xs font-medium bg-[#1a1a1a] text-white hover:bg-[#333] transition-colors"
            >
              Google
            </button>

            {/* SOS Popup */}
            {sosOpen && (
              <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-xl shadow-2xl border border-[#e5e5e5] z-50 p-4">
                <div className="flex justify-end mb-1">
                  <button onClick={() => setSosOpen(false)} className="text-[#9b9b9b] hover:text-[#1a1a1a] text-lg leading-none">&times;</button>
                </div>
                <div className="bg-[#fafafa] rounded-lg px-3 py-2 mb-3">
                  <p className="text-xs text-[#9b9b9b] mb-0.5">Business Name</p>
                  <p className="text-sm font-semibold text-[#1a1a1a] truncate">{businessName || '(no business name)'}</p>
                </div>
                <div className="mb-3">
                  <label className="block text-xs text-[#6b6b6b] mb-1">
                    State
                    {detectedSosState && <span className="ml-1.5 text-blue-600 font-medium">(detected: {detectedSosState})</span>}
                  </label>
                  <select
                    value={sosState}
                    onChange={e => setSosState(e.target.value)}
                    className="w-full border border-[#e5e5e5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]"
                  >
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => {
                    if (businessName) { navigator.clipboard.writeText(businessName).catch(() => {}); setSosCopied(true); setTimeout(() => setSosCopied(false), 2000); }
                    const url = SOS_URLS[sosState];
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="w-full py-2 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#333] transition-colors"
                >
                  {sosCopied ? `Copied! Opening ${sosState} SOS…` : `Copy Name & Open ${sosState} SOS`}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: actions + prev/next */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/pipeline/${lead.id}?edit=true`)}
            className="p-2 rounded-md border border-[#e5e5e5] hover:bg-[#f5f5f5] text-[#6b6b6b] transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-2 rounded-md border border-[#e5e5e5] hover:bg-red-50 text-[#9b9b9b] hover:text-red-600 transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <div className="flex gap-1 ml-2">
            <button
              onClick={() => {
                if (!prevId) return;
                const inIframe = typeof window !== 'undefined' && window.top && window.top !== window.self;
                router.push(`/pipeline/${prevId}${inIframe ? '?modal=1' : ''}`);
              }}
              disabled={!prevId}
              className="px-2 py-1.5 text-sm border border-[#e5e5e5] rounded-md disabled:opacity-30 hover:bg-[#f5f5f5] transition-colors"
              title="Previous"
            >
              ← Prev
            </button>
            <button
              onClick={() => {
                if (!nextId) return;
                const inIframe = typeof window !== 'undefined' && window.top && window.top !== window.self;
                router.push(`/pipeline/${nextId}${inIframe ? '?modal=1' : ''}`);
              }}
              disabled={!nextId}
              className="px-2 py-1.5 text-sm border border-[#e5e5e5] rounded-md disabled:opacity-30 hover:bg-[#f5f5f5] transition-colors"
              title="Next"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* ── 3-PANE BODY ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr_300px] min-h-[calc(100vh-140px)]">

        {/* ── LEFT PANE: Lead Details ─────────────────────────────────────── */}
        <div className="border-r border-[#e5e5e5] bg-white p-4">
          {/* PERSON */}
          <Section title="Person">
            {/* name is a single field in DB — show split for display but save as full name */}
            <Field label="Full Name"  value={lead.name}    onSave={v => saveField('name', v)} />
            <Field label="Email"      value={lead.email}   onSave={v => saveField('email', v)}  type="email" />
            <Field label="Mobile"     value={lead.phone}   onSave={v => saveField('phone', v)}  type="tel" />
            <Field label="DOB"        value={str(ud.dob)}        onSave={v => saveField('dob', v)} />
            <Field label="SSN"        value={str(ud.ssn)}        onSave={v => saveField('ssn', v)} masked />
            <Field label="Home Address" value={str(ud.homeAddress)} onSave={v => saveField('homeAddress', v)} />
            <Field label="City"       value={str(ud.city)}       onSave={v => saveField('city', v)} />
            <Field label="State"      value={str(ud.state)}      onSave={v => saveField('state', v)} />
            <Field label="ZIP"        value={str(ud.zip)}        onSave={v => saveField('zip', v)} />
            <Field label="Country"    value={str(ud.country) ?? 'US'} onSave={v => saveField('country', v)} />
          </Section>

          {/* CREDIT */}
          <Section title="Credit">
            <Field
              label="Credit Score"
              value={creditScore != null ? String(creditScore) : null}
              onSave={v => saveField('creditScore', v)}
              type="number"
              valueStyle={{ color: creditScoreColor, fontWeight: 700 }}
            />
            <Field label="Credit Util %" value={str(ud.creditUtilization)} onSave={v => saveField('creditUtilization', v)} type="number" />
            <Field label="Inquiries"     value={str(ud.creditInquiries)}   onSave={v => saveField('creditInquiries', v)} type="number" />
            <Field label="Lates"         value={str(ud.creditLates)}       onSave={v => saveField('creditLates', v)} type="number" />
          </Section>

          {/* COMPANY */}
          <Section title="Company">
            <Field label="Legal Name"    value={lead.company}              onSave={v => saveField('company', v)} />
            <Field label="DBA"           value={str(ud.dba)}              onSave={v => saveField('dba', v)} />
            <Field label="Address"       value={str(ud.businessAddress)}  onSave={v => saveField('businessAddress', v)} />
            <Field label="City"          value={str(ud.businessCity)}     onSave={v => saveField('businessCity', v)} />
            <Field label="State"         value={str(ud.businessState)}    onSave={v => saveField('businessState', v)} />
            <Field label="ZIP"           value={str(ud.businessZip)}      onSave={v => saveField('businessZip', v)} />
            <Field label="Industry"      value={str(ud.industry)}         onSave={v => saveField('industry', v)} />
            <TIBField
              valueMonths={derivedTIB}
              onSave={months => saveField('timeInBusiness', String(months))}
            />
            <Field label="Start Date"    value={str(ud.businessStartDate)} onSave={v => saveField('businessStartDate', v)} />
            <Field label="EIN"           value={str(ud.ein)}              onSave={v => saveField('ein', v)} />
            <Field label="Entity Type"   value={str(ud.entityType)}       onSave={v => saveField('entityType', v)} />
            <Field label="Ownership %"   value={str(ud.ownershipPercent)} onSave={v => saveField('ownershipPercent', v)} />
            <Field label="Business Phone" value={str(ud.businessPhone)}   onSave={v => saveField('businessPhone', v)} type="tel" />
            <Field label="Fax"           value={str(ud.fax)}              onSave={v => saveField('fax', v)} />
            <CheckboxField
              label="Sole Proprietor"
              checked={!!(ud as Record<string, unknown>).isSoleProp}
              onToggle={() => saveField('isSoleProp', String(!(ud as Record<string, unknown>).isSoleProp))}
            />
          </Section>

          {/* DEAL */}
          <Section title="Deal">
            <Field label="Amount Requested"  value={lead.value != null ? String(lead.value) : str(ud.requestedAmount)} onSave={v => saveField('value', v)} />
            <Field label="Use of Funds"      value={str(ud.purposeOfFunds)}   onSave={v => saveField('purposeOfFunds', v)} />
            <Field label="Avg Monthly Rev"   value={str(ud.monthlyRevenue)}   onSave={v => saveField('monthlyRevenue', v)} type="number" />
            <Field label="Avg Daily Balance" value={str(ud.avgDailyBalance)}  onSave={v => saveField('avgDailyBalance', v)} type="number" />
            <Field label="Ending Balance"    value={str(ud.endingBalance)}    onSave={v => saveField('endingBalance', v)} type="number" />
            <Field label="NSF Count (3mo)"   value={str(ud.nsfCount)}         onSave={v => saveField('nsfCount', v)} type="number" />
            <Field label="Avg Deposits/Mo"   value={str(ud.depositsCount)}    onSave={v => saveField('depositsCount', v)} type="number" />
            <CheckboxField
              label="Has MCA Loans"
              checked={!!(ud as Record<string, unknown>).hasOtherMCALoans}
              onToggle={() => saveField('hasOtherMCALoans', String(!(ud as Record<string, unknown>).hasOtherMCALoans))}
            />
          </Section>

          {/* OWNER 2 — collapsible, show only if any owner2 field exists */}
          {!!(ud.owner2FirstName || ud.owner2LastName || ud.owner2CreditScore) && (
            <Section title="Owner 2" collapsible>
              <Field label="First Name"   value={str(ud.owner2FirstName)}       onSave={v => saveField('owner2FirstName', v)} />
              <Field label="Last Name"    value={str(ud.owner2LastName)}        onSave={v => saveField('owner2LastName', v)} />
              <Field label="DOB"          value={str(ud.owner2Dob)}             onSave={v => saveField('owner2Dob', v)} />
              <Field label="Ownership %"  value={str(ud.owner2OwnershipPercent)} onSave={v => saveField('owner2OwnershipPercent', v)} />
              <Field label="Credit Score" value={str(ud.owner2CreditScore)}     onSave={v => saveField('owner2CreditScore', v)} />
              <Field label="SSN"          value={str(ud.owner2Ssn)}             onSave={v => saveField('owner2Ssn', v)} masked />
              <Field label="City"         value={str(ud.owner2City)}            onSave={v => saveField('owner2City', v)} />
              <Field label="State"        value={str(ud.owner2State)}           onSave={v => saveField('owner2State', v)} />
              <Field label="ZIP"          value={str(ud.owner2Zip)}             onSave={v => saveField('owner2Zip', v)} />
            </Section>
          )}

          {/* META */}
          <Section title="Meta">
            <Field label="Created At"  value={fmtDate(lead.created_at)}  readOnly />
            <Field label="Updated At"  value={fmtDate(lead.updated_at)}  readOnly />
          </Section>

          {/* Bank Report buttons */}
          <div className="flex gap-2 pt-1 pb-3 px-1">
            <button
              onClick={() => {
                const d = ud;
                const html = `<!DOCTYPE html><html><head><title>Bank Report — ${lead.company || lead.name}</title>
                <style>body{font-family:sans-serif;padding:32px;max-width:680px;margin:auto;color:#1a1a1a}h1{font-size:18px;margin-bottom:4px}p.sub{font-size:12px;color:#6b6b6b;margin:0 0 24px}table{width:100%;border-collapse:collapse;font-size:13px}td{padding:8px 10px;border-bottom:1px solid #f0f0f0}td:first-child{color:#6b6b6b;width:55%}td:last-child{font-weight:600;text-align:right}.section{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9b9b9b;padding:14px 10px 4px;border-bottom:2px solid #f0f0f0}@media print{body{padding:16px}}</style>
                </head><body>
                <h1>${lead.company || lead.name}</h1>
                <p class="sub">Bank Statement Analysis · Generated ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
                <table>
                  <tr><td class="section" colspan="2">Revenue</td></tr>
                  <tr><td>Avg Monthly Revenue</td><td>${d.monthlyRevenue ? '$'+Number(d.monthlyRevenue).toLocaleString() : '—'}</td></tr>
                  <tr><td>Month 1 Deposits</td><td>${d.month1Revenue ? '$'+Number(d.month1Revenue).toLocaleString() : '—'}</td></tr>
                  <tr><td>Month 2 Deposits</td><td>${d.month2Revenue ? '$'+Number(d.month2Revenue).toLocaleString() : '—'}</td></tr>
                  <tr><td>Month 3 Deposits</td><td>${d.month3Revenue ? '$'+Number(d.month3Revenue).toLocaleString() : '—'}</td></tr>
                  <tr><td>Month 4 Deposits</td><td>${d.month4Revenue ? '$'+Number(d.month4Revenue).toLocaleString() : '—'}</td></tr>
                  <tr><td class="section" colspan="2">Balances</td></tr>
                  <tr><td>Avg Daily Balance</td><td>${d.avgDailyBalance ? '$'+Number(d.avgDailyBalance).toLocaleString() : '—'}</td></tr>
                  <tr><td>Ending Balance</td><td>${d.endingBalance ? '$'+Number(d.endingBalance).toLocaleString() : '—'}</td></tr>
                  <tr><td class="section" colspan="2">Activity</td></tr>
                  <tr><td>NSF / Neg Days</td><td>${d.nsfCount ?? '—'}</td></tr>
                  <tr><td>Avg Deposits / Mo</td><td>${d.depositsCount ?? '—'}</td></tr>
                  <tr><td>Largest Deposit</td><td>${d.largestDeposit ? '$'+Number(d.largestDeposit).toLocaleString() : '—'}</td></tr>
                  <tr><td class="section" colspan="2">Underwriting</td></tr>
                  <tr><td>Credit Score</td><td>${d.creditScore ?? '—'}</td></tr>
                  <tr><td>Time in Business</td><td>${d.timeInBusiness ? d.timeInBusiness+' mo' : '—'}</td></tr>
                  <tr><td>Industry</td><td>${d.industry ?? '—'}</td></tr>
                  <tr><td>Business State</td><td>${d.businessState ?? '—'}</td></tr>
                  <tr><td>Has Other MCA</td><td>${d.hasOtherMCALoans ? 'Yes' : 'No'}</td></tr>
                </table>
                </body></html>`;
                const w = window.open('', '_blank', 'width=720,height=900');
                if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#e5e5e5] rounded-lg bg-white text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
              Print Report
            </button>
            <button
              onClick={() => {
                const d = ud;
                const rows = [
                  ['Field','Value'],
                  ['Lead',lead.company||lead.name||''],
                  ['Generated',new Date().toLocaleDateString()],
                  ['Avg Monthly Revenue',d.monthlyRevenue??''],
                  ['Month 1',d.month1Revenue??''],['Month 2',d.month2Revenue??''],
                  ['Month 3',d.month3Revenue??''],['Month 4',d.month4Revenue??''],
                  ['Avg Daily Balance',d.avgDailyBalance??''],
                  ['Ending Balance',d.endingBalance??''],
                  ['NSF Count',d.nsfCount??''],
                  ['Avg Deposits/Mo',d.depositsCount??''],
                  ['Credit Score',d.creditScore??''],
                  ['Time in Business (mo)',d.timeInBusiness??''],
                  ['Industry',d.industry??''],
                  ['Business State',d.businessState??''],
                ];
                const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
                const blob = new Blob([csv],{type:'text/csv'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href=url; a.download=`bank-report-${(lead.company||lead.name||'lead').replace(/\s+/g,'-').toLowerCase()}.csv`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#e5e5e5] rounded-lg bg-white text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download CSV
            </button>
          </div>
        </div>

        {/* ── CENTER PANE: Submissions / Notes / Updates ──────────────────── */}
        <div className="bg-[#fafafa] flex flex-col border-r border-[#e5e5e5]">
          {/* Segmented control */}
          <div className="flex-shrink-0 bg-white border-b border-[#e5e5e5] px-4 pt-4 pb-0 flex items-center gap-1">
            {(['submissions', 'notes', 'updates'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setCenterTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
                  centerTab === tab
                    ? 'border-[#1a1a1a] text-[#1a1a1a]'
                    : 'border-transparent text-[#9b9b9b] hover:text-[#6b6b6b]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 p-4">
            {/* SUBMISSIONS */}
            {centerTab === 'submissions' && (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-[#f0f0f0] flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-[#d4d4d4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[#6b6b6b]">No submissions yet</p>
                <p className="text-xs text-[#9b9b9b] mt-1">Click <strong>Send to Lender</strong> in the Actions panel to get started.</p>
              </div>
            )}

            {/* NOTES */}
            {centerTab === 'notes' && (
              <div className="h-full flex flex-col gap-3">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add notes about this lead…"
                  className="flex-1 w-full px-3 py-2.5 text-sm border border-[#e5e5e5] rounded-lg bg-white text-[#1a1a1a] placeholder:text-[#9b9b9b] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] resize-none min-h-[240px]"
                />
                <button
                  onClick={saveNotes}
                  disabled={notesSaving}
                  className="self-end px-4 py-2 bg-[#1a1a1a] text-white text-sm font-medium rounded-md hover:bg-[#333] disabled:opacity-50 transition-colors"
                >
                  {notesSaving ? 'Saving…' : 'Save Notes'}
                </button>
              </div>
            )}

            {/* UPDATES */}
            {centerTab === 'updates' && (
              <div className="space-y-3">
                <div className="text-sm text-[#9b9b9b] text-center py-8">
                  Activity timeline will appear here as the deal progresses.
                </div>
                {/* Static entries from lead data */}
                {lead.created_at && (
                  <div className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d4d4d4] mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-[#1a1a1a]">Lead created</p>
                      <p className="text-xs text-[#9b9b9b]">{fmtDate(lead.created_at)}</p>
                    </div>
                  </div>
                )}
                {lead.last_contact && (
                  <div className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d4d4d4] mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-[#1a1a1a]">Last contact logged</p>
                      <p className="text-xs text-[#9b9b9b]">{fmtDate(lead.last_contact)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANE: Actions + Deal Tools ────────────────────────────── */}
        <div className="bg-white p-4">

          {/* ACTIONS */}
          <Section title="Actions">
            <div className="grid grid-cols-2 gap-2 mb-1">
              <button
                onClick={() => setShowSendModal(true)}
                className="px-3 py-2.5 bg-[#1a1a1a] text-white text-xs font-medium rounded-md hover:bg-[#333] transition-colors text-center"
              >
                Send to Lender
              </button>
              <button
                onClick={() => { setShowOffersModal(false); setShowEmailModal(true); }}
                className="px-3 py-2.5 border border-[#e5e5e5] text-[#1a1a1a] text-xs font-medium rounded-md hover:bg-[#f5f5f5] transition-colors text-center"
              >
                Send Email
              </button>
              <button
                onClick={() => {
                  const url = `/inbox?leadId=${lead.id}`;
                  // If loaded inside an iframe (modal overlay), navigate the parent window
                  if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
                    window.top.location.href = url;
                  } else {
                    router.push(url);
                  }
                }}
                className="px-3 py-2.5 border border-[#e5e5e5] text-[#1a1a1a] text-xs font-medium rounded-md hover:bg-[#f5f5f5] transition-colors text-center"
              >
                Send SMS
              </button>
              <button
                onClick={() => setShowDocsModal(true)}
                className="px-3 py-2.5 border border-[#e5e5e5] text-[#1a1a1a] text-xs font-medium rounded-md hover:bg-[#f5f5f5] transition-colors text-center"
              >
                Documents
              </button>
            </div>

            {/* Application (disabled) + Financials */}
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled
                title="Coming soon — will link to your funding site application"
                className="px-3 py-2.5 border border-[#e5e5e5] text-[#9b9b9b] text-xs font-medium rounded-md cursor-not-allowed text-center"
              >
                Application
              </button>
              <button
                onClick={() => setShowFinancials(true)}
                className="px-3 py-2.5 border border-[#e5e5e5] text-[#1a1a1a] text-xs font-medium rounded-md hover:bg-[#f5f5f5] transition-colors text-center"
              >
                Financials
              </button>
            </div>

            {/* Call — agent-first SIP dial (desk phone rings, then the lead) */}
            <div className="mt-2">
              <button
                onClick={startCall}
                disabled={callBusy}
                className="w-full px-3 py-2.5 bg-[#1a1a1a] text-white text-xs font-medium rounded-md hover:bg-[#333] disabled:opacity-50 transition-colors"
              >
                {callBusy ? 'Starting call…' : 'Call'}
              </button>
              {callMsg && (
                <p className="text-[11px] text-[#6b6b6b] mt-1.5">{callMsg}</p>
              )}
              <CallHistoryPanel key={callSeq} leadId={lead.id} />
            </div>
          </Section>

          {/* STATUS & OWNERSHIP */}
          <Section title="Status & Ownership">
            {/* Lead Status dropdown */}
            <div className="flex items-start gap-2 py-2 border-b border-[#f5f5f5]">
              <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-0.5">Lead Status</span>
              <div className="flex-1 min-w-0">
                <select
                  value={lead.lead_status || lead.stage || ''}
                  onChange={e => saveLeadStatus(e.target.value)}
                  className="w-full text-sm border border-[#e5e5e5] rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
                >
                  <option value="">— Select —</option>
                  {dbStatuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Temperature pills */}
            <div className="flex items-start gap-2 py-2 border-b border-[#f5f5f5]">
              <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-1">Temperature</span>
              <div className="flex gap-1">
                {(['Hot', 'Warm', 'Cold'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => saveTemperature(t)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      lead.temperature === t
                        ? t === 'Hot' ? 'bg-red-100 text-red-700' : t === 'Warm' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                        : 'bg-[#f5f5f5] text-[#6b6b6b] hover:bg-[#ebebeb]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Assigned To */}
            <div className="flex items-start gap-2 py-2 border-b border-[#f5f5f5]">
              <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-0.5">Assigned To</span>
              <AssignedToField value={lead.assigned_to} onSave={saveAssignedTo} />
            </div>

            {/* Created By (read-only) */}
            <div className="flex items-start gap-2 py-2">
              <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-0.5">Created By</span>
              <span className="text-sm text-[#6b6b6b]">{userName}</span>
            </div>
          </Section>

          {/* PROJECTED OFFER BUTTON + OFFERS BUTTON */}
          {(() => {
            const po = projectedOffer;
            const rsColor = !po ? '#9b9b9b' : po.riskScore >= 70 ? '#15803d' : po.riskScore >= 50 ? '#a16207' : '#b91c1c';
            return (
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => setShowProjectedOffer(v => !v)}
                    className="flex-1 px-3 py-1.5 bg-[#1a1a1a] text-white text-xs font-medium rounded-md hover:bg-[#333] transition-colors flex items-center justify-between gap-1.5"
                  >
                    <span>Projected Offer</span>
                    <svg className={`w-3 h-3 transition-transform ${showProjectedOffer ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { setShowEmailModal(false); setShowOffersModal(true); }}
                    className="flex-1 px-3 py-1.5 bg-[#1a1a1a] text-white text-xs font-medium rounded-md hover:bg-[#333] transition-colors text-center"
                  >
                    Offers
                  </button>
                </div>

                {showProjectedOffer && (
                  <div className="mt-2 bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
                    {!po ? (
                      <p className="text-xs text-[#9b9b9b] text-center py-3 px-4">Enter Avg Monthly Revenue to generate a projection.</p>
                    ) : (
                      <div className="divide-y divide-[#f0f0f0]">
                        <div className="flex justify-between items-center px-4 py-2.5">
                          <span className="text-xs text-[#9b9b9b]">Max Approved</span>
                          <span className="text-sm font-bold text-[#1a1a1a]">${po.maxApproved.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2.5">
                          <span className="text-xs text-[#9b9b9b]">Factor Rate</span>
                          <span className="text-sm font-semibold text-[#1a1a1a]">{po.factorRate.toFixed(2)}x</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2.5">
                          <span className="text-xs text-[#9b9b9b]">Risk Score</span>
                          <span className="text-sm font-semibold" style={{ color: rsColor }}>{po.riskScore} / 100</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2.5">
                          <span className="text-xs text-[#9b9b9b]">Est. Weekly Payback</span>
                          <span className="text-sm font-semibold text-[#1a1a1a]">${po.weeklyPayback.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2.5">
                          <span className="text-xs text-[#9b9b9b]">Holdback %</span>
                          <span className="text-sm font-semibold text-[#1a1a1a]">{po.holdback}%</span>
                        </div>
                        <div className="px-4 py-2 bg-[#fafafa]">
                          <p className="text-[10px] text-[#9b9b9b]">Projection only — based on lead financials.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── UNDERWRITING SUITE — hidden from view, kept dormant so the
           Offers overlay (position:fixed) still works when triggered.
           Do NOT add transform/filter to this wrapper or fixed children break.
           NOTE: no pointer-events-none here — the in-flow content is already
           unclickable (0x0 + overflow-hidden), and the fixed overlays
           (Offers panel, Pitch modal, Client Portal) must stay clickable. ── */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <div className="absolute -left-[9999px] -top-[9999px] overflow-hidden w-0 h-0">
        <UnderwritingSuite
          leadId={lead.id}
          leadName={lead.name}
          businessName={lead.company}
          phone={lead.phone}
          leadNotes={lead.notes}
          initialData={lead.underwriting_data as any}
          onClose={() => {}}
          onSave={handleUnderwritingSave as any}
          onNotesUpdate={async (n: string) => { await saveField('notes', n); setNotes(n); }}
          inline
          offersAsModal
          showOffersModal={showOffersModal}
          onCloseOffersModal={() => setShowOffersModal(false)}
        />
      </div>

      {/* ── DOCUMENTS MODAL ──────────────────────────────────────────────── */}
      {showDocsModal && (
        <DocumentsModal
          leadId={lead.id}
          leadName={lead.name}
          leadCompany={lead.company}
          onApplyParsed={applyParsedApp}
          onAnalyze={analyzeBankAttachment}
          onClose={() => setShowDocsModal(false)}
        />
      )}

      {/* ── SCHEDULE EMAIL MODAL ─────────────────────────────────────────── */}
      {showEmailModal && (
        <ScheduleEmailModal
          lead={{
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            underwriting_data: lead.underwriting_data,
          }}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {/* ── SEND TO LENDER MODAL ─────────────────────────────────────────── */}
      {showSendModal && (
        <SendToLenderModal
          leadId={lead.id}
          leadName={lead.name}
          leadCompany={lead.company}
          leadValue={lead.value ?? null}
          leadStatus={lead.lead_status || lead.stage || undefined}
          userName={userName}
          criteria={{
            timeInBusiness:    derivedTIB ?? Number(ud.timeInBusiness ?? 0),
            creditScore:       Number(ud.creditScore     ?? 0),
            avgMonthlyRevenue: Number(ud.monthlyRevenue  ?? 0),
            currentPositions:  ud.hasOtherMCALoans ? Number(ud.mcaPositionCount ?? 1) : 0,
            businessState:     String(ud.businessState   ?? ''),
            industry:          String(ud.industry        ?? ''),
            nsfCount:          Number(ud.nsfCount        ?? 0),
            depositsCount:     Number(ud.depositsCount   ?? 0),
            isSoleProp:        Boolean(ud.isSoleProp     ?? false),
          }}
          onClose={() => setShowSendModal(false)}
        />
      )}

      {/* ── FINANCIALS MODAL ─────────────────────────────────────────────── */}
      {showFinancials && (
        <FinancialsModal
          snap={(ud.bankStatementAnalysis as BankSnap) ?? undefined}
          ud={ud}
          leadName={lead.name}
          leadCompany={lead.company}
          derivedTIB={derivedTIB}
          onSaveField={(k, v) => saveField(k, v)}
          onClose={() => setShowFinancials(false)}
        />
      )}

      {/* ── DELETE CONFIRM MODAL ──────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-[#1a1a1a] mb-2">Delete Lead?</h3>
            <p className="text-sm text-[#6b6b6b] mb-4">
              <span className="font-medium text-[#1a1a1a]">{lead.company || lead.name}</span> will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-4 py-2.5 border border-[#e5e5e5] rounded-lg text-sm text-[#6b6b6b] hover:bg-[#f5f5f5]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assigned To inline editable ───────────────────────────────────────────────
function AssignedToField({ value, onSave }: { value: string | null | undefined; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value || '');
  const [saving, setSaving]   = useState(false);

  const save = async () => {
    setSaving(true);
    try { await onSave(val); } finally { setSaving(false); setEditing(false); }
  };

  if (editing) {
    return (
      <div className="flex gap-1 flex-1">
        <input
          type="text"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          className="flex-1 px-2 py-0.5 text-sm border border-[#e5e5e5] rounded focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
        />
        {saving && <span className="text-xs text-[#9b9b9b] pt-1">…</span>}
      </div>
    );
  }
  return (
    <span
      onClick={() => { setVal(value || ''); setEditing(true); }}
      className="text-sm text-[#1a1a1a] cursor-pointer hover:underline underline-offset-2 decoration-dotted"
    >
      {value || <span className="text-[#9b9b9b] italic">Unassigned</span>}
    </span>
  );
}
