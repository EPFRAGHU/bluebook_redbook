import os

# Base directory
base_dir = "."

# 1. Create directory structure
os.makedirs("backend", exist_ok=True)
os.makedirs("frontend/src", exist_ok=True)
os.makedirs("frontend/public", exist_ok=True)

# 2. backend/main.py
backend_main = """import sqlite3
import pandas as pd
from datetime import date
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os

app = FastAPI(title="EPFO RO Bhubaneswar - Section 7A & Recovery System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "epfo_ro_bbs.db"
CSV_PATH = "downloadest-master-download_data_360_AL_04-03-1952_30-07-2026_0_9999999_0_0_0_0_0_0_0_0_0_0_0_LST_OFC.csv"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name='establishments'")
    if cursor.fetchone()[0] == 0:
        if os.path.exists(CSV_PATH):
            print("Loading and indexing 49,985 establishments from CSV...")
            df = pd.read_csv(CSV_PATH, low_memory=False)
            df.to_sql('establishments', conn, if_exists='replace', index=False)
            cursor.execute("CREATE INDEX idx_est_id ON establishments(EST_ID);")
            cursor.execute("CREATE INDEX idx_est_name ON establishments(EST_NAME);")
            cursor.execute("CREATE INDEX idx_est_pan ON establishments(PAN);")
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS inquiries_7a (
            inquiry_id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_no TEXT UNIQUE,
            est_id TEXT,
            initiation_date TEXT,
            assessing_officer TEXT,
            period_from TEXT,
            period_to TEXT,
            status TEXT DEFAULT 'PENDING',
            current_ndh TEXT
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS hearing_log (
            log_id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_no TEXT,
            hearing_date TEXT,
            proceedings_summary TEXT,
            next_date_of_hearing TEXT,
            adjournment_reason TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS assessment_orders (
            order_id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_no TEXT UNIQUE,
            est_id TEXT,
            order_date TEXT,
            pf_dues REAL,
            edli_dues REAL,
            admin_charges REAL,
            sec_7q_interest REAL,
            sec_14b_damages REAL,
            total_assessed REAL,
            payment_status TEXT DEFAULT 'UNPAID',
            entered_redbook BOOLEAN DEFAULT 0
        )
    ''')
    
    conn.commit()
    conn.close()

init_db()

class Initiate7A(BaseModel):
    est_id: str
    assessing_officer: str
    period_from: str
    period_to: str
    first_hearing_date: str

class HearingRecord(BaseModel):
    case_no: str
    hearing_date: str
    proceedings_summary: str
    next_date_of_hearing: Optional[str] = None
    adjournment_reason: Optional[str] = None

class FinalOrder(BaseModel):
    case_no: str
    order_date: str
    pf_dues: float
    edli_dues: float
    admin_charges: float

@app.get("/api/establishments/search")
def search_establishment(q: str = Query(..., min_length=3)):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(\"\"\"
        SELECT EST_ID, EST_NAME, LIN_CODE, PAN, CITY, DISTRICT_NAME, PRIMARY_EMAIL, EST_STATUS
        FROM establishments 
        WHERE EST_ID LIKE ? OR EST_NAME LIKE ? OR PAN LIKE ?
        LIMIT 25
    \"\"\", (f"%{q}%", f"%{q}%", f"%{q}%"))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/7a/initiate")
def initiate_inquiry(data: Initiate7A):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    year = date.today().year
    cursor.execute("SELECT COUNT(*) FROM inquiries_7a")
    seq = cursor.fetchone()[0] + 1
    case_no = f"7A/RO-BBS/{year}/{seq:04d}"
    
    try:
        cursor.execute(\"\"\"
            INSERT INTO inquiries_7a (case_no, est_id, initiation_date, assessing_officer, period_from, period_to, current_ndh)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        \"\"\", (case_no, data.est_id, date.today().isoformat(), data.assessing_officer, data.period_from, data.period_to, data.first_hearing_date))
        
        cursor.execute(\"\"\"
            INSERT INTO hearing_log (case_no, hearing_date, proceedings_summary, next_date_of_hearing)
            VALUES (?, ?, 'Summons Issued for 7A Inquiry Initiation', ?)
        \"\"\", (case_no, date.today().isoformat(), data.first_hearing_date))
        
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()
        
    return {"message": "7A Inquiry Initiated Successfully", "case_no": case_no}

@app.get("/api/7a/cases")
def list_cases():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(\"\"\"
        SELECT i.*, e.EST_NAME, e.CITY
        FROM inquiries_7a i
        LEFT JOIN establishments e ON i.est_id = e.EST_ID
        ORDER BY i.inquiry_id DESC
    \"\"\")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/7a/adjourn")
def record_hearing(data: HearingRecord):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(\"\"\"
        INSERT INTO hearing_log (case_no, hearing_date, proceedings_summary, next_date_of_hearing, adjournment_reason)
        VALUES (?, ?, ?, ?, ?)
    \"\"\", (data.case_no, data.hearing_date, data.proceedings_summary, data.next_date_of_hearing, data.adjournment_reason))
    
    if data.next_date_of_hearing:
        cursor.execute("UPDATE inquiries_7a SET current_ndh = ? WHERE case_no = ?", (data.next_date_of_hearing, data.case_no))
        
    conn.commit()
    conn.close()
    return {"message": "Blue Book entry updated with hearing proceedings."}

@app.post("/api/7a/final-order")
def issue_final_order(data: FinalOrder):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    subtotal = data.pf_dues + data.edli_dues + data.admin_charges
    sec_7q_interest = round(subtotal * 0.12, 2)
    sec_14b_damages = round(subtotal * 0.15, 2)
    total = subtotal + sec_7q_interest + sec_14b_damages
    
    cursor.execute(\"\"\"
        INSERT INTO assessment_orders (case_no, est_id, order_date, pf_dues, edli_dues, admin_charges, sec_7q_interest, sec_14b_damages, total_assessed, entered_redbook)
        SELECT ?, est_id, ?, ?, ?, ?, ?, ?, ?, 1 FROM inquiries_7a WHERE case_no = ?
    \"\"\", (data.case_no, data.order_date, data.pf_dues, data.edli_dues, data.admin_charges, sec_7q_interest, sec_14b_damages, total, data.case_no))
    
    cursor.execute("UPDATE inquiries_7a SET status = 'CONCLUDED', current_ndh = NULL WHERE case_no = ?", (data.case_no,))
    
    conn.commit()
    conn.close()
    return {
        "message": "Final 7A Assessment Order Issued & Added to Red Book",
        "total_assessed": total,
        "sec_7q_interest": sec_7q_interest,
        "sec_14b_damages": sec_14b_damages
    }

@app.get("/api/redbook")
def get_redbook():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(\"\"\"
        SELECT a.*, e.EST_NAME, e.PRIMARY_EMAIL, e.CITY, e.DISTRICT_NAME
        FROM assessment_orders a
        LEFT JOIN establishments e ON a.est_id = e.EST_ID
        WHERE a.entered_redbook = 1
        ORDER BY a.order_id DESC
    \"\"\")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/dashboard/stats")
def get_dashboard_stats():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM inquiries_7a WHERE status = 'PENDING'")
    active_cases = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM inquiries_7a WHERE current_ndh = ?", (date.today().isoformat(),))
    today_hearings = cursor.fetchone()[0]
    
    cursor.execute("SELECT SUM(total_assessed) FROM assessment_orders")
    total_assessed = cursor.fetchone()[0] or 0.0
    
    cursor.execute("SELECT COUNT(*) FROM assessment_orders WHERE entered_redbook = 1 AND payment_status = 'UNPAID'")
    redbook_defaulters = cursor.fetchone()[0]
    
    conn.close()
    return {
        "active_7a_cases": active_cases,
        "hearings_today": today_hearings,
        "total_amount_assessed": total_assessed,
        "redbook_defaulters": redbook_defaulters
    }
"""

