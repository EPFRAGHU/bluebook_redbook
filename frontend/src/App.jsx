import React, { useState, useEffect } from 'react';
import {
  Search, Building, ChevronLeft, ChevronRight, MapPin,
  Users, Mail, Shield, ShieldAlert, Gavel, Calendar, X,
  UserCheck, Plus, Trash2, BookOpen, FileText, Clock,
  CheckCircle2, ListChecks, IndianRupee, BarChart3,
  Stamp, Landmark, AlertTriangle, LogOut, Pencil, Download
} from 'lucide-react';
import { openPrintableReport } from './report';

const API_BASE = "/api";

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

  // Login State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('epfo_auth') === 'true';
  });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    setTimeout(() => {
      const { username, password } = loginForm;
      if (username.trim() === 'admin' && password === 'admin123') {
        localStorage.setItem('epfo_auth', 'true');
        setIsAuthenticated(true);
        setLoginForm({ username: '', password: '' });
      } else {
        setLoginError('Invalid username or password. Please try again.');
      }
      setIsLoggingIn(false);
    }, 400);
  };

  const handleLogout = () => {
    localStorage.removeItem('epfo_auth');
    setIsAuthenticated(false);
  };

  // Navigation Tabs: 'search' | 'bluebook' | 'active_7a' | 'hearings_today' | 'redbook' | 'dashboard'
  const [activeTab, setActiveTab] = useState('search');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEst, setSelectedEst] = useState(null);

  // Monthly Dashboard State
  const [monthlyData, setMonthlyData] = useState({ fy: '', months: [] });
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [fyYear, setFyYear] = useState(() => {
    const now = new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  });
  // Month-wise establishment breakdown (Added / Disposed) shown below the register
  const [monthlyDetailMonth, setMonthlyDetailMonth] = useState('');
  const [monthlyDetail, setMonthlyDetail] = useState({ month: '', added: [], disposed: [] });
  const [monthlyDetailLoading, setMonthlyDetailLoading] = useState(false);

  // Inquiry Officers State
  const [officers, setOfficers] = useState([
    { id: 1, name: 'Shri A. K. Sahoo', designation: 'RPFC-II' },
    { id: 2, name: 'Smt. P. Mohanty', designation: 'APFC' },
    { id: 3, name: 'Shri R. N. Dash', designation: 'APFC' },
    { id: 4, name: 'Shri B. B. Rout', designation: 'Recovery Officer' }
  ]);
  const [showOfficerModal, setShowOfficerModal] = useState(false);
  const [newOfficer, setNewOfficer] = useState({ name: '', designation: 'APFC' });

  // Area Enforcement Officers (AEO) - persisted in the database
  const [showAeoModal, setShowAeoModal] = useState(false);
  const [aeoList, setAeoList] = useState([]);
  const [newAeo, setNewAeo] = useState({ name: '', designation: 'AEO' });
  const [isSavingAeo, setIsSavingAeo] = useState(false);

  // Modal State for Inquiry Initiation
  const [showModal, setShowModal] = useState(false);
  const [inquiryFormData, setInquiryFormData] = useState({
    inquiry_section: '7A',
    assessing_officer: '',
    aeo: '',
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

  // Record Collection Modal
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [collectionCase, setCollectionCase] = useState(null);
  const [collectionForm, setCollectionForm] = useState({
    collection_date: new Date().toISOString().split('T')[0],
    mode: 'CHEQUE',
    instrument_no: '',
    account1: 0, account2: 0, account10: 0, account21: 0, account22: 0
  });
  const [isSubmittingCollection, setIsSubmittingCollection] = useState(false);

  // Edit Case Modal (Blue Book / Active Inquiries)
  const [showEditCaseModal, setShowEditCaseModal] = useState(false);
  const [editCase, setEditCase] = useState(null);
  const [editCaseForm, setEditCaseForm] = useState({
    inquiry_section: '7A', assessing_officer: '', aeo: '', period_from: '', period_to: '',
    current_ndh: '', status: 'ACTIVE'
  });
  const [isSavingCaseEdit, setIsSavingCaseEdit] = useState(false);

  // Edit Red Book Modal
  const [showEditRedbookModal, setShowEditRedbookModal] = useState(false);
  const [editRedbook, setEditRedbook] = useState(null);
  const [editRedbookForm, setEditRedbookForm] = useState({
    order_date: '', account1: 0, account2: 0, account10: 0, account21: 0, account22: 0
  });
  const [isSavingRedbookEdit, setIsSavingRedbookEdit] = useState(false);

  // Edit Collection Modal
  const [showEditCollectionModal, setShowEditCollectionModal] = useState(false);
  const [editCollection, setEditCollection] = useState(null);
  const [editCollectionForm, setEditCollectionForm] = useState({
    collection_date: '', mode: 'CHEQUE', instrument_no: '',
    account1: 0, account2: 0, account10: 0, account21: 0, account22: 0
  });
  const [isSavingCollectionEdit, setIsSavingCollectionEdit] = useState(false);

  // Case Tracking Flags (8F Issued / NIR / Bank A/c Attached)
  const [nirModalCase, setNirModalCase] = useState(null);
  const [showNirModal, setShowNirModal] = useState(false);
  const [nirForm, setNirForm] = useState({ nir_status: 'NIR', nir_cause: 'High Court', nir_case_no: '', nir_case_date: '' });
  const [isSavingNir, setIsSavingNir] = useState(false);

  // Collections Register State
  const [collectionsData, setCollectionsData] = useState({ data: [], total: 0 });
  const [monthlyCollections, setMonthlyCollections] = useState({ fy: '', months: [] });
  const [collectionMonth, setCollectionMonth] = useState('');
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsFy, setCollectionsFy] = useState(() => {
    const now = new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  });

  const isCaseTab = ['bluebook', 'active_7a', 'hearings_today'].includes(activeTab);
  const monthlyDetailLabel = (monthlyData.months.find(m => m.ym === monthlyDetailMonth)?.month) || monthlyDetailMonth;

  // Initial Fetch & Fetch on Page/Limit/Tab Change
  useEffect(() => {
    fetchEstablishments(searchTerm, page, limit, activeTab);
    fetchStats();
  }, [page, limit, activeTab]);

  // Load the Area Enforcement Officers directory once on mount
  useEffect(() => {
    fetchAeoList();
  }, []);

  // Debounced Search Input Change
  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => {
      fetchEstablishments(searchTerm, 1, limit, activeTab);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Monthly Dashboard load
  useEffect(() => {
    fetchMonthly(fyYear);
  }, [fyYear]);

  // When the register loads, keep the selected month if it is still in range,
  // otherwise default to the most recent month that had any activity.
  useEffect(() => {
    const months = monthlyData.months || [];
    if (!months.length) return;
    if (monthlyDetailMonth && months.some(m => m.ym === monthlyDetailMonth)) {
      fetchMonthlyDetail(monthlyDetailMonth);
      return;
    }
    const active = [...months].reverse().find(m => (m.added || 0) > 0 || (m.disposed || 0) > 0);
    const target = (active || months[months.length - 1]).ym;
    setMonthlyDetailMonth(target);
    fetchMonthlyDetail(target);
  }, [monthlyData]);

  // Collections Register load
  useEffect(() => {
    if (activeTab === 'collections') {
      fetchCollections(searchTerm, collectionMonth);
      fetchMonthlyCollections(collectionsFy);
    }
  }, [activeTab, collectionMonth, collectionsFy]);

  const fetchEstablishments = async (query, p, l, tab) => {
    setIsLoading(true);
    try {
      if (tab === 'search' && !query.trim()) {
        setSearchResults([]);
        setTotalRecords(0);
        setIsLoading(false);
        return;
      }
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

  const fetchAeoList = () => {
    fetch(`${API_BASE}/aeo`)
      .then(r => r.json())
      .then(data => setAeoList(data.data || []))
      .catch(console.error);
  };

  const aeoOptionLabel = (a) => (a.designation ? `${a.name} (${a.designation})` : a.name);

  // AEO to show in a list row: the case's chosen AEO, else the
  // establishment's jurisdictional AEO.
  const rowAeo = (row) => (row && (row.aeo || row.AEO)) || '—';

  const handleAddAeo = async (e) => {
    e.preventDefault();
    if (!newAeo.name.trim()) return;
    setIsSavingAeo(true);
    try {
      const res = await fetch(`${API_BASE}/aeo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAeo.name.trim(), designation: newAeo.designation.trim() })
      });
      if (res.ok) {
        setNewAeo({ name: '', designation: newAeo.designation });
        fetchAeoList();
      } else {
        const err = await res.json();
        alert(`Error: ${err.detail || 'Failed to add AEO'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to backend server.');
    } finally {
      setIsSavingAeo(false);
    }
  };

  const handleDeleteAeo = async (id) => {
    if (!window.confirm('Remove this Area Enforcement Officer from the directory?')) return;
    try {
      const res = await fetch(`${API_BASE}/aeo/${id}`, { method: 'DELETE' });
      if (res.ok) fetchAeoList();
      else alert('Failed to delete AEO');
    } catch (err) {
      console.error(err);
      alert('Failed to connect to backend server.');
    }
  };

  const fetchMonthly = (year) => {
    setMonthlyLoading(true);
    fetch(`${API_BASE}/dashboard/monthly?year=${year}`)
      .then(r => r.json())
      .then(data => setMonthlyData(data || { fy: '', months: [] }))
      .catch(err => {
        console.error("Monthly dashboard error:", err);
        setMonthlyData({ fy: '', months: [] });
      })
      .finally(() => setMonthlyLoading(false));
  };

  const fetchMonthlyDetail = (ym) => {
    if (!ym) return;
    setMonthlyDetailLoading(true);
    fetch(`${API_BASE}/dashboard/monthly/detail?month=${ym}`)
      .then(r => r.json())
      .then(data => setMonthlyDetail(data || { month: ym, added: [], disposed: [] }))
      .catch(err => {
        console.error("Monthly detail error:", err);
        setMonthlyDetail({ month: ym, added: [], disposed: [] });
      })
      .finally(() => setMonthlyDetailLoading(false));
  };

  const selectMonthDetail = (ym) => {
    setMonthlyDetailMonth(ym);
    fetchMonthlyDetail(ym);
  };

  const fetchCollections = (q, month) => {
    setCollectionsLoading(true);
    let url = `${API_BASE}/collections?q=${encodeURIComponent(q || '')}&page=1&limit=500`;
    if (month) url += `&month=${month}`;
    fetch(url)
      .then(r => r.json())
      .then(data => setCollectionsData(data || { data: [], total: 0 }))
      .catch(err => {
        console.error("Collections fetch error:", err);
        setCollectionsData({ data: [], total: 0 });
      })
      .finally(() => setCollectionsLoading(false));
  };

  const fetchMonthlyCollections = (year) => {
    fetch(`${API_BASE}/collections/monthly?year=${year}`)
      .then(r => r.json())
      .then(data => setMonthlyCollections(data || { fy: '', months: [] }))
      .catch(err => {
        console.error("Monthly collections error:", err);
        setMonthlyCollections({ fy: '', months: [] });
      });
  };

  const openCollectionModal = (r) => {
    setCollectionCase(r);
    setCollectionForm({
      collection_date: new Date().toISOString().split('T')[0],
      mode: 'CHEQUE',
      instrument_no: '',
      account1: 0, account2: 0, account10: 0, account21: 0, account22: 0
    });
    setShowCollectionModal(true);
  };

  const submitCollection = async (e) => {
    e.preventDefault();
    if (!collectionCase) return;
    setIsSubmittingCollection(true);
    try {
      const payload = {
        case_no: collectionCase.case_no,
        collection_date: collectionForm.collection_date,
        mode: collectionForm.mode,
        instrument_no: collectionForm.instrument_no,
        account1: parseFloat(collectionForm.account1) || 0,
        account2: parseFloat(collectionForm.account2) || 0,
        account10: parseFloat(collectionForm.account10) || 0,
        account21: parseFloat(collectionForm.account21) || 0,
        account22: parseFloat(collectionForm.account22) || 0,
      };
      const res = await fetch(`${API_BASE}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        alert(`✅ Payment recorded!\nTotal Collected: ₹${fmtMoney(data.total_collected)}`);
        setShowCollectionModal(false);
        fetchCollections(searchTerm, collectionMonth);
        fetchMonthlyCollections(collectionsFy);
        fetchEstablishments(searchTerm, page, limit, activeTab);
        fetchMonthly(fyYear);
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to record collection'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend server.");
    } finally {
      setIsSubmittingCollection(false);
    }
  };

  const openEditCaseModal = (c) => {
    setEditCase(c);
    setEditCaseForm({
      inquiry_section: c.inquiry_section || '7A',
      assessing_officer: c.assessing_officer || '',
      aeo: c.aeo || '',
      period_from: c.period_from || '',
      period_to: c.period_to || '',
      current_ndh: c.current_ndh || '',
      status: c.status || 'ACTIVE'
    });
    setShowEditCaseModal(true);
  };

  const submitCaseEdit = async (e) => {
    e.preventDefault();
    if (!editCase) return;
    setIsSavingCaseEdit(true);
    try {
      const res = await fetch(`${API_BASE}/cases/${encodeURIComponent(editCase.case_no)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editCaseForm)
      });
      if (res.ok) {
        alert(`✅ Case ${editCase.case_no} updated.`);
        setShowEditCaseModal(false);
        refreshCurrentView();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to update case'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend server.");
    } finally {
      setIsSavingCaseEdit(false);
    }
  };

  const deleteCase = async (c) => {
    if (!window.confirm(`Delete case ${c.case_no}?\nThis will also remove its hearings, Red Book entry and collections. This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/cases/${encodeURIComponent(c.case_no)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert(`🗑️ Case ${c.case_no} deleted.`);
        setSelectedCase(null);
        setShowEditCaseModal(false);
        refreshCurrentView();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to delete case'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend server.");
    }
  };

  const openEditRedbookModal = (r) => {
    setEditRedbook(r);
    setEditRedbookForm({
      order_date: r.order_date || '',
      account1: r.account1 || 0, account2: r.account2 || 0, account10: r.account10 || 0,
      account21: r.account21 || 0, account22: r.account22 || 0
    });
    setShowEditRedbookModal(true);
  };

  const submitRedbookEdit = async (e) => {
    e.preventDefault();
    if (!editRedbook) return;
    setIsSavingRedbookEdit(true);
    try {
      const res = await fetch(`${API_BASE}/redbook/${encodeURIComponent(editRedbook.case_no)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editRedbookForm)
      });
      if (res.ok) {
        alert(`✅ Red Book entry ${editRedbook.case_no} updated.`);
        setShowEditRedbookModal(false);
        refreshCurrentView();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to update Red Book entry'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend server.");
    } finally {
      setIsSavingRedbookEdit(false);
    }
  };

  const deleteRedbook = async (r) => {
    if (!window.confirm(`Delete Red Book entry ${r.case_no}?\nIts collection payments will also be removed. This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/redbook/${encodeURIComponent(r.case_no)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert(`🗑️ Red Book entry ${r.case_no} deleted.`);
        refreshCurrentView();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to delete Red Book entry'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend server.");
    }
  };

  const openEditCollectionModal = (col) => {
    setEditCollection(col);
    setEditCollectionForm({
      collection_date: col.collection_date || '',
      mode: col.mode || 'CHEQUE',
      instrument_no: col.instrument_no || '',
      account1: col.account1 || 0, account2: col.account2 || 0, account10: col.account10 || 0,
      account21: col.account21 || 0, account22: col.account22 || 0
    });
    setShowEditCollectionModal(true);
  };

  const submitCollectionEdit = async (e) => {
    e.preventDefault();
    if (!editCollection) return;
    setIsSavingCollectionEdit(true);
    try {
      const res = await fetch(`${API_BASE}/collections/${editCollection.collection_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editCollectionForm)
      });
      if (res.ok) {
        alert(`✅ Collection entry updated.`);
        setShowEditCollectionModal(false);
        fetchCollections(searchTerm, collectionMonth);
        fetchMonthlyCollections(collectionsFy);
        fetchEstablishments(searchTerm, page, limit, activeTab);
        fetchStats();
        fetchMonthly(fyYear);
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to update collection'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend server.");
    } finally {
      setIsSavingCollectionEdit(false);
    }
  };

  const deleteCollection = async (col) => {
    if (!window.confirm(`Delete this collection entry (${col.instrument_no || ''} · ₹${fmtMoney(col.total_collected)})? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/collections/${col.collection_id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert(`🗑️ Collection entry deleted.`);
        fetchCollections(searchTerm, collectionMonth);
        fetchMonthlyCollections(collectionsFy);
        fetchEstablishments(searchTerm, page, limit, activeTab);
        fetchStats();
        fetchMonthly(fyYear);
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to delete collection'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend server.");
    }
  };

  const refreshCurrentView = () => {
    fetchEstablishments(searchTerm, page, limit, activeTab);
    fetchStats();
    fetchMonthly(fyYear);
    fetchCollections(searchTerm, collectionMonth);
    fetchMonthlyCollections(collectionsFy);
  };

  // ---------------------------------------------------------------------------
  // PDF reports (Blue Book / Red Book / Collections / Monthly Dashboard)
  // ---------------------------------------------------------------------------
  const [isExporting, setIsExporting] = useState(false);
  const REPORT_LIMIT = 100000;
  const rMoney = (v) => (Number(v) ? `₹${fmtMoney(v)}` : '—');
  const rMoney0 = (v) => `₹${fmtMoney(v)}`;
  const rPeriod = (r) => [r.period_from, r.period_to].filter(Boolean).join(' – ') || '—';
  const rDash = (v) => (v == null || v === '' ? '—' : v);
  const sumBy = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const nowStamp = () => new Date().toLocaleString('en-IN');

  const exportReport = async (kind) => {
    setIsExporting(true);
    try {
      if (kind === 'bluebook' || kind === 'redbook') {
        const res = await fetch(`${API_BASE}/${kind}?q=${encodeURIComponent(searchTerm)}&page=1&limit=${REPORT_LIMIT}`);
        const { data = [] } = await res.json();
        (kind === 'bluebook' ? buildBlueBookReport : buildRedBookReport)(data);
      } else if (kind === 'collections') {
        const url = `${API_BASE}/collections?q=${encodeURIComponent(searchTerm)}&page=1&limit=${REPORT_LIMIT}${collectionMonth ? `&month=${collectionMonth}` : ''}`;
        const { data = [] } = await (await fetch(url)).json();
        buildCollectionsReport(data);
      } else if (kind === 'dashboard') {
        const months = monthlyData.months || [];
        const details = await Promise.all(
          months.map((m) =>
            fetch(`${API_BASE}/dashboard/monthly/detail?month=${m.ym}`)
              .then((r) => r.json())
              .catch(() => ({ added: [], disposed: [] }))
          )
        );
        buildMonthlyReport(months, details);
      }
    } catch (e) {
      console.error('Report error:', e);
      alert('Could not generate the report. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const buildBlueBookReport = (rows) => {
    openPrintableReport({
      title: 'Blue Book — Register of Inquiries',
      subtitle: 'Cases initiated under Section 7A / 7B / 14B / 7Q',
      meta: [
        { label: 'Filter', value: searchTerm.trim() || 'All records' },
        { label: 'Total cases', value: String(rows.length) },
        { label: 'Generated', value: nowStamp() },
      ],
      sections: [{
        head: ['Sr', 'Case No', 'Establishment', 'Est Code', 'Sec', 'Assessing Officer', 'AEO', 'Period', 'Initiated', 'Hearing #', 'Next Hearing', 'Status', 'Amount Received'],
        aligns: ['r', 'l', 'l', 'l', 'c', 'l', 'l', 'l', 'c', 'c', 'c', 'c', 'r'],
        rows: rows.map((c, i) => [
          i + 1, c.case_no, c.EST_NAME || 'N/A', c.est_id, c.inquiry_section || '7A',
          rDash(c.assessing_officer), rowAeo(c), rPeriod(c), rDash(c.initiation_date),
          c.hearing_count || 1, rDash(c.current_ndh), rDash(c.status), rMoney(c.amount_received),
        ]),
        total: ['', '', '', '', '', '', '', '', '', '', '', 'TOTAL', rMoney0(sumBy(rows, (r) => r.amount_received))],
      }],
    });
  };

  const buildRedBookReport = (rows) => {
    openPrintableReport({
      title: 'Red Book — Defaulters & Recovery Register',
      subtitle: 'Assessment orders and recovery position',
      meta: [
        { label: 'Filter', value: searchTerm.trim() || 'All records' },
        { label: 'Total defaulters', value: String(rows.length) },
        { label: 'Generated', value: nowStamp() },
      ],
      sections: [{
        head: ['Sr', 'Case No', 'Establishment', 'Est Code', 'Sec', 'Officer', 'AEO', 'Period', 'Order Date',
          'A/c 1', 'A/c 2', 'A/c 10', 'A/c 21', 'A/c 22', 'Total Assessed', 'Total Collected', 'Balance'],
        aligns: ['r', 'l', 'l', 'l', 'c', 'l', 'l', 'l', 'c', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
        rows: rows.map((r, i) => [
          i + 1, r.case_no, r.EST_NAME || 'N/A', r.est_id, r.inquiry_section || '7A',
          rDash(r.assessing_officer), rowAeo(r), rPeriod(r), rDash(r.order_date),
          rMoney(r.account1), rMoney(r.account2), rMoney(r.account10), rMoney(r.account21), rMoney(r.account22),
          rMoney(r.total_assessed), rMoney(r.total_collected),
          rMoney((r.total_assessed || 0) - (r.total_collected || 0)),
        ]),
        total: ['', '', '', '', '', '', '', '', 'TOTAL',
          rMoney0(sumBy(rows, (r) => r.account1)), rMoney0(sumBy(rows, (r) => r.account2)),
          rMoney0(sumBy(rows, (r) => r.account10)), rMoney0(sumBy(rows, (r) => r.account21)),
          rMoney0(sumBy(rows, (r) => r.account22)), rMoney0(sumBy(rows, (r) => r.total_assessed)),
          rMoney0(sumBy(rows, (r) => r.total_collected)),
          rMoney0(sumBy(rows, (r) => (r.total_assessed || 0) - (r.total_collected || 0)))],
      }],
    });
  };

  const buildCollectionsReport = (rows) => {
    const monthLabel = collectionMonth
      ? (monthlyCollections.months.find((m) => m.ym === collectionMonth)?.month || collectionMonth)
      : 'All months';
    openPrintableReport({
      title: 'Collection Register',
      subtitle: 'Payments received against Red Book cases',
      meta: [
        { label: 'Period', value: monthLabel },
        { label: 'Filter', value: searchTerm.trim() || 'All records' },
        { label: 'Entries', value: String(rows.length) },
        { label: 'Generated', value: nowStamp() },
      ],
      sections: [{
        head: ['Sr', 'Payment Date', 'Est Code', 'Establishment', 'AEO', 'Sec', 'Officer', 'Period', 'Order Date',
          'A/c 1', 'A/c 2', 'A/c 10', 'A/c 21', 'A/c 22', 'Total Collected', 'Cheque / DD No.', 'Mode'],
        aligns: ['r', 'c', 'l', 'l', 'l', 'c', 'l', 'l', 'c', 'r', 'r', 'r', 'r', 'r', 'r', 'l', 'c'],
        rows: rows.map((c, i) => [
          i + 1, rDash(c.collection_date), c.est_id, c.EST_NAME || 'N/A', rowAeo(c),
          c.inquiry_section || '7A', rDash(c.assessing_officer), rPeriod(c), rDash(c.order_date),
          rMoney(c.account1), rMoney(c.account2), rMoney(c.account10), rMoney(c.account21), rMoney(c.account22),
          rMoney(c.total_collected), rDash(c.instrument_no), c.mode || 'CHEQUE',
        ]),
        total: ['', '', '', '', '', '', '', '', 'TOTAL',
          rMoney0(sumBy(rows, (r) => r.account1)), rMoney0(sumBy(rows, (r) => r.account2)),
          rMoney0(sumBy(rows, (r) => r.account10)), rMoney0(sumBy(rows, (r) => r.account21)),
          rMoney0(sumBy(rows, (r) => r.account22)), rMoney0(sumBy(rows, (r) => r.total_collected)), '', ''],
      }],
    });
  };

  const buildMonthlyReport = (months, details) => {
    const fy = monthlyData.fy || `${fyYear}-${String(fyYear + 1).slice(-2)}`;
    const addedRows = [];
    const disposedRows = [];
    months.forEach((m, idx) => {
      const d = details[idx] || { added: [], disposed: [] };
      (d.added || []).forEach((c) => addedRows.push([
        addedRows.length + 1, m.month, c.est_id, c.EST_NAME || 'N/A', rowAeo(c), c.case_no,
        c.inquiry_section || '7A', rDash(c.assessing_officer), rPeriod(c), rDash(c.initiation_date), rDash(c.status),
      ]));
      (d.disposed || []).forEach((r) => disposedRows.push([
        disposedRows.length + 1, m.month, r.est_id, r.EST_NAME || 'N/A', rowAeo(r), r.case_no,
        r.inquiry_section || '7A', rDash(r.assessing_officer), rPeriod(r), rDash(r.order_date), rMoney0(r.total_assessed),
      ]));
    });
    const grandAssessed = months.reduce(
      (s, m, idx) => s + sumBy((details[idx] || {}).disposed || [], (r) => r.total_assessed), 0);

    openPrintableReport({
      title: 'Monthly Inquiry Register',
      subtitle: `Financial Year ${fy} (April – March)`,
      meta: [
        { label: 'Financial year', value: fy },
        { label: 'Generated', value: nowStamp() },
      ],
      sections: [
        {
          caption: 'Running Balance of Inquiries',
          head: ['Month', 'Opening', 'Added', 'Disposed', 'Closing'],
          aligns: ['l', 'r', 'r', 'r', 'r'],
          rows: months.map((m) => [m.month, m.opening, `+${m.added}`, `-${m.disposed}`, m.closing]),
          total: ['FY Total', months[0] ? months[0].opening : 0,
            `+${sumBy(months, (m) => m.added)}`, `-${sumBy(months, (m) => m.disposed)}`,
            months.length ? months[months.length - 1].closing : 0],
        },
        {
          caption: `Inquiries Added During FY ${fy}`,
          head: ['Sr', 'Month', 'Est Code', 'Establishment', 'AEO', 'Case No', 'Sec', 'Officer', 'Period', 'Initiated', 'Status'],
          aligns: ['r', 'l', 'l', 'l', 'l', 'l', 'c', 'l', 'l', 'c', 'c'],
          rows: addedRows,
        },
        {
          caption: `Inquiries Disposed (Entered Red Book) During FY ${fy}`,
          head: ['Sr', 'Month', 'Est Code', 'Establishment', 'AEO', 'Case No', 'Sec', 'Officer', 'Period', 'Order Date', 'Total Assessed'],
          aligns: ['r', 'l', 'l', 'l', 'l', 'l', 'c', 'l', 'l', 'c', 'r'],
          rows: disposedRows,
          total: ['', '', '', '', '', '', '', '', '', 'GRAND TOTAL', rMoney0(grandAssessed)],
        },
      ],
    });
  };

  // Update a tracking flag (8F / NIR / Bank A/c Attached) on the backend, then refresh the row in place.
  const updateCaseTracking = async (c, updates, cb) => {
    try {
      const res = await fetch(`${API_BASE}/cases/${encodeURIComponent(c.case_no)}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(prev => prev.map(r =>
          r.case_no === c.case_no ? { ...r, ...data, ...(updates.nir_status !== undefined ? { nir_status: updates.nir_status } : {}) } : r
        ));
        if (cb) cb();
        return true;
      }
      const errData = await res.json();
      alert(`Error: ${errData.detail || 'Failed to update case'}`);
      return false;
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend server.");
      return false;
    }
  };

  const toggleF8 = (c) => {
    const next = !(c.f8_issued || 0);
    updateCaseTracking(c, { f8_issued: next });
  };

  const toggleBankAttached = (c) => {
    const next = !(c.bank_ac_attached || 0);
    updateCaseTracking(c, { bank_ac_attached: next });
  };

  const toggleNir = (c) => {
    // If already NIR, revert to IR (no window). If currently IR, open the NIR cause window.
    if ((c.nir_status || 'IR') === 'NIR') {
      updateCaseTracking(c, { nir_status: 'IR' });
    } else {
      setNirModalCase(c);
      setNirForm({ nir_status: 'NIR', nir_cause: 'High Court', nir_case_no: c.nir_case_no || '', nir_case_date: c.nir_case_date || '' });
      setShowNirModal(true);
    }
  };

  const submitNir = async (e) => {
    e.preventDefault();
    if (!nirModalCase) return;
    if (!nirForm.nir_case_no.trim() || !nirForm.nir_case_date) {
      alert("Case No. and Case Date are required for NIR.");
      return;
    }
    setIsSavingNir(true);
    try {
      const ok = await updateCaseTracking(nirModalCase, {
        nir_status: 'NIR',
        nir_cause: nirForm.nir_cause,
        nir_case_no: nirForm.nir_case_no.trim(),
        nir_case_date: nirForm.nir_case_date
      });
      if (ok) setShowNirModal(false);
    } finally {
      setIsSavingNir(false);
    }
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

  const openInitiateModal = () => {
    if (!selectedEst) return;
    setInquiryFormData((f) => ({
      ...f,
      aeo: selectedEst.AEO || '',
    }));
    setShowModal(true);
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
          aeo: '',
          period_from: '',
          period_to: '',
          first_hearing_date: ''
        });
        fetchStats();
        fetchMonthly(fyYear);
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
        fetchMonthly(fyYear);
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
    if (tab === 'dashboard') fetchMonthly(fyYear);
    if (tab === 'collections') {
      fetchCollections('', collectionMonth);
      fetchMonthlyCollections(collectionsFy);
    }
  };

  return (
    <>
      {!isAuthenticated ? (
        <LoginPage
          loginForm={loginForm}
          setLoginForm={setLoginForm}
          loginError={loginError}
          isLoggingIn={isLoggingIn}
          handleLogin={handleLogin}
        />
      ) : (
      <div className="min-h-screen bg-slate-100 p-6 font-sans">
        {/* HEADER WITH NAV BUTTONS */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <span className="bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">EPFO DO Cuttack</span>
            <h1 className="text-2xl font-bold text-slate-800 mt-1">Inquiry & Recovery Portal</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0">
            <span className="text-xs font-semibold text-slate-500 mr-1">Signed in: <span className="text-blue-700 font-bold">admin</span></span>
            <button
              onClick={handleLogout}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 border border-slate-300">
              <LogOut size={15} className="text-rose-600" /> Logout
            </button>
          </div>
        </header>

        {/* TOP NAVIGATION BUTTONS */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setShowOfficerModal(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 border border-slate-300">
            <UserCheck size={15} className="text-blue-600" /> Inquiry Officers
          </button>

          <button
            onClick={() => setShowAeoModal(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 border border-slate-300">
            <Shield size={15} className="text-emerald-600" /> Area Enforcement Officers
          </button>

          <button
            onClick={() => switchTab('search')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${activeTab === 'search' ? 'bg-slate-700 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'}`}>
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

          <button
            onClick={() => switchTab('collections')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${activeTab === 'collections' ? 'bg-teal-600 text-white shadow' : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200'}`}>
            <IndianRupee size={15} /> Collections
          </button>

          <button
            onClick={() => switchTab('dashboard')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${activeTab === 'dashboard' ? 'bg-violet-600 text-white shadow' : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200'}`}>
            <BarChart3 size={15} /> Monthly Dashboard
          </button>
        </div>

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

      {/* MONTHLY DASHBOARD VIEW */}
      {activeTab === 'dashboard' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 size={20} className="text-violet-600" /> Monthly Inquiry Register
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Running balance of inquiries held from April to March (Financial Year {monthlyData.fy || '...'}).
                Click any month row to see the establishment-wise Added / Disposed list below.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => exportReport('dashboard')}
                disabled={isExporting || !(monthlyData.months && monthlyData.months.length)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50">
                <Download size={14} /> {isExporting ? 'Preparing…' : 'Save as PDF'}
              </button>

              {/* FINANCIAL YEAR SWITCHER */}
              <button
                onClick={() => setFyYear(fyYear - 1)}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
                <ChevronLeft size={16} />
              </button>
              <span className="px-4 py-1.5 bg-violet-50 border border-violet-200 text-violet-700 rounded-lg text-sm font-bold">
                FY {monthlyData.fy || `${fyYear}-${String(fyYear + 1).slice(-2)}`}
              </span>
              <button
                onClick={() => setFyYear(fyYear + 1)}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {monthlyLoading ? (
            <div className="text-center py-16 text-slate-400 font-medium">Loading monthly register...</div>
          ) : monthlyData.months && monthlyData.months.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead className="bg-violet-50 text-xl font-bold text-violet-800 uppercase">
                  <tr>
                    <th className="p-4 text-center">Month</th>
                    <th className="p-4 text-center">Opening Balance</th>
                    <th className="p-4 text-center">Added During Month</th>
                    <th className="p-4 text-center">Disposed During Month</th>
                    <th className="p-4 text-center">Closing Balance</th>
                  </tr>
                </thead>
                <tbody className="text-lg divide-y divide-slate-100">
                  {monthlyData.months.map((mo, idx) => (
                    <tr
                      key={idx}
                      onClick={() => selectMonthDetail(mo.ym)}
                      title="Click to see establishment-wise details below"
                      className={`cursor-pointer transition ${
                        mo.ym === monthlyDetailMonth
                          ? 'bg-violet-100 ring-2 ring-inset ring-violet-400 font-semibold'
                          : idx === monthlyData.months.length - 1
                            ? 'bg-violet-50/40 font-semibold hover:bg-violet-100/50'
                            : 'hover:bg-slate-50'
                      }`}>
                      <td className="p-4 font-bold text-slate-800">{mo.month}</td>
                      <td className="p-4 text-right font-mono text-slate-600">{mo.opening}</td>
                      <td className="p-4 text-right font-mono text-emerald-700">+{mo.added}</td>
                      <td className="p-4 text-right font-mono text-rose-700">-{mo.disposed}</td>
                      <td className="p-4 text-right font-mono font-bold text-violet-700">{mo.closing}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 text-lg font-bold text-slate-700">
                  <tr>
                    <td className="p-4">Financial Year Total</td>
                    <td className="p-4 text-right font-mono">{monthlyData.months[0]?.opening ?? 0}</td>
                    <td className="p-4 text-right font-mono text-emerald-700">+{monthlyData.months.reduce((s, m) => s + (m.added || 0), 0)}</td>
                    <td className="p-4 text-right font-mono text-rose-700">-{monthlyData.months.reduce((s, m) => s + (m.disposed || 0), 0)}</td>
                    <td className="p-4 text-right font-mono text-violet-700">{monthlyData.months[monthlyData.months.length - 1]?.closing ?? 0}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
              No inquiry data available for this financial year.
            </div>
          )}
        </div>
      )}

      {/* MONTHLY DASHBOARD - ESTABLISHMENT DETAILS (ADDED / DISPOSED) */}
      {activeTab === 'dashboard' && monthlyDetailMonth && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Building size={20} className="text-violet-600" /> Establishment Details — {monthlyDetailLabel}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Inquiries added (initiated) and disposed (entered into the Red Book) during {monthlyDetailLabel}.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">
                {monthlyDetail.added.length} Added
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-bold">
                {monthlyDetail.disposed.length} Disposed
              </span>
            </div>
          </div>

          {monthlyDetailLoading ? (
            <div className="text-center py-12 text-slate-400 font-medium">Loading establishment details...</div>
          ) : (
            <div className="space-y-6">
              {/* ADDED DURING MONTH */}
              <div>
                <h3 className="text-sm font-bold text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Plus size={15} /> Added During {monthlyDetailLabel} (Inquiries Initiated)
                </h3>
                {monthlyDetail.added.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse min-w-[1050px]">
                      <thead className="bg-slate-100 text-xs font-bold text-slate-600 uppercase">
                        <tr>
                          <th className="p-3 text-center">Est Code</th>
                          <th className="p-3 text-center">Establishment</th>
                          <th className="p-3 text-center">AEO</th>
                          <th className="p-3 text-center">Case No</th>
                          <th className="p-3 text-center">Section</th>
                          <th className="p-3 text-center">Officer</th>
                          <th className="p-3 text-center">Period</th>
                          <th className="p-3 text-center">Initiation Date</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-100">
                        {monthlyDetail.added.map((c) => (
                          <tr key={c.case_no} className="hover:bg-emerald-50/40">
                            <td className="p-3 font-mono font-bold text-violet-700 whitespace-nowrap">{c.est_id}</td>
                            <td className="p-3 font-semibold text-slate-800">{c.EST_NAME || 'N/A'}</td>
                            <td className="p-3 text-slate-600 whitespace-nowrap">{rowAeo(c)}</td>
                            <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{c.case_no}</td>
                            <td className="p-3 text-center"><span className="bg-indigo-50 border border-indigo-200 text-indigo-600 px-2 py-0.5 rounded-md font-bold">{c.inquiry_section || '7A'}</span></td>
                            <td className="p-3 text-slate-600">{c.assessing_officer}</td>
                            <td className="p-3 text-slate-500 whitespace-nowrap">{c.period_from} to {c.period_to}</td>
                            <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">{c.initiation_date}</td>
                            <td className="p-3 text-center">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${c.status === 'CONCLUDED' ? 'bg-slate-200 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>{c.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                    No inquiries were initiated during {monthlyDetailLabel}.
                  </div>
                )}
              </div>

              {/* DISPOSED DURING MONTH */}
              <div>
                <h3 className="text-sm font-bold text-rose-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <BookOpen size={15} /> Disposed During {monthlyDetailLabel} (Entered Red Book)
                </h3>
                {monthlyDetail.disposed.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse min-w-[1100px]">
                      <thead className="bg-slate-100 text-xs font-bold text-slate-600 uppercase">
                        <tr>
                          <th className="p-3 text-center">Est Code</th>
                          <th className="p-3 text-center">Establishment</th>
                          <th className="p-3 text-center">AEO</th>
                          <th className="p-3 text-center">Case No</th>
                          <th className="p-3 text-center">Section</th>
                          <th className="p-3 text-center">Officer</th>
                          <th className="p-3 text-center">Period</th>
                          <th className="p-3 text-center">Order Date</th>
                          <th className="p-3 text-center">Total Assessed</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-100">
                        {monthlyDetail.disposed.map((r) => (
                          <tr key={r.case_no} className="hover:bg-rose-50/40">
                            <td className="p-3 font-mono font-bold text-violet-700 whitespace-nowrap">{r.est_id}</td>
                            <td className="p-3 font-semibold text-slate-800">{r.EST_NAME || 'N/A'}</td>
                            <td className="p-3 text-slate-600 whitespace-nowrap">{rowAeo(r)}</td>
                            <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{r.case_no}</td>
                            <td className="p-3 text-center"><span className="bg-indigo-50 border border-indigo-200 text-indigo-600 px-2 py-0.5 rounded-md font-bold">{r.inquiry_section || '7A'}</span></td>
                            <td className="p-3 text-slate-600">{r.assessing_officer}</td>
                            <td className="p-3 text-slate-500 whitespace-nowrap">{r.period_from} to {r.period_to}</td>
                            <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">{r.order_date}</td>
                            <td className="p-3 text-right font-mono font-bold text-rose-700 whitespace-nowrap">₹{fmtMoney(r.total_assessed)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 text-xs font-bold text-slate-700">
                        <tr>
                          <td className="p-3" colSpan={8}>Total Assessed — {monthlyDetailLabel}</td>
                          <td className="p-3 text-right font-mono text-rose-700">
                            ₹{fmtMoney(monthlyDetail.disposed.reduce((s, r) => s + (r.total_assessed || 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                    No inquiries were disposed during {monthlyDetailLabel}.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* COLLECTIONS REGISTER VIEW */}
      {activeTab === 'collections' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <IndianRupee size={20} className="text-teal-600" /> Collection Register (Month-wise)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Payments received (Cheque / DD) against Red Book cases, stored month-wise.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => exportReport('collections')}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50">
                <Download size={14} /> {isExporting ? 'Preparing…' : 'Save as PDF'}
              </button>
              <select
                value={collectionMonth}
                onChange={(e) => setCollectionMonth(e.target.value)}
                className="p-2 border border-slate-300 rounded-lg outline-none font-semibold bg-white text-xs">
                <option value="">All Months</option>
                {monthlyCollections.months.map((mo, i) => (
                  <option key={i} value={mo.ym || ''}>
                    {mo.month}
                  </option>
                ))}
              </select>
              <span className="text-xs font-bold text-slate-500">FY {monthlyCollections.fy || `...`}</span>
            </div>
          </div>

          {/* MONTH-WISE ACCOUNT SUMMARY */}
          {monthlyCollections.months && monthlyCollections.months.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl mb-5">
              <table className="w-full text-left border-collapse">
                <thead className="bg-teal-50 text-base font-bold text-teal-800 uppercase">
                  <tr>
                    <th className="p-3 text-center">Month</th>
                    <th className="p-3 text-center">A/c 1</th>
                    <th className="p-3 text-center">A/c 2</th>
                    <th className="p-3 text-center">A/c 10</th>
                    <th className="p-3 text-center">A/c 21</th>
                    <th className="p-3 text-center">A/c 22</th>
                    <th className="p-3 text-center">Total Collected</th>
                    <th className="p-3 text-center">Entries</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-slate-100">
                  {monthlyCollections.months.map((mo, i) => (
                    <tr key={i} className={mo.total > 0 ? 'font-semibold bg-teal-50/30' : 'hover:bg-slate-50'}>
                      <td className="p-3 font-bold text-slate-800">{mo.month}</td>
                      <td className="p-3 text-right font-mono text-slate-700">{mo.total ? `₹${fmtMoney(mo.account1)}` : '—'}</td>
                      <td className="p-3 text-right font-mono text-slate-700">{mo.total ? `₹${fmtMoney(mo.account2)}` : '—'}</td>
                      <td className="p-3 text-right font-mono text-slate-700">{mo.total ? `₹${fmtMoney(mo.account10)}` : '—'}</td>
                      <td className="p-3 text-right font-mono text-slate-700">{mo.total ? `₹${fmtMoney(mo.account21)}` : '—'}</td>
                      <td className="p-3 text-right font-mono text-slate-700">{mo.total ? `₹${fmtMoney(mo.account22)}` : '—'}</td>
                      <td className="p-3 text-right font-mono font-bold text-teal-700">{mo.total ? `₹${fmtMoney(mo.total)}` : '—'}</td>
                      <td className="p-3 text-center font-bold text-slate-700">{mo.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* COLLECTION ENTRIES */}
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Search by Est. Name, Est Code, or Case No..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                const t = setTimeout(() => fetchCollections(e.target.value, collectionMonth), 300);
                return () => clearTimeout(t);
              }}
              className="w-full pl-4 pr-10 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 font-medium"
            />
          </div>

          {collectionsLoading ? (
            <div className="text-center py-16 text-slate-400 font-medium">Loading collections...</div>
          ) : collectionsData.data.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse min-w-[1280px]">
                <thead className="bg-slate-100 text-base font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="p-3 text-center">Est Code</th>
                    <th className="p-3 text-center">Establishment</th>
                    <th className="p-3 text-center">AEO</th>
                    <th className="p-3 text-center">Section</th>
                    <th className="p-3 text-center">Officer</th>
                    <th className="p-3 text-center">Period</th>
                    <th className="p-3 text-center">Order Date</th>
                    <th className="p-3 text-center">A/c 1</th>
                    <th className="p-3 text-center">A/c 2</th>
                    <th className="p-3 text-center">A/c 10</th>
                    <th className="p-3 text-center">A/c 21</th>
                    <th className="p-3 text-center">A/c 22</th>
                    <th className="p-3 text-center">Total Collected</th>
                    <th className="p-3 text-center">Payment Date</th>
                    <th className="p-3 text-center">Cheque / DD No.</th>
                    <th className="p-3 text-center">Mode</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-slate-100">
                  {collectionsData.data.map((col) => (
                    <tr key={col.collection_id} className="hover:bg-teal-50/30">
                      <td className="p-3 font-mono font-bold text-teal-700 whitespace-nowrap">{col.est_id}</td>
                      <td className="p-3 font-semibold text-slate-800">{col.EST_NAME || 'N/A'}</td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">{rowAeo(col)}</td>
                      <td className="p-3"><span className="bg-indigo-50 border border-indigo-200 text-indigo-600 px-2 py-0.5 rounded-md font-bold">{col.inquiry_section || '7A'}</span></td>
                      <td className="p-3 text-slate-600">{col.assessing_officer}</td>
                      <td className="p-3 text-slate-500">{col.period_from} to {col.period_to}</td>
                      <td className="p-3 font-semibold text-slate-700">{col.order_date}</td>
                      <td className="p-3 text-right font-mono">₹{fmtMoney(col.account1)}</td>
                      <td className="p-3 text-right font-mono">₹{fmtMoney(col.account2)}</td>
                      <td className="p-3 text-right font-mono">₹{fmtMoney(col.account10)}</td>
                      <td className="p-3 text-right font-mono">₹{fmtMoney(col.account21)}</td>
                      <td className="p-3 text-right font-mono">₹{fmtMoney(col.account22)}</td>
                      <td className="p-3 text-right font-mono font-bold text-teal-700">₹{fmtMoney(col.total_collected)}</td>
                      <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">{col.collection_date}</td>
                      <td className="p-3 font-mono font-bold text-slate-700">{col.instrument_no || '—'}</td>
                      <td className="p-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${col.mode === 'DD' ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'}`}>
                          {col.mode || 'CHEQUE'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditCollectionModal(col)}
                            title="Edit collection entry"
                            className="bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 p-1.5 rounded-lg transition">
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => deleteCollection(col)}
                            title="Delete collection entry"
                            className="bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 p-1.5 rounded-lg transition">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
              No collection entries found. Record a payment from the Red Book.
            </div>
          )}
        </div>
      )}

      {/* MAIN LAYOUT */}
      {activeTab !== 'dashboard' && activeTab !== 'collections' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: MASTER SEARCH & TABLE */}
        <div className={`${activeTab === 'search' ? 'lg:col-span-2' : 'lg:col-span-3'} bg-white p-6 rounded-2xl shadow-sm border border-slate-200`}>
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

            <div className="flex flex-wrap items-center gap-3">
              {(activeTab === 'bluebook' || activeTab === 'redbook') && (
                <button
                  onClick={() => exportReport(activeTab)}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50">
                  <Download size={14} /> {isExporting ? 'Preparing…' : 'Save as PDF'}
                </button>
              )}
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
          {activeTab === 'search' && !searchTerm.trim() ? (
            <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-xl">
              <Search size={36} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">Type an establishment code, name, or PAN above to search.</p>
            </div>
          ) : isLoading ? (
            <div className="text-center py-16 text-slate-400 font-medium">Loading Data...</div>
          ) : searchResults.length > 0 ? (
            <>
              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[550px] overflow-y-auto">
                <table className={`w-full text-left border-collapse ${activeTab === 'redbook' ? 'min-w-[1950px]' : isCaseTab ? 'min-w-[1350px]' : 'min-w-[950px]'}`}>
                  {/* ---- CASE-BASED TABS: bluebook / active_7a / hearings_today ---- */}
                  {isCaseTab ? (
                    <>
                      <thead className="sticky top-0 bg-slate-100 text-base font-bold text-slate-600 uppercase">
                        <tr>
                          <th className="p-3 text-center">Case No</th>
                          <th className="p-3 text-center">Establishment</th>
                          <th className="p-3 text-center">Section</th>
                          <th className="p-3 text-center">Officer</th>
                          <th className="p-3 text-center">AEO</th>
                          <th className="p-3 text-center">Period</th>
                          <th className="p-3 text-center">Initiation Date</th>
                          <th className="p-3 text-center">Hearing No.</th>
                          <th className="p-3 text-center">Next Date of Hearing</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3 text-center">Amount Received</th>
                          <th className="p-3 text-center">8F Issued</th>
                          <th className="p-3 text-center">NIR</th>
                          <th className="p-3 text-center">Bank A/c Attached</th>
                          <th className="p-3 text-center">Action</th>
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
                            <td className="p-3 text-slate-600 whitespace-nowrap">{rowAeo(c)}</td>
                            <td className="p-3 text-slate-500">{c.period_from} to {c.period_to}</td>
                            <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">{c.initiation_date || 'N/A'}</td>
                            <td className="p-3 text-center font-bold text-slate-700">{c.hearing_count || 1}</td>
                            <td className="p-3 font-semibold text-amber-600">{c.current_ndh || 'N/A'}</td>
                            <td className="p-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${c.status === 'CONCLUDED' ? 'bg-slate-200 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {(c.amount_received || 0) > 0 ? (
                                <span className="font-mono font-bold text-emerald-700 whitespace-nowrap">₹{fmtMoney(c.amount_received)}</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleF8(c); }}
                                title={c.f8_issued ? "8F issued - click to revert" : "Click to mark 8F issued"}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 mx-auto transition ${c.f8_issued ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-white'}`}>
                                <Stamp size={12} /> {c.f8_issued ? 'Issued' : 'Issue'}
                              </button>
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleNir(c); }}
                                title={(c.nir_status || 'IR') === 'NIR' ? `NIR - ${c.nir_cause || ''} (${c.nir_case_no || ''})` : "Click to mark NIR"}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 mx-auto transition ${(c.nir_status || 'IR') === 'NIR' ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-white'}`}>
                                <Gavel size={12} /> {(c.nir_status || 'IR') === 'NIR' ? 'NIR' : 'IR'}
                              </button>
                              {(c.nir_status || 'IR') === 'NIR' && (
                                <div className="text-[9px] text-slate-500 mt-0.5">
                                  {c.nir_cause || ''}{c.nir_case_no ? ` · ${c.nir_case_no}` : ''}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleBankAttached(c); }}
                                title={c.bank_ac_attached ? "Bank A/c attached - click to remove" : "Click to mark Bank A/c attached"}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 mx-auto transition ${c.bank_ac_attached ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-white'}`}>
                                <Landmark size={12} /> {c.bank_ac_attached ? 'Attached' : 'Not Attached'}
                              </button>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditCaseModal(c); }}
                                  title="Edit case"
                                  className="bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 p-1.5 rounded-lg transition">
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteCase(c); }}
                                  title="Delete case"
                                  className="bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 p-1.5 rounded-lg transition">
                                  <Trash2 size={14} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openCaseDetail(c); }}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
                                  <ListChecks size={13} /> View
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : activeTab === 'redbook' ? (
                    /* ---- RED BOOK TAB ---- */
                    <>
                      <thead className="sticky top-0 bg-slate-100 text-base font-bold text-slate-600 uppercase">
                        <tr>
                          <th className="p-3 text-center border-x border-slate-300 border-l-2 border-slate-500">Case / Est</th>
                          <th className="p-3 text-center border-x border-slate-300">Section</th>
                          <th className="p-3 text-center border-x border-slate-300">Officer</th>
                          <th className="p-3 text-center border-x border-slate-300">AEO</th>
                          <th className="p-3 text-center border-x border-slate-300">Period</th>
                          <th className="p-3 text-center border-x border-slate-300 border-r-2 border-slate-500">Order Date</th>
                          <th className="p-3 text-center border-x border-slate-300 border-l-2 border-slate-500" colSpan={6}>Total Dues</th>
                          <th className="p-3 text-center border-x border-slate-300 border-l-2 border-slate-500" colSpan={6}>Collected (A/c Wise)</th>
                          <th className="p-3 text-center border-x border-slate-300 border-l-2 border-slate-500" colSpan={6}>Balance</th>
                          <th className="p-3 text-center border-x border-slate-300 border-l-2 border-slate-500">Mode / Last Pay</th>
                          <th className="p-3 text-center border-x border-slate-300 border-r-2 border-slate-500">Action</th>
                        </tr>
                        <tr className="bg-slate-50">
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500 border-l-2 border-slate-500"></th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500"></th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500"></th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500"></th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500"></th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500 border-r-2 border-slate-500"></th>
                          <th className="p-2 text-center border-x border-slate-300 border-l-2 border-slate-500 border-b-2 border-slate-500">A/c 1</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 2</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 10</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 21</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 22</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">Total</th>
                          <th className="p-2 text-center border-x border-slate-300 border-l-2 border-slate-500 border-b-2 border-slate-500">A/c 1</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 2</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 10</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 21</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 22</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">Total</th>
                          <th className="p-2 text-center border-x border-slate-300 border-l-2 border-slate-500 border-b-2 border-slate-500">A/c 1</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 2</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 10</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 21</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">A/c 22</th>
                          <th className="p-2 text-center border-x border-slate-300 border-b-2 border-slate-500">Total</th>
                          <th className="p-2 text-center border-x border-slate-300 border-l-2 border-slate-500 border-b-2 border-slate-500"></th>
                          <th className="p-2 text-center border-x border-slate-300 border-r-2 border-slate-500 border-b-2 border-slate-500"></th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-300 border-b-2 border-slate-300">
                        {searchResults.map((r) => {
                          const b1 = (r.account1 || 0) - (r.collected1 || 0);
                          const b2 = (r.account2 || 0) - (r.collected2 || 0);
                          const b10 = (r.account10 || 0) - (r.collected10 || 0);
                          const b21 = (r.account21 || 0) - (r.collected21 || 0);
                          const b22 = (r.account22 || 0) - (r.collected22 || 0);
                          const bTotal = (r.total_assessed || 0) - (r.total_collected || 0);
                          return (
                          <tr key={r.case_no} className="hover:bg-rose-50/30">
                            <td className="p-3 border-x border-slate-200 border-l-2 border-slate-500">
                              <span className="font-mono font-bold text-slate-800 block">{r.case_no}</span>
                              <span className="text-[10px] text-slate-500">{r.EST_NAME || 'N/A'}</span>
                              <span className="block text-[10px] font-mono text-slate-400">{r.est_id}</span>
                            </td>
                            <td className="p-3 border-x border-slate-200">
                              <span className="bg-indigo-50 border border-indigo-200 text-indigo-600 px-2 py-0.5 rounded-md font-bold">{r.inquiry_section || '7A'}</span>
                            </td>
                            <td className="p-3 text-slate-600 border-x border-slate-200">{r.assessing_officer}</td>
                            <td className="p-3 text-slate-600 border-x border-slate-200 whitespace-nowrap">{rowAeo(r)}</td>
                            <td className="p-3 text-slate-500 border-x border-slate-200">{r.period_from} to {r.period_to}</td>
                            <td className="p-3 font-semibold text-slate-700 border-x border-slate-200 border-r-2 border-slate-500">{r.order_date}</td>
                            <td className="p-3 text-right font-mono border-x border-slate-200">{r.account1 && `₹${fmtMoney(r.account1)}`}</td>
                            <td className="p-3 text-right font-mono border-x border-slate-200">{r.account2 && `₹${fmtMoney(r.account2)}`}</td>
                            <td className="p-3 text-right font-mono border-x border-slate-200">{r.account10 && `₹${fmtMoney(r.account10)}`}</td>
                            <td className="p-3 text-right font-mono border-x border-slate-200">{r.account21 && `₹${fmtMoney(r.account21)}`}</td>
                            <td className="p-3 text-right font-mono border-x border-slate-200">{r.account22 && `₹${fmtMoney(r.account22)}`}</td>
                            <td className="p-3 text-right font-mono font-bold text-rose-700 border-x border-slate-200">{r.total_assessed && `₹${fmtMoney(r.total_assessed)}`}</td>
                            <td className="p-3 text-right font-mono text-emerald-700 border-x border-slate-200">{r.collected1 && `₹${fmtMoney(r.collected1)}`}</td>
                            <td className="p-3 text-right font-mono text-emerald-700 border-x border-slate-200">{r.collected2 && `₹${fmtMoney(r.collected2)}`}</td>
                            <td className="p-3 text-right font-mono text-emerald-700 border-x border-slate-200">{r.collected10 && `₹${fmtMoney(r.collected10)}`}</td>
                            <td className="p-3 text-right font-mono text-emerald-700 border-x border-slate-200">{r.collected21 && `₹${fmtMoney(r.collected21)}`}</td>
                            <td className="p-3 text-right font-mono text-emerald-700 border-x border-slate-200">{r.collected22 && `₹${fmtMoney(r.collected22)}`}</td>
                            <td className="p-3 text-right font-mono font-bold text-teal-700 border-x border-slate-200">{r.total_collected && `₹${fmtMoney(r.total_collected)}`}</td>
                            <td className="p-3 text-right font-mono text-slate-600 border-x border-slate-200">{b1 ? `₹${fmtMoney(b1)}` : ''}</td>
                            <td className="p-3 text-right font-mono text-slate-600 border-x border-slate-200">{b2 ? `₹${fmtMoney(b2)}` : ''}</td>
                            <td className="p-3 text-right font-mono text-slate-600 border-x border-slate-200">{b10 ? `₹${fmtMoney(b10)}` : ''}</td>
                            <td className="p-3 text-right font-mono text-slate-600 border-x border-slate-200">{b21 ? `₹${fmtMoney(b21)}` : ''}</td>
                            <td className="p-3 text-right font-mono text-slate-600 border-x border-slate-200">{b22 ? `₹${fmtMoney(b22)}` : ''}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-800 border-x border-slate-200">{bTotal ? `₹${fmtMoney(bTotal)}` : ''}</td>
                            <td className="p-3 border-x border-slate-200 border-l-2 border-slate-500">
                              <span className="text-[10px] text-slate-500 block">{r.last_mode || '—'} {r.last_instrument ? `· ${r.last_instrument}` : ''}</span>
                              <span className="text-[10px] font-mono text-slate-400 block">{r.last_collection_date || 'No payment yet'}</span>
                            </td>
                            <td className="p-3 text-right border-x border-slate-200 border-r-2 border-slate-500">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openEditRedbookModal(r)}
                                  title="Edit Red Book entry"
                                  className="bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 p-1.5 rounded-lg transition">
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => deleteRedbook(r)}
                                  title="Delete Red Book entry"
                                  className="bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 p-1.5 rounded-lg transition">
                                  <Trash2 size={14} />
                                </button>
                                <button
                                  onClick={() => openCollectionModal(r)}
                                  className="bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
                                  <IndianRupee size={13} /> Record
                                </button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="sticky bottom-0 bg-slate-100 text-xs font-bold uppercase text-slate-800 border-t-2 border-slate-400">
                        <tr className="bg-slate-200/80">
                          <td className="p-3 font-black text-slate-800 text-sm border-x border-slate-300 border-l-2 border-slate-500" colSpan={6}>GRAND TOTAL</td>
                          <td className="p-3 text-right font-mono text-rose-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.account1 || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-rose-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.account2 || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-rose-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.account10 || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-rose-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.account21 || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-rose-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.account22 || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-rose-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.total_assessed || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-emerald-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.collected1 || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-emerald-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.collected2 || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-emerald-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.collected10 || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-emerald-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.collected21 || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-emerald-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.collected22 || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-teal-700 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + (r.total_collected || 0), 0))}</td>
                          <td className="p-3 text-right font-mono text-slate-800 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + ((r.account1 || 0) - (r.collected1 || 0)), 0))}</td>
                          <td className="p-3 text-right font-mono text-slate-800 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + ((r.account2 || 0) - (r.collected2 || 0)), 0))}</td>
                          <td className="p-3 text-right font-mono text-slate-800 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + ((r.account10 || 0) - (r.collected10 || 0)), 0))}</td>
                          <td className="p-3 text-right font-mono text-slate-800 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + ((r.account21 || 0) - (r.collected21 || 0)), 0))}</td>
                          <td className="p-3 text-right font-mono text-slate-800 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + ((r.account22 || 0) - (r.collected22 || 0)), 0))}</td>
                          <td className="p-3 text-right font-mono text-slate-800 border-x border-slate-300">₹{fmtMoney(searchResults.reduce((s, r) => s + ((r.total_assessed || 0) - (r.total_collected || 0)), 0))}</td>
                          <td className="p-3 border-x border-slate-300 border-l-2 border-slate-500"></td>
                          <td className="p-3 border-x border-slate-300 border-r-2 border-slate-500"></td>
                        </tr>
                      </tfoot>
                    </>
                  ) : (
                    /* ---- SEARCH TAB (ESTABLISHMENT MASTER) ---- */
                    <>
                      <thead className="sticky top-0 bg-slate-100 text-base font-bold text-slate-600 uppercase">
                        <tr>
                          <th className="p-3 text-center">Est Code</th>
                          <th className="p-3 text-center">Establishment Name</th>
                          <th className="p-3 text-center">AEO</th>
                          <th className="p-3 text-center">Address 1 & 2</th>
                          <th className="p-3 text-center">City</th>
                          <th className="p-3 text-center">No of UAN</th>
                          <th className="p-3 text-center">Email ID</th>
                          <th className="p-3 text-center">Action</th>
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
                            <td className="p-3 text-slate-600 whitespace-nowrap">{est.AEO || '—'}</td>
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
        {activeTab === 'search' && (
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

              <div>
                <span className="text-slate-400 font-semibold uppercase flex items-center gap-1 mb-0.5">
                  <Shield size={12} /> Area Enforcement Officer
                </span>
                <p className="font-semibold text-slate-700">{selectedEst.AEO || 'Not assigned'}</p>
              </div>

              {/* INITIATE INQUIRY BUTTON */}
              <div className="pt-4 border-t border-slate-100 mt-4">
                <button
                  onClick={openInitiateModal}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 transition">
                  <Gavel size={16} /> Initiate Inquiry
                </button>
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-12 text-sm">Click on any establishment to select and view details.</p>
          )}
        </div>
        )}
      </div>
      )}

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

      {/* MODAL 1b: AREA ENFORCEMENT OFFICERS DIRECTORY */}
      {showAeoModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 relative">
            <button
              onClick={() => setShowAeoModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="bg-emerald-100 text-emerald-600 p-2.5 rounded-xl">
                <Shield size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Area Enforcement Officers Directory</h3>
                <p className="text-xs text-slate-500">Saved in the database &mdash; available when initiating an inquiry</p>
              </div>
            </div>

            {/* Add New AEO Form */}
            <form onSubmit={handleAddAeo} className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4 flex gap-2 text-xs">
              <input
                type="text"
                placeholder="AEO Name (e.g. Shri A. Sharma)"
                value={newAeo.name}
                onChange={(e) => setNewAeo({ ...newAeo, name: e.target.value })}
                className="flex-1 p-2 border border-slate-300 rounded-lg outline-none font-medium"
                required
              />
              <input
                type="text"
                placeholder="Designation"
                value={newAeo.designation}
                onChange={(e) => setNewAeo({ ...newAeo, designation: e.target.value })}
                className="w-32 p-2 border border-slate-300 rounded-lg outline-none font-semibold"
              />
              <button
                type="submit"
                disabled={isSavingAeo}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-1 disabled:opacity-50">
                <Plus size={14} /> Add
              </button>
            </form>

            {/* AEO List */}
            <div className="max-h-60 overflow-y-auto space-y-2 text-xs">
              {aeoList.length === 0 ? (
                <p className="text-center text-slate-400 py-6">No Area Enforcement Officers added yet.</p>
              ) : aeoList.map((a) => (
                <div key={a.aeo_id} className="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-xl">
                  <div>
                    <p className="font-bold text-slate-800">{a.name}</p>
                    {a.designation && <p className="text-slate-500 text-[11px] font-semibold">{a.designation}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteAeo(a.aeo_id)}
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

              <div>
                <label className="block text-slate-600 mb-1 flex items-center gap-1">
                  <Shield size={13} className="text-emerald-600" /> Area Enforcement Officer (AEO)
                </label>
                <select
                  value={inquiryFormData.aeo}
                  onChange={(e) => setInquiryFormData({ ...inquiryFormData, aeo: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-semibold bg-white text-slate-700">
                  <option value="">-- Choose AEO (optional) --</option>
                  {inquiryFormData.aeo && !aeoList.some(a => aeoOptionLabel(a) === inquiryFormData.aeo) && (
                    <option value={inquiryFormData.aeo}>{inquiryFormData.aeo}</option>
                  )}
                  {aeoList.map((a) => (
                    <option key={a.aeo_id} value={aeoOptionLabel(a)}>{aeoOptionLabel(a)}</option>
                  ))}
                </select>
                {selectedEst.AEO && (
                  <p className="text-[11px] text-emerald-600 mt-1">
                    Jurisdictional AEO for this establishment: <strong>{selectedEst.AEO}</strong>
                  </p>
                )}
                {aeoList.length === 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    No AEOs yet &mdash; add them via the "Area Enforcement Officers" button on the home page.
                  </p>
                )}
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
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 col-span-3">
                <span className="text-slate-400 font-semibold uppercase block">Area Enforcement Officer</span>
                <span className="font-semibold text-slate-700">{rowAeo(selectedCase)}</span>
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
                  <thead className="bg-slate-100 text-base font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="p-2.5 text-center">#</th>
                      <th className="p-2.5 text-center">Hearing Date</th>
                      <th className="p-2.5 text-center">Proceedings</th>
                      <th className="p-2.5 text-center">Next Hearing</th>
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

      {/* MODAL 6: RECORD COLLECTION (PAYMENT RECEIVED) */}
      {showCollectionModal && collectionCase && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-[672px] w-full p-6 shadow-2xl border border-slate-100 relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setShowCollectionModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-teal-100 text-teal-600 p-2.5 rounded-xl">
                <IndianRupee size={22} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Record Payment Received</h3>
                <p className="text-xs text-slate-500 font-mono">{collectionCase.case_no} · {collectionCase.EST_NAME || ''}</p>
              </div>
            </div>

            {(() => {
              const bal = (collectionCase.total_assessed || 0) - (collectionCase.total_collected || 0);
              return (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex justify-between items-center mb-4 text-xs">
                  <span className="text-slate-600 font-bold uppercase">Outstanding Balance Before This Payment</span>
                  <span className="text-teal-700 font-black text-xl">₹{fmtMoney(bal)}</span>
                </div>
              );
            })()}

            <form onSubmit={submitCollection} className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={collectionForm.collection_date}
                    onChange={(e) => setCollectionForm({ ...collectionForm, collection_date: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none font-medium text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Mode of Payment</label>
                  <select
                    value={collectionForm.mode}
                    onChange={(e) => setCollectionForm({ ...collectionForm, mode: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none font-bold bg-white text-sm">
                    <option value="CHEQUE">Cheque</option>
                    <option value="DD">Demand Draft (DD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Cheque / DD No. (Unique)</label>
                  <input
                    type="text"
                    required
                    value={collectionForm.instrument_no}
                    onChange={(e) => setCollectionForm({ ...collectionForm, instrument_no: e.target.value })}
                    placeholder="e.g. 000123"
                    className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none font-bold text-sm"
                  />
                </div>
              </div>

              {/* ACCOUNT-WISE TABLE: Assessed / This Payment / Balance */}
              {(() => {
                const col = collectionCase;
                const dues = [
                  col.account1 || 0, col.account2 || 0, col.account10 || 0,
                  col.account21 || 0, col.account22 || 0, col.total_assessed || 0
                ];
                const alreadyCollected = [
                  col.collected1 || 0, col.collected2 || 0, col.collected10 || 0,
                  col.collected21 || 0, col.collected22 || 0, col.total_collected || 0
                ];
                const thisPay = [
                  parseFloat(collectionForm.account1) || 0,
                  parseFloat(collectionForm.account2) || 0,
                  parseFloat(collectionForm.account10) || 0,
                  parseFloat(collectionForm.account21) || 0,
                  parseFloat(collectionForm.account22) || 0,
                  ACCOUNT_HEADS.reduce((s, h) => s + (parseFloat(collectionForm[h.key]) || 0), 0)
                ];
                const balance = dues.map((d, i) => d - alreadyCollected[i] - thisPay[i]);
                return (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 uppercase text-[10px]">
                          <th className="p-2">A/c Head</th>
                          <th className="p-2 text-right">Assessed Dues</th>
                          <th className="p-2 text-right">Collected Earlier</th>
                          <th className="p-2 text-right">This Payment</th>
                          <th className="p-2 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {ACCOUNT_HEADS.map((h, i) => (
                          <tr key={h.key}>
                            <td className="p-2 font-bold text-slate-700">{h.label}</td>
                            <td className="p-2 text-right font-mono text-slate-600">₹{fmtMoney(dues[i])}</td>
                            <td className="p-2 text-right font-mono text-emerald-700">₹{fmtMoney(alreadyCollected[i])}</td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={collectionForm[h.key]}
                                onChange={(e) => setCollectionForm({ ...collectionForm, [h.key]: e.target.value })}
                                className="w-full max-w-[120px] p-1.5 border border-teal-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none font-medium text-right text-sm"
                              />
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-slate-800">₹{fmtMoney(balance[i])}</td>
                          </tr>
                        ))}
                        <tr className="bg-teal-50/60 font-bold text-sm">
                          <td className="p-2 text-slate-700">Total</td>
                          <td className="p-2 text-right font-mono text-slate-700">₹{fmtMoney(dues[5])}</td>
                          <td className="p-2 text-right font-mono text-emerald-700">₹{fmtMoney(alreadyCollected[5])}</td>
                          <td className="p-2 text-right font-mono text-teal-700">₹{fmtMoney(thisPay[5])}</td>
                          <td className="p-2 text-right font-mono text-slate-800">₹{fmtMoney(balance[5])}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex justify-between items-center">
                <span className="text-slate-600 font-bold uppercase">Total Collected This Payment</span>
                <span className="text-teal-700 font-black text-xl">
                  ₹{fmtMoney(ACCOUNT_HEADS.reduce((s, h) => s + (parseFloat(collectionForm[h.key]) || 0), 0))}
                </span>
              </div>

              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCollectionModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold text-sm">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCollection}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-sm disabled:opacity-50 text-sm">
                  {isSubmittingCollection ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: NIR CAUSE RECORDING */}
      {showNirModal && nirModalCase && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setShowNirModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-rose-100 text-rose-600 p-2.5 rounded-xl">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Mark Case as NIR</h3>
                <p className="text-xs text-slate-500 font-mono">{nirModalCase.case_no} · {nirModalCase.EST_NAME || ''}</p>
              </div>
            </div>

            <form onSubmit={submitNir} className="space-y-4 text-sm font-semibold">
              <div>
                <label className="block text-slate-600 mb-1">Cause of NIR</label>
                <div className="grid grid-cols-2 gap-2">
                  {['High Court', 'CGIT'].map((cause) => (
                    <button
                      key={cause}
                      type="button"
                      onClick={() => setNirForm({ ...nirForm, nir_cause: cause })}
                      className={`p-3 border rounded-xl font-bold transition ${
                        nirForm.nir_cause === cause
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}>
                      {cause}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">Case No.</label>
                  <input
                    type="text"
                    required
                    value={nirForm.nir_case_no}
                    onChange={(e) => setNirForm({ ...nirForm, nir_case_no: e.target.value })}
                    placeholder="e.g. WP(C) 1234/2026"
                    className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none font-medium text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Case Date</label>
                  <input
                    type="date"
                    required
                    value={nirForm.nir_case_date}
                    onChange={(e) => setNirForm({ ...nirForm, nir_case_date: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none font-medium text-sm"
                  />
                </div>
              </div>
              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNirModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold text-sm">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingNir}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-sm disabled:opacity-50 text-sm">
                  {isSavingNir ? 'Saving...' : 'Confirm NIR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: EDIT CASE */}
      {showEditCaseModal && editCase && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setShowEditCaseModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-amber-100 text-amber-600 p-2.5 rounded-xl">
                <Pencil size={22} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Edit Case</h3>
                <p className="text-xs text-slate-500 font-mono">{editCase.case_no} · {editCase.EST_NAME || ''}</p>
              </div>
            </div>

            <form onSubmit={submitCaseEdit} className="space-y-4 text-sm font-semibold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">Section</label>
                  <input
                    type="text"
                    required
                    value={editCaseForm.inquiry_section}
                    onChange={(e) => setEditCaseForm({ ...editCaseForm, inquiry_section: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Status</label>
                  <select
                    value={editCaseForm.status}
                    onChange={(e) => setEditCaseForm({ ...editCaseForm, status: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl outline-none font-semibold bg-white">
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="CONCLUDED">CONCLUDED</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Assessing Officer</label>
                <input
                  type="text"
                  value={editCaseForm.assessing_officer}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, assessing_officer: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl outline-none font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Area Enforcement Officer (AEO)</label>
                <select
                  value={editCaseForm.aeo}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, aeo: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl outline-none font-semibold bg-white">
                  <option value="">-- None --</option>
                  {editCaseForm.aeo && !aeoList.some(a => aeoOptionLabel(a) === editCaseForm.aeo) && (
                    <option value={editCaseForm.aeo}>{editCaseForm.aeo}</option>
                  )}
                  {aeoList.map((a) => (
                    <option key={a.aeo_id} value={aeoOptionLabel(a)}>{aeoOptionLabel(a)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">Period From</label>
                  <input
                    type="text"
                    value={editCaseForm.period_from}
                    onChange={(e) => setEditCaseForm({ ...editCaseForm, period_from: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Period To</label>
                  <input
                    type="text"
                    value={editCaseForm.period_to}
                    onChange={(e) => setEditCaseForm({ ...editCaseForm, period_to: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl outline-none font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Next Date of Hearing</label>
                <input
                  type="date"
                  value={editCaseForm.current_ndh || ''}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, current_ndh: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl outline-none font-medium"
                />
              </div>
              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditCaseModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold text-sm">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCaseEdit}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm disabled:opacity-50 text-sm">
                  {isSavingCaseEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 9: EDIT RED BOOK */}
      {showEditRedbookModal && editRedbook && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setShowEditRedbookModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-rose-100 text-rose-600 p-2.5 rounded-xl">
                <BookOpen size={22} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Edit Red Book Entry</h3>
                <p className="text-xs text-slate-500 font-mono">{editRedbook.case_no} · {editRedbook.EST_NAME || ''}</p>
              </div>
            </div>

            <form onSubmit={submitRedbookEdit} className="space-y-4 text-sm font-semibold">
              <div>
                <label className="block text-slate-600 mb-1">Order Date</label>
                <input
                  type="date"
                  value={editRedbookForm.order_date || ''}
                  onChange={(e) => setEditRedbookForm({ ...editRedbookForm, order_date: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl outline-none font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Amount Assessed (A/c-wise)</label>
                <div className="grid grid-cols-5 gap-2">
                  {ACCOUNT_HEADS.map((h) => (
                    <div key={h.key}>
                      <label className="block text-[10px] text-slate-500 mb-1">{h.label}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editRedbookForm[h.key]}
                        onChange={(e) => setEditRedbookForm({ ...editRedbookForm, [h.key]: parseFloat(e.target.value) || 0 })}
                        className="w-full p-2 border border-slate-300 rounded-lg outline-none font-medium text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditRedbookModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold text-sm">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRedbookEdit}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-sm disabled:opacity-50 text-sm">
                  {isSavingRedbookEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 10: EDIT COLLECTION */}
      {showEditCollectionModal && editCollection && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setShowEditCollectionModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-teal-100 text-teal-600 p-2.5 rounded-xl">
                <IndianRupee size={22} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Edit Collection Entry</h3>
                <p className="text-xs text-slate-500 font-mono">{editCollection.instrument_no || ''} · {editCollection.EST_NAME || ''}</p>
              </div>
            </div>

            <form onSubmit={submitCollectionEdit} className="space-y-4 text-sm font-semibold">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={editCollectionForm.collection_date || ''}
                    onChange={(e) => setEditCollectionForm({ ...editCollectionForm, collection_date: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Mode</label>
                  <select
                    value={editCollectionForm.mode}
                    onChange={(e) => setEditCollectionForm({ ...editCollectionForm, mode: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl outline-none font-semibold bg-white">
                    <option value="CHEQUE">CHEQUE</option>
                    <option value="DD">DD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Chq / DD No.</label>
                  <input
                    type="text"
                    required
                    value={editCollectionForm.instrument_no}
                    onChange={(e) => setEditCollectionForm({ ...editCollectionForm, instrument_no: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl outline-none font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Amount (A/c-wise)</label>
                <div className="grid grid-cols-5 gap-2">
                  {ACCOUNT_HEADS.map((h) => (
                    <div key={h.key}>
                      <label className="block text-[10px] text-slate-500 mb-1">{h.label}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editCollectionForm[h.key]}
                        onChange={(e) => setEditCollectionForm({ ...editCollectionForm, [h.key]: parseFloat(e.target.value) || 0 })}
                        className="w-full p-2 border border-slate-300 rounded-lg outline-none font-medium text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditCollectionModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold text-sm">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCollectionEdit}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-sm disabled:opacity-50 text-sm">
                  {isSavingCollectionEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
      )}
    </>
  );
}

/* ---- LOGIN PAGE ---- */
function LoginPage({ loginForm, setLoginForm, loginError, isLoggingIn, handleLogin }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-blue-700 px-8 py-6 text-center">
            <div className="inline-flex bg-white/20 text-white p-3 rounded-2xl mb-3">
              <Shield size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white">Inquiry & Recovery Portal</h2>
            <p className="text-blue-100 text-sm mt-1 font-medium">EPFO, District Office, Cuttack</p>
          </div>

          <form onSubmit={handleLogin} className="p-8 space-y-5">
            <div>
              <label className="block text-slate-700 font-bold text-sm mb-1.5">Username</label>
              <div className="relative">
                <UserCheck size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  placeholder="Enter username"
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-700 font-bold text-sm mb-1.5">Password</label>
              <div className="relative">
                <ShieldAlert size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="Enter password"
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800"
                />
              </div>
            </div>

            {loginError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm font-semibold">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition disabled:opacity-50 text-base flex items-center justify-center gap-2">
              {isLoggingIn ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
        <p className="text-center text-blue-100 text-xs mt-5 font-medium">
          Authorized personnel only. Unauthorized access is prohibited.
        </p>
      </div>
    </div>
  );
}
