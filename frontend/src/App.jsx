import React, { useState, useEffect } from 'react';
import {
  Search, Building, ChevronLeft, ChevronRight, MapPin,
  Users, Mail, Shield, ShieldAlert, Gavel, Calendar, X,
  UserCheck, Plus, Trash2, BookOpen, FileText, Clock,
  CheckCircle2, ListChecks, IndianRupee
} from 'lucide-react';

const API_BASE = "http://localhost:8000/api";

const ACCOUNT_HEADS = [
  { key: 'account1', label: 'A/c 1 (PF Contribution)' },
  { key: 'account2', label: 'A/c 2 (EPF Admin Charges)' },
  { key: 'account10', label: 'A/c 10 (Pension - EPS)' },
  { key: 'account21', label: 'A/c 21 (EDLI)' },
  { key: 'account22', label: 'A/c 22 (EDLI Admin Charges)' },
];

function fmtMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export default function App() {
  const [stats, setStats] = useState({ active_7a_cases: 0, hearings_today: 0, total_amount_assessed: 0, redbook_defaulters: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Navigation Tabs: 'search' | 'bluebook' | 'active_7a' | 'hearings_today' | 'redbook'
  const [activeTab, setActiveTab] = useState('search');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEst, setSelectedEst] = useState(null);

  // Inquiry Officers State
  const [officers, setOfficers] = useState([
    { id: 1, name: 'Shri A. K. Sahoo', designation: 'RPFC-II' },
    { id: 2, name: 'Smt. P. Mohanty', designation: 'APFC' },
    { id: 3, name: 'Shri R. N. Dash', designation: 'APFC' },
    { id: 4, name: 'Shri B. B. Rout', designation: 'Recovery Officer' }
  ]);
  const [showOfficerModal, setShowOfficerModal] = useState(false);
  const [newOfficer, setNewOfficer] = useState({ name: '', designation: 'APFC' });

  // Modal State for Inquiry Initiation
  const [showModal, setShowModal] = useState(false);
  const [inquiryFormData, setInquiryFormData] = useState({
    inquiry_section: '7A',
    assessing_officer: '',
    period_from: '',
    period_to: '',
    first_hearing_date: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Case Detail (hearing history) Modal
  const [selectedCase, setSelectedCase] = useState(null);
  const [caseHearings, setCaseHearings] = useState([]);
  const [loadingHearings, setLoadingHearings] = useState(false);

  // Record Next Hearing Modal
  const [showHearingModal, setShowHearingModal] = useState(false);
  const [hearingForm, setHearingForm] = useState({
    hearing_date: new Date().toISOString().split('T')[0],
    proceedings_summary: '',
    next_hearing_date: ''
  });
  const [isSubmittingHearing, setIsSubmittingHearing] = useState(false);

  // Finalize Order Modal
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [finalizeForm, setFinalizeForm] = useState({
    order_date: new Date().toISOString().split('T')[0],
    account1: 0, account2: 0, account10: 0, account21: 0, account22: 0
  });
  const [isFinalizing, setIsFinalizing] = useState(false);

  const isCaseTab = ['bluebook', 'active_7a', 'hearings_today'].includes(activeTab);

  // Initial Fetch & Fetch on Page/Limit/Tab Change
  useEffect(() => {
    fetchEstablishments(searchTerm, page, limit, activeTab);
    fetchStats();
  }, [page, limit, activeTab]);

  // Debounced Search Input Change
  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => {
      fetchEstablishments(searchTerm, 1, limit, activeTab);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchEstablishments = async (query, p, l, tab) => {
    setIsLoading(true);
    try {
      let endpoint = `${API_BASE}/establishments/search?q=${encodeURIComponent(query)}&page=${p}&limit=${l}`;

      if (tab === 'bluebook') {
        endpoint = `${API_BASE}/bluebook?q=${encodeURIComponent(query)}&page=${p}&limit=${l}`;
      } else if (tab === 'redbook') {
        endpoint = `${API_BASE}/redbook?q=${encodeURIComponent(query)}&page=${p}&limit=${l}`;
      } else if (tab === 'active_7a') {
        endpoint = `${API_BASE}/7a/active?q=${encodeURIComponent(query)}&page=${p}&limit=${l}`;
      } else if (tab === 'hearings_today') {
        endpoint = `${API_BASE}/hearings/today?q=${encodeURIComponent(query)}&page=${p}&limit=${l}`;
      }

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        setSearchResults(data);
        setTotalRecords(data.length);
      } else if (data && data.data) {
        setSearchResults(data.data);
        setTotalRecords(data.total || data.data.length);
      } else {
        setSearchResults([]);
        setTotalRecords(0);
      }
    } catch (err) {
      console.error("Fetch Error:", err);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = () => {
    fetch(`${API_BASE}/dashboard/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(console.error);
  };

  const refreshCurrentView = () => {
    fetchEstablishments(searchTerm, page, limit, activeTab);
    fetchStats();
  };

  const handleAddOfficer = (e) => {
    e.preventDefault();
    if (!newOfficer.name.trim()) return;
    const added = {
      id: Date.now(),
      name: newOfficer.name.trim(),
      designation: newOfficer.designation
    };
    setOfficers([...officers, added]);
    setNewOfficer({ name: '', designation: 'APFC' });
  };

  const handleDeleteOfficer = (id) => {
    setOfficers(officers.filter(o => o.id !== id));
  };

  const handleInitiateSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEst) return;

    setIsSubmitting(true);
    try {
      const payload = {
        est_id: selectedEst.EST_ID,
        ...inquiryFormData
      };

      const res = await fetch(`${API_BASE}/7a/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        alert(`🎉 Inquiry Under Section ${inquiryFormData.inquiry_section} successfully initiated!\nCase No: ${result.case_no}`);
        setShowModal(false);
        setInquiryFormData({
          inquiry_section: '7A',
          assessing_officer: '',
          period_from: '',
          period_to: '',
          first_hearing_date: ''
        });
        fetchStats();
      } else {
        const errData = await res.json();
        alert(`Error initiating inquiry: ${errData.detail || 'Failed to submit'}`);
      }
    } catch (err) {
      console.error("Initiation error:", err);
      alert("Failed to connect to backend server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Case Detail (hearing history) ---
  const openCaseDetail = async (c) => {
    setSelectedCase(c);
    setLoadingHearings(true);
    setCaseHearings([]);
    try {
      const res = await fetch(`${API_BASE}/cases/hearings?case_no=${encodeURIComponent(c.case_no)}`);
      const data = await res.json();
      setCaseHearings(data.data || []);
    } catch (err) {
      console.error("Hearing history fetch error:", err);
    } finally {
      setLoadingHearings(false);
    }
  };

  const closeCaseDetail = () => {
    setSelectedCase(null);
    setCaseHearings([]);
  };

  const openHearingModal = () => {
    setHearingForm({
      hearing_date: new Date().toISOString().split('T')[0],
      proceedings_summary: '',
      next_hearing_date: ''
    });
    setShowHearingModal(true);
  };

  const submitHearing = async (e) => {
    e.preventDefault();
    if (!selectedCase) return;
    setIsSubmittingHearing(true);
    try {
      const res = await fetch(`${API_BASE}/7a/hearing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_no: selectedCase.case_no, ...hearingForm })
      });
      if (res.ok) {
        setShowHearingModal(false);
        await openCaseDetail(selectedCase);
        refreshCurrentView();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to record hearing'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend server.");
    } finally {
      setIsSubmittingHearing(false);
    }
  };

  const openFinalizeModal = () => {
    setFinalizeForm({
      order_date: new Date().toISOString().split('T')[0],
      account1: 0, account2: 0, account10: 0, account21: 0, account22: 0
    });
    setShowFinalizeModal(true);
  };

  const finalizeTotal = ACCOUNT_HEADS.reduce((sum, h) => sum + (parseFloat(finalizeForm[h.key]) || 0), 0);

  const submitFinalize = async (e) => {
    e.preventDefault();
    if (!selectedCase) return;
    setIsFinalizing(true);
    try {
      const payload = {
        case_no: selectedCase.case_no,
        order_date: finalizeForm.order_date,
        account1: parseFloat(finalizeForm.account1) || 0,
        account2: parseFloat(finalizeForm.account2) || 0,
        account10: parseFloat(finalizeForm.account10) || 0,
        account21: parseFloat(finalizeForm.account21) || 0,
        account22: parseFloat(finalizeForm.account22) || 0,
      };
      const res = await fetch(`${API_BASE}/7a/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        alert(`✅ Final Order Issued!\nTotal Assessed: ₹${fmtMoney(data.total_assessed)}\nCase transferred to Red Book.`);
        setShowFinalizeModal(false);
        closeCaseDetail();
        setActiveTab('redbook');
        setPage(1);
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to finalize order'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend server.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const totalPages = Math.ceil(totalRecords / limit) || 1;

  const switchTab = (tab) => {
    setActiveTab(tab);
    setPage(1);
    setSearchTerm('');
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 font-sans">
      {/* HEADER WITH NAV BUTTONS */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <span className="bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">EPFO RO Bhubaneswar</span>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">Section Inquiry & Recovery Portal</h1>
        </div>

        {/* TOP NAVIGATION BUTTONS */}
        <div className="mt-4 md:mt-0 flex flex-wrap gap-2">
          <button
            onClick={() => setShowOfficerModal(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 border border-slate-300">
            <UserCheck size={15} className="text-blue-600" /> Inquiry Officers
          </button>

          <button
            onClick={() => switchTab('search')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${activeTab === 'search' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            <Search size={15} /> Master Search
          </button>

          <button
            onClick={() => switchTab('bluebook')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${activeTab === 'bluebook' ? 'bg-blue-700 text-white shadow' : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'}`}>
            <FileText size={15} /> Blue Book
          </button>

          <button
            onClick={() => switchTab('redbook')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${activeTab === 'redbook' ? 'bg-rose-600 text-white shadow' : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'}`}>
            <BookOpen size={15} /> Red Book (Defaulters)
          </button>
        </div>
      </header>

      {/* DASHBOARD STATS - ALL CLICKABLE */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div
          onClick={() => switchTab('active_7a')}
          className={`cursor-pointer border p-4 rounded-xl flex items-center justify-between transition ${activeTab === 'active_7a' ? 'bg-blue-100 border-blue-400 ring-2 ring-blue-500' : 'bg-blue-50/50 border-blue-100 hover:bg-blue-100/50'}`}>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Active Inquiries</p>
            <p className="text-2xl font-black text-slate-800">{stats.active_7a_cases || 0}</p>
          </div>
          <Building className="text-blue-600" size={24} />
        </div>

        <div
          onClick={() => switchTab('hearings_today')}
          className={`cursor-pointer border p-4 rounded-xl flex items-center justify-between transition ${activeTab === 'hearings_today' ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-500' : 'bg-amber-50/50 border-amber-100 hover:bg-amber-100/50'}`}>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Hearings Scheduled</p>
            <p className="text-2xl font-black text-slate-800">{stats.hearings_today || 0}</p>
          </div>
          <Shield className="text-amber-600" size={24} />
        </div>

        <div
          onClick={() => switchTab('redbook')}
          className={`cursor-pointer border p-4 rounded-xl flex items-center justify-between transition ${activeTab === 'redbook' ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-500' : 'bg-emerald-50/50 border-emerald-100 hover:bg-emerald-100/50'}`}>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Assessed Dues</p>
            <p className="text-2xl font-black text-slate-800">₹ {fmtMoney(stats.total_amount_assessed)}</p>
          </div>
          <IndianRupee className="text-emerald-600" size={24} />
        </div>

        <div
          onClick={() => switchTab('redbook')}
          className={`cursor-pointer border p-4 rounded-xl flex items-center justify-between transition ${activeTab === 'redbook' ? 'bg-rose-100 border-rose-400 ring-2 ring-rose-500' : 'bg-rose-50/50 border-rose-100 hover:bg-rose-100/50'}`}>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Defaulters (Redbook)</p>
            <p className="text-2xl font-black text-slate-800">{stats.redbook_defaulters || 0}</p>
          </div>
          <ShieldAlert className="text-rose-600" size={24} />
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: MASTER SEARCH & TABLE */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {activeTab === 'bluebook' && <FileText size={20} className="text-blue-600" />}
              {activeTab === 'redbook' && <BookOpen size={20} className="text-rose-600" />}
              {activeTab === 'search' && <Search size={20} className="text-blue-600" />}
              {activeTab === 'active_7a' && <Gavel size={20} className="text-blue-600" />}
              {activeTab === 'hearings_today' && <Clock size={20} className="text-amber-600" />}

              {activeTab === 'bluebook' && 'Blue Book Records Directory'}
              {activeTab === 'redbook' && 'Red Book Defaulters Directory'}
              {activeTab === 'search' && 'Real-time Establishment Finder'}
              {activeTab === 'active_7a' && 'Active Inquiry Cases'}
              {activeTab === 'hearings_today' && "Today's Scheduled Hearings"}
            </h2>

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span>Display per page:</span>
              {[10, 20, 50, 100].map((l) => (
                <button
                  key={l}
                  onClick={() => { setLimit(l); setPage(1); }}
                  className={`px-2.5 py-1 rounded-lg border transition ${limit === l ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Type Est. Code (e.g. ORBBS...), Company Name, PAN, or Case No..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-10 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
            )}
          </div>

          {/* TABLE CONTAINER */}
          {isLoading ? (
            <div className="text-center py-16 text-slate-400 font-medium">Loading Data...</div>
          ) : searchResults.length > 0 ? (
            <>
              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[550px] overflow-y-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  {/* ---- CASE-BASED TABS: bluebook / active_7a / hearings_today ---- */}
                  {isCaseTab ? (
                    <>
                      <thead className="sticky top-0 bg-slate-100 text-xs font-semibold text-slate-600 uppercase">
                        <tr>
                          <th className="p-3">Case No</th>
                          <th className="p-3">Establishment</th>
                          <th className="p-3">Section</th>
                          <th className="p-3">Officer</th>
                          <th className="p-3">Period</th>
                          <th className="p-3 text-center">Hearing No.</th>
                          <th className="p-3">Next Date of Hearing</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-100">
                        {searchResults.map((c) => (
                          <tr
                            key={c.case_no}
                            onClick={() => openCaseDetail(c)}
                            className="cursor-pointer hover:bg-blue-50/60 transition">
                            <td className="p-3 font-mono font-bold text-blue-600 whitespace-nowrap">{c.case_no}</td>
                            <td className="p-3 font-semibold text-slate-800">{c.EST_NAME || 'N/A'}<span className="block text-[10px] font-mono text-slate-400">{c.est_id}</span></td>
                            <td className="p-3">
                              <span className="bg-indigo-50 border border-indigo-200 text-indigo-600 px-2 py-0.5 rounded-md font-bold">{c.inquiry_section || '7A'}</span>
                            </td>
                            <td className="p-3 text-slate-600">{c.assessing_officer}</td>
                            <td className="p-3 text-slate-500">{c.period_from} to {c.period_to}</td>
                            <td className="p-3 text-center font-bold text-slate-700">{c.hearing_count || 1}</td>
                            <td className="p-3 font-semibold text-amber-600">{c.current_ndh || 'N/A'}</td>
                            <td className="p-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${c.status === 'CONCLUDED' ? 'bg-slate-200 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={(e) => { e.stopPropagation(); openCaseDetail(c); }}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ml-auto">
                                <ListChecks size={13} /> View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : activeTab === 'redbook' ? (
                    /* ---- RED BOOK TAB ---- */
                    <>
                      <thead className="sticky top-0 bg-slate-100 text-xs font-semibold text-slate-600 uppercase">
                        <tr>
                          <th className="p-3">Case / Est</th>
                          <th className="p-3">Section</th>
                          <th className="p-3">Officer</th>
                          <th className="p-3">Period</th>
                          <th className="p-3">Order Date</th>
                          <th className="p-3 text-right">A/c 1</th>
                          <th className="p-3 text-right">A/c 2</th>
                          <th className="p-3 text-right">A/c 10</th>
                          <th className="p-3 text-right">A/c 21</th>
                          <th className="p-3 text-right">A/c 22</th>
                          <th className="p-3 text-right">Total Dues</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-100">
                        {searchResults.map((r) => (
                          <tr key={r.case_no} className="hover:bg-rose-50/30">
                            <td className="p-3">
                              <span className="font-mono font-bold text-slate-800 block">{r.case_no}</span>
                              <span className="text-[10px] text-slate-500">{r.EST_NAME || 'N/A'}</span>
                              <span className="block text-[10px] font-mono text-slate-400">{r.est_id}</span>
                            </td>
                            <td className="p-3">
                              <span className="bg-indigo-50 border border-indigo-200 text-indigo-600 px-2 py-0.5 rounded-md font-bold">{r.inquiry_section || '7A'}</span>
                            </td>
                            <td className="p-3 text-slate-600">{r.assessing_officer}</td>
                            <td className="p-3 text-slate-500">{r.period_from} to {r.period_to}</td>
                            <td className="p-3 font-semibold text-slate-700">{r.order_date}</td>
                            <td className="p-3 text-right font-mono">₹{fmtMoney(r.account1)}</td>
                            <td className="p-3 text-right font-mono">₹{fmtMoney(r.account2)}</td>
                            <td className="p-3 text-right font-mono">₹{fmtMoney(r.account10)}</td>
                            <td className="p-3 text-right font-mono">₹{fmtMoney(r.account21)}</td>
                            <td className="p-3 text-right font-mono">₹{fmtMoney(r.account22)}</td>
                            <td className="p-3 text-right font-mono font-bold text-rose-700 text-sm">₹{fmtMoney(r.total_assessed)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : (
                    /* ---- SEARCH TAB (ESTABLISHMENT MASTER) ---- */
                    <>
                      <thead className="sticky top-0 bg-slate-100 text-xs font-semibold text-slate-600 uppercase">
                        <tr>
                          <th className="p-3">Est Code</th>
                          <th className="p-3">Establishment Name</th>
                          <th className="p-3">Address 1 & 2</th>
                          <th className="p-3">City</th>
                          <th className="p-3 text-center">No of UAN</th>
                          <th className="p-3">Email ID</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-100">
                        {searchResults.map((est) => (
                          <tr
                            key={est.EST_ID}
                            onClick={() => setSelectedEst(est)}
                            className={`cursor-pointer transition hover:bg-blue-50/60 ${selectedEst?.EST_ID === est.EST_ID ? 'bg-blue-50 border-l-4 border-blue-600' : ''}`}>
                            <td className="p-3 font-mono font-bold text-blue-600 whitespace-nowrap">{est.EST_ID}</td>
                            <td className="p-3 font-semibold text-slate-800">{est.EST_NAME}</td>
                            <td className="p-3 text-slate-600 max-w-[180px] truncate">
                              {est.ADDRESS1} {est.ADDRESS2}
                            </td>
                            <td className="p-3 font-semibold text-slate-700">{est.CITY}</td>
                            <td className="p-3 text-center font-bold text-slate-700">{est.NO_OF_UAN}</td>
                            <td className="p-3 font-mono text-slate-500 text-[11px] max-w-[140px] truncate">{est.PRIMARY_EMAIL || 'N/A'}</td>
                            <td className="p-3 text-right">
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedEst(est); }}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold">
                                Select
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </table>
              </div>

              {/* PAGINATION CONTROLS */}
              <div className="flex flex-col sm:flex-row justify-between items-center mt-4 pt-2 text-xs text-slate-500">
                <p>Showing <strong>{(page - 1) * limit + 1}</strong> to <strong>{Math.min(page * limit, totalRecords)}</strong> of <strong>{totalRecords}</strong> records</p>
                <div className="flex items-center gap-2 mt-2 sm:mt-0">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-100">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-semibold text-slate-700">Page {page} of {totalPages}</span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-100">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
              No records found for this category.
            </div>
          )}
        </div>

        {/* RIGHT: ESTABLISHMENT PROFILE (only relevant on search tab) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
          <h3 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b flex items-center gap-2">
            <Building size={18} className="text-blue-600" /> Establishment Profile
          </h3>
          {selectedEst ? (
            <div className="space-y-4 text-xs">
              <div>
                <span className="text-slate-400 font-semibold uppercase block">Est Code</span>
                <p className="font-mono text-base font-bold text-blue-600">{selectedEst.EST_ID}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase block">Establishment Name</span>
                <p className="font-bold text-slate-800 text-sm">{selectedEst.EST_NAME}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-slate-400 font-semibold uppercase flex items-center gap-1">
                  <MapPin size={12} /> Address
                </span>
                <p className="text-slate-700">{selectedEst.ADDRESS1}</p>
                {selectedEst.ADDRESS2 && <p className="text-slate-700">{selectedEst.ADDRESS2}</p>}
                <p className="font-semibold text-slate-800">{selectedEst.CITY}, {selectedEst.DISTRICT_NAME}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-xl">
                  <span className="text-slate-400 font-semibold uppercase flex items-center gap-1">
                    <Users size={12} /> No of UAN
                  </span>
                  <p className="text-sm font-extrabold text-blue-700 mt-0.5">{selectedEst.NO_OF_UAN}</p>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-slate-400 font-semibold uppercase flex items-center gap-1">
                    <Shield size={12} /> PAN
                  </span>
                  <p className="font-mono font-bold text-slate-700 mt-0.5">{selectedEst.PAN || 'N/A'}</p>
                </div>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase flex items-center gap-1 mb-0.5">
                  <Mail size={12} /> Primary Email ID
                </span>
                <p className="font-mono text-slate-700">{selectedEst.PRIMARY_EMAIL || 'N/A'}</p>
              </div>

              {/* INITIATE INQUIRY BUTTON */}
              <div className="pt-4 border-t border-slate-100 mt-4">
                <button
                  onClick={() => setShowModal(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 transition">
                  <Gavel size={16} /> Initiate Inquiry
                </button>
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-12 text-sm">Click on any establishment to select and view details.</p>
          )}
        </div>
      </div>

      {/* MODAL 1: INQUIRY OFFICERS MANAGEMENT */}
      {showOfficerModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 relative">
            <button
              onClick={() => setShowOfficerModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-100 text-blue-600 p-2.5 rounded-xl">
                <UserCheck size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Inquiry Officers Directory</h3>
                <p className="text-xs text-slate-500">Manage officers and designations for inquiries</p>
              </div>
            </div>

            {/* Add New Officer Form */}
            <form onSubmit={handleAddOfficer} className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4 flex gap-2 text-xs">
              <input
                type="text"
                placeholder="Officer Name (e.g. Shri A. Sharma)"
                value={newOfficer.name}
                onChange={(e) => setNewOfficer({ ...newOfficer, name: e.target.value })}
                className="flex-1 p-2 border border-slate-300 rounded-lg outline-none font-medium"
                required
              />
              <select
                value={newOfficer.designation}
                onChange={(e) => setNewOfficer({ ...newOfficer, designation: e.target.value })}
                className="p-2 border border-slate-300 rounded-lg outline-none font-semibold bg-white">
                <option value="APFC">APFC</option>
                <option value="RPFC-II">RPFC-II</option>
                <option value="RPFC-I">RPFC-I</option>
                <option value="Recovery Officer">Recovery Officer</option>
              </select>
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-1">
                <Plus size={14} /> Add
              </button>
            </form>

            {/* Officers List */}
            <div className="max-h-60 overflow-y-auto space-y-2 text-xs">
              {officers.map((officer) => (
                <div key={officer.id} className="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-xl">
                  <div>
                    <p className="font-bold text-slate-800">{officer.name}</p>
                    <p className="text-slate-500 text-[11px] font-semibold">{officer.designation}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteOfficer(officer.id)}
                    className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: INQUIRY INITIATION */}
      {showModal && selectedEst && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-100 text-blue-600 p-2.5 rounded-xl">
                <Gavel size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Initiate Inquiry</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedEst.EST_ID} - {selectedEst.EST_NAME}</p>
              </div>
            </div>

            <form onSubmit={handleInitiateSubmit} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-600 mb-1">Inquiry Under Section</label>
                <select
                  required
                  value={inquiryFormData.inquiry_section}
                  onChange={(e) => setInquiryFormData({ ...inquiryFormData, inquiry_section: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold bg-white text-blue-700">
                  <option value="7A">7A</option>
                  <option value="7B">7B</option>
                  <option value="14B">14B</option>
                  <option value="7Q">7Q</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Select Assessing Officer & Designation</label>
                <select
                  required
                  value={inquiryFormData.assessing_officer}
                  onChange={(e) => setInquiryFormData({ ...inquiryFormData, assessing_officer: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold bg-white text-slate-700">
                  <option value="">-- Choose Inquiry Officer --</option>
                  {officers.map((off) => (
                    <option key={off.id} value={`${off.name} (${off.designation})`}>
                      {off.name} - [{off.designation}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 flex items-center gap-1">
                    <Calendar size={13} className="text-blue-600" /> Inquiry Period (From)
                  </label>
                  <input
                    type="date"
                    required
                    value={inquiryFormData.period_from}
                    onChange={(e) => setInquiryFormData({ ...inquiryFormData, period_from: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 flex items-center gap-1">
                    <Calendar size={13} className="text-blue-600" /> Inquiry Period (To)
                  </label>
                  <input
                    type="date"
                    required
                    value={inquiryFormData.period_to}
                    onChange={(e) => setInquiryFormData({ ...inquiryFormData, period_to: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 flex items-center gap-1">
                  <Calendar size={13} className="text-amber-600" /> First Hearing Date (NDH)
                </label>
                <input
                  type="date"
                  required
                  value={inquiryFormData.first_hearing_date}
                  onChange={(e) => setInquiryFormData({ ...inquiryFormData, first_hearing_date: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm disabled:opacity-50">
                  {isSubmitting ? 'Initiating...' : 'Submit Inquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CASE DETAIL - LINE-BY-LINE HEARING HISTORY */}
      {selectedCase && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={closeCaseDetail}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-2">
              <div className="bg-blue-100 text-blue-600 p-2.5 rounded-xl">
                <Gavel size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 font-mono">{selectedCase.case_no}</h3>
                <p className="text-xs text-slate-500">{selectedCase.EST_NAME || 'N/A'} ({selectedCase.est_id})</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 my-4 text-xs">
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2">
                <span className="text-slate-400 font-semibold uppercase block">Section</span>
                <span className="font-bold text-indigo-600">{selectedCase.inquiry_section || '7A'}</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2">
                <span className="text-slate-400 font-semibold uppercase block">Officer</span>
                <span className="font-semibold text-slate-700">{selectedCase.assessing_officer}</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2">
                <span className="text-slate-400 font-semibold uppercase block">Status</span>
                <span className={`font-bold ${selectedCase.status === 'CONCLUDED' ? 'text-slate-500' : 'text-blue-600'}`}>{selectedCase.status}</span>
              </div>
            </div>

            <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <ListChecks size={16} className="text-blue-600" /> Hearing History (Blue Book Register)
            </h4>

            {loadingHearings ? (
              <div className="text-center py-8 text-slate-400 text-sm">Loading hearing history...</div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold uppercase">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">Hearing Date</th>
                      <th className="p-2.5">Proceedings</th>
                      <th className="p-2.5">Next Hearing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {caseHearings.length === 0 ? (
                      <tr><td colSpan={4} className="p-4 text-center text-slate-400">No hearings recorded yet.</td></tr>
                    ) : caseHearings.map((h) => (
                      <tr key={h.log_id}>
                        <td className="p-2.5 font-bold text-blue-600">{h.hearing_no}</td>
                        <td className="p-2.5 font-semibold text-slate-700 whitespace-nowrap">{h.hearing_date}</td>
                        <td className="p-2.5 text-slate-600">{h.proceedings_summary}</td>
                        <td className="p-2.5 font-semibold text-amber-600 whitespace-nowrap">{h.next_hearing_date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedCase.status !== 'CONCLUDED' && (
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={openHearingModal}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 transition text-sm">
                  <Clock size={16} /> Record Next Hearing
                </button>
                <button
                  onClick={openFinalizeModal}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 transition text-sm">
                  <CheckCircle2 size={16} /> Finalize & Issue Order
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4: RECORD NEXT HEARING */}
      {showHearingModal && selectedCase && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 relative">
            <button
              onClick={() => setShowHearingModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-amber-100 text-amber-600 p-2.5 rounded-xl">
                <Clock size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Record Hearing #{(selectedCase.hearing_count || 1) + 1}</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedCase.case_no}</p>
              </div>
            </div>

            <form onSubmit={submitHearing} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-600 mb-1">Hearing Date</label>
                <input
                  type="date"
                  required
                  value={hearingForm.hearing_date}
                  onChange={(e) => setHearingForm({ ...hearingForm, hearing_date: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Proceedings Summary</label>
                <textarea
                  rows={3}
                  required
                  value={hearingForm.proceedings_summary}
                  onChange={(e) => setHearingForm({ ...hearingForm, proceedings_summary: e.target.value })}
                  placeholder="e.g. Employer requested time for filing balance sheet..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Next Date of Hearing (NDH)</label>
                <input
                  type="date"
                  value={hearingForm.next_hearing_date}
                  onChange={(e) => setHearingForm({ ...hearingForm, next_hearing_date: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-medium"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowHearingModal(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingHearing}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-sm disabled:opacity-50">
                  {isSubmittingHearing ? 'Saving...' : 'Save to Blue Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: FINALIZE ORDER - EPF ACCOUNT HEAD-WISE ASSESSMENT */}
      {showFinalizeModal && selectedCase && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 relative">
            <button
              onClick={() => setShowFinalizeModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-emerald-100 text-emerald-600 p-2.5 rounded-xl">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Issue Final Assessment Order</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedCase.case_no}</p>
              </div>
            </div>

            <form onSubmit={submitFinalize} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-600 mb-1">Order Date</label>
                <input
                  type="date"
                  required
                  value={finalizeForm.order_date}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, order_date: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                {ACCOUNT_HEADS.map((h) => (
                  <div key={h.key}>
                    <label className="block text-slate-600 mb-1">{h.label} (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={finalizeForm[h.key]}
                      onChange={(e) => setFinalizeForm({ ...finalizeForm, [h.key]: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                    />
                  </div>
                ))}
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
                <span className="text-slate-600 font-bold uppercase text-[11px]">Total Assessed Dues</span>
                <span className="text-emerald-700 font-black text-base">₹{fmtMoney(finalizeTotal)}</span>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowFinalizeModal(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isFinalizing}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm disabled:opacity-50">
                  {isFinalizing ? 'Issuing Order...' : 'Issue Order & Enter Red Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