with open("backend/main.py", "w", encoding="utf-8") as f:
    f.write(backend_main)

# 3. frontend/package.json
package_json = """{
  "name": "epfo-7a-recovery-portal",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.263.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.15",
    "@types/react-dom": "^18.2.7",
    "@vitejs/plugin-react": "^4.0.3",
    "autoprefixer": "^10.4.14",
    "postcss": "^8.4.27",
    "tailwindcss": "^3.3.3",
    "vite": "^4.4.5"
  }
}
"""

with open("frontend/package.json", "w", encoding="utf-8") as f:
    f.write(package_json)

# 4. frontend/vite.config.js
vite_config = """import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
})
"""

with open("frontend/vite.config.js", "w", encoding="utf-8") as f:
    f.write(vite_config)

# 5. frontend/src/index.css
index_css = """@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: #f8fafc;
}
"""

with open("frontend/src/index.css", "w", encoding="utf-8") as f:
    f.write(index_css)

# 6. frontend/src/App.jsx
app_jsx = """import React, { useState, useEffect } from 'react';
import { Search, Gavel, FileText, AlertTriangle, Calendar, PlusCircle, BookOpen, ShieldAlert } from 'lucide-react';

export default function App() {
  const [stats, setStats] = useState({ active_7a_cases: 0, hearings_today: 0, total_amount_assessed: 0, redbook_defaulters: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeTab, setActiveTab] = useState('search');
  const [cases, setCases] = useState([]);
  const [redbook, setRedbook] = useState([]);
  
  const [selectedEst, setSelectedEst] = useState(null);
  const [initForm, setInitForm] = useState({ assessing_officer: 'APFC Inquiry-I', period_from: '2023-04', period_to: '2025-03', first_hearing_date: '' });
  
  const [adjournCase, setAdjournCase] = useState(null);
  const [adjournForm, setAdjournForm] = useState({ hearing_date: new Date().toISOString().split('T')[0], proceedings_summary: '', next_date_of_hearing: '', adjournment_reason: '' });

  const [finalOrderCase, setFinalOrderCase] = useState(null);
  const [orderForm, setOrderForm] = useState({ order_date: new Date().toISOString().split('T')[0], pf_dues: 0, edli_dues: 0, admin_charges: 0 });

  const fetchStats = () => {
    fetch('http://localhost:8000/api/dashboard/stats').then(res => res.json()).then(setStats).catch(console.error);
  };

  const fetchCases = () => {
    fetch('http://localhost:8000/api/7a/cases').then(res => res.json()).then(setCases).catch(console.error);
  };

  const fetchRedbook = () => {
    fetch('http://localhost:8000/api/redbook').then(res => res.json()).then(setRedbook).catch(console.error);
  };

  useEffect(() => {
    fetchStats();
    fetchCases();
    fetchRedbook();
  }, []);

  const handleSearch = async (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    if (val.length >= 3) {
      const res = await fetch(`http://localhost:8000/api/establishments/search?q=${val}`);
      const data = await res.json();
      setSearchResults(data);
    } else {
      setSearchResults([]);
    }
  };

  const submitInitiation = async (e) => {
    e.preventDefault();
    const res = await fetch('http://localhost:8000/api/7a/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ est_id: selectedEst.EST_ID, ...initForm })
    });
    if (res.ok) {
      alert("7A Inquiry Initiated Successfully!");
      setSelectedEst(null);
      fetchStats();
      fetchCases();
      setActiveTab('bluebook');
    }
  };

  const submitAdjournment = async (e) => {
    e.preventDefault();
    const res = await fetch('http://localhost:8000/api/7a/adjourn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ case_no: adjournCase.case_no, ...adjournForm })
    });
    if (res.ok) {
      alert("Blue Book updated with NDH & Adjournment record.");
      setAdjournCase(null);
      fetchStats();
      fetchCases();
    }
  };

  const submitFinalOrder = async (e) => {
    e.preventDefault();
    const res = await fetch('http://localhost:8000/api/7a/final-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_no: finalOrderCase.case_no,
        order_date: orderForm.order_date,
        pf_dues: parseFloat(orderForm.pf_dues),
        edli_dues: parseFloat(orderForm.edli_dues),
        admin_charges: parseFloat(orderForm.admin_charges)
      })
    });
    if (res.ok) {
      const data = await res.json();
      alert(`Final 7A Assessment Order Issued!\\nTotal Assessed: ₹${data.total_assessed.toLocaleString('en-IN')}\\nTransferred to Red Book.`);
      setFinalOrderCase(null);
      fetchStats();
      fetchCases();
      fetchRedbook();
      setActiveTab('redbook');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 font-sans">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">EPFO RO Bhubaneswar</span>
            <span className="text-xs text-slate-400">Office ID: 360</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">Section 7A Inquiry & Defaulter Recovery Portal</h1>
          <p className="text-sm text-slate-500">Quasi-Judicial Cause List (Blue Book) & Defaulter Register (Red Book)</p>
        </div>
        <div className="mt-4 md:mt-0 flex gap-3">
          <button 
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${activeTab === 'search' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Master Search
          </button>
          <button 
            onClick={() => { fetchCases(); setActiveTab('bluebook'); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition ${activeTab === 'bluebook' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            <BookOpen size={16} /> Blue Book (Cause List)
          </button>
          <button 
            onClick={() => { fetchRedbook(); setActiveTab('redbook'); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition ${activeTab === 'redbook' ? 'bg-rose-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            <ShieldAlert size={16} /> Red Book (Defaulters)
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard title="Active 7A Inquiries" value={stats.active_7a_cases} icon={<Gavel className="text-blue-600" />} color="bg-blue-50 border-blue-100" />
        <StatCard title="Hearings Today" value={stats.hearings_today} icon={<Calendar className="text-amber-600" />} color="bg-amber-50 border-amber-100" />
        <StatCard title="Total Dues Assessed" value={`₹ ${stats.total_amount_assessed.toLocaleString('en-IN')}`} icon={<FileText className="text-emerald-600" />} color="bg-emerald-50 border-emerald-100" />
        <StatCard title="Red Book Defaulters" value={stats.redbook_defaulters} icon={<AlertTriangle className="text-rose-600" />} color="bg-rose-50 border-rose-100" />
      </div>

      {activeTab === 'search' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Search size={20} className="text-blue-600" /> Establishment Master File (49,985 Records)
          </h2>
          <div className="relative mb-6">
            <input
              type="text"
              placeholder="Search by Establishment ID (e.g. ORBBS...), Company Name, or PAN..."
              value={searchTerm}
              onChange={handleSearch}
              className="w-full pl-4 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 shadow-sm"
            />
          </div>

          {searchResults.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="p-3">Est. ID</th>
                    <th className="p-3">Establishment Name</th>
                    <th className="p-3">PAN / LIN</th>
                    <th className="p-3">Location</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100">
                  {searchResults.map((est) => (
                    <tr key={est.EST_ID} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-blue-600 font-bold">{est.EST_ID}</td>
                      <td className="p-3 font-medium text-slate-800">{est.EST_NAME}</td>
                      <td className="p-3 text-slate-500">{est.PAN} / {est.LIN_CODE}</td>
                      <td className="p-3 text-slate-600">{est.CITY}, {est.DISTRICT_NAME}</td>
                      <td className="p-3"><span className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-medium">{est.EST_STATUS}</span></td>
                      <td className="p-3">
                        <button
                          onClick={() => setSelectedEst(est)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm">
                          <PlusCircle size={14} /> Initiate 7A
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-slate-400 py-12">Type at least 3 characters to search establishments across RO Bhubaneswar...</p>
          )}
        </div>
      )}

      {activeTab === 'bluebook' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <BookOpen size={20} className="text-blue-600" /> Blue Book - Active 7A Inquiries & Cause List
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-3">Case Reference</th>
                  <th className="p-3">Establishment</th>
                  <th className="p-3">Assessing Officer</th>
                  <th className="p-3">Period</th>
                  <th className="p-3">Next Date of Hearing (NDH)</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {cases.map((c) => (
                  <tr key={c.case_no} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-blue-600 font-bold">{c.case_no}</td>
                    <td className="p-3 font-medium">{c.EST_NAME} <span className="block text-xs font-mono text-slate-400">{c.est_id}</span></td>
                    <td className="p-3 text-slate-600">{c.assessing_officer}</td>
                    <td className="p-3 text-slate-500">{c.period_from} to {c.period_to}</td>
                    <td className="p-3 font-semibold text-amber-600">{c.current_ndh || 'N/A'}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${c.status === 'CONCLUDED' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-800'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="p-3 flex gap-2">
                      {c.status !== 'CONCLUDED' && (
                        <>
                          <button onClick={() => setAdjournCase(c)} className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded text-xs font-medium">
                            Adjourn / Log
                          </button>
                          <button onClick={() => setFinalOrderCase(c)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-xs font-medium">
                            Final Order
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'redbook' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-rose-700 mb-4 flex items-center gap-2">
            <ShieldAlert size={20} className="text-rose-600" /> Red Book - Recovery & Defaulter Register
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-3">Case / Est ID</th>
                  <th className="p-3">Establishment Name</th>
                  <th className="p-3">PF Principal</th>
                  <th className="p-3">7Q Interest (12%)</th>
                  <th className="p-3">14B Damages</th>
                  <th className="p-3">Total Recovery Dues</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {redbook.map((r) => (
                  <tr key={r.case_no} className="hover:bg-rose-50/30">
                    <td className="p-3 font-mono font-bold text-slate-800">{r.case_no}<span className="block text-xs font-normal text-slate-400">{r.est_id}</span></td>
                    <td className="p-3 font-medium">{r.EST_NAME}<span className="block text-xs text-slate-500">{r.CITY}, {r.DISTRICT_NAME}</span></td>
                    <td className="p-3 font-mono">₹{r.pf_dues.toLocaleString('en-IN')}</td>
                    <td className="p-3 font-mono text-amber-700">₹{r.sec_7q_interest.toLocaleString('en-IN')}</td>
                    <td className="p-3 font-mono text-rose-700">₹{r.sec_14b_damages.toLocaleString('en-IN')}</td>
                    <td className="p-3 font-mono font-bold text-emerald-700 text-base">₹{r.total_assessed.toLocaleString('en-IN')}</td>
                    <td className="p-3"><span className="text-xs px-2.5 py-1 bg-rose-100 text-rose-800 rounded-full font-bold">CP-1 ISSUED</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedEst && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Initiate Section 7A Inquiry</h3>
            <p className="text-sm text-slate-500 mb-4">{selectedEst.EST_NAME} ({selectedEst.EST_ID})</p>
            <form onSubmit={submitInitiation} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Assessing Officer</label>
                <input type="text" value={initForm.assessing_officer} onChange={e => setInitForm({...initForm, assessing_officer: e.target.value})} className="w-full border p-2 rounded-lg text-sm" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Period From</label>
                  <input type="month" value={initForm.period_from} onChange={e => setInitForm({...initForm, period_from: e.target.value})} className="w-full border p-2 rounded-lg text-sm" required />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Period To</label>
                  <input type="month" value={initForm.period_to} onChange={e => setInitForm({...initForm, period_to: e.target.value})} className="w-full border p-2 rounded-lg text-sm" required />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">First Hearing Date (NDH)</label>
                <input type="date" value={initForm.first_hearing_date} onChange={e => setInitForm({...initForm, first_hearing_date: e.target.value})} className="w-full border p-2 rounded-lg text-sm" required />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setSelectedEst(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">Issue Summons</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {adjournCase && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Record Proceeding / Adjournment</h3>
            <p className="text-sm text-slate-500 mb-4">Case: {adjournCase.case_no}</p>
            <form onSubmit={submitAdjournment} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Hearing Date</label>
                <input type="date" value={adjournForm.hearing_date} onChange={e => setAdjournForm({...adjournForm, hearing_date: e.target.value})} className="w-full border p-2 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Proceedings Summary</label>
                <textarea rows="3" value={adjournForm.proceedings_summary} onChange={e => setAdjournForm({...adjournForm, proceedings_summary: e.target.value})} className="w-full border p-2 rounded-lg text-sm" placeholder="Employer requested time for filing balance sheet..." required />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Next Date of Hearing (NDH)</label>
                <input type="date" value={adjournForm.next_date_of_hearing} onChange={e => setAdjournForm({...adjournForm, next_date_of_hearing: e.target.value})} className="w-full border p-2 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Adjournment Reason</label>
                <input type="text" value={adjournForm.adjournment_reason} onChange={e => setAdjournForm({...adjournForm, adjournment_reason: e.target.value})} className="w-full border p-2 rounded-lg text-sm" placeholder="On request of employer advocate" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAdjournCase(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold">Save to Blue Book</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {finalOrderCase && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Issue Final 7A Assessment Order</h3>
            <p className="text-sm text-slate-500 mb-4">Case: {finalOrderCase.case_no}</p>
            <form onSubmit={submitFinalOrder} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Order Date</label>
                <input type="date" value={orderForm.order_date} onChange={e => setOrderForm({...orderForm, order_date: e.target.value})} className="w-full border p-2 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">PF Principal Dues (₹)</label>
                <input type="number" value={orderForm.pf_dues} onChange={e => setOrderForm({...orderForm, pf_dues: e.target.value})} className="w-full border p-2 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">EDLI Dues (₹)</label>
                <input type="number" value={orderForm.edli_dues} onChange={e => setOrderForm({...orderForm, edli_dues: e.target.value})} className="w-full border p-2 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Admin Charges (₹)</label>
                <input type="number" value={orderForm.admin_charges} onChange={e => setOrderForm({...orderForm, admin_charges: e.target.value})} className="w-full border p-2 rounded-lg text-sm" required />
              </div>
              <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600 space-y-1">
                <p>• <strong>Sec 7Q Interest:</strong> Auto-calculated @ 12% p.a.</p>
                <p>• <strong>Sec 14B Penalties:</strong> Auto-calculated @ statutory rate.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFinalOrderCase(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold">Issue Order & Enter Red Book</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <div className={`p-5 rounded-2xl border flex items-center justify-between ${color} shadow-sm`}>
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-black text-slate-800 mt-1">{value}</p>
      </div>
      <div className="p-3 bg-white rounded-xl shadow-sm">{icon}</div>
    </div>
  );
}
"""

with open("frontend/src/App.jsx", "w", encoding="utf-8") as f:
    f.write(app_jsx)

# 7. frontend/src/main.jsx
main_jsx = """import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
"""

with open("frontend/src/main.jsx", "w", encoding="utf-8") as f:
    f.write(main_jsx)

# 8. frontend/index.html
index_html = """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EPFO RO Bhubaneswar - 7A & Recovery System</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
"""

with open("frontend/index.html", "w", encoding="utf-8") as f:
    f.write(index_html)

# 9. frontend/tailwind.config.js
tailwind_config = """/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
"""

with open("frontend/tailwind.config.js", "w", encoding="utf-8") as f:
    f.write(tailwind_config)

# 10. frontend/postcss.config.js
postcss_config = """export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
"""

with open("frontend/postcss.config.js", "w", encoding="utf-8") as f:
    f.write(postcss_config)

print("Project files and folders created successfully!")