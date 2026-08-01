import sqlite3
import uuid
import os
import calendar
from datetime import date
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="EPFO RO Bhubaneswar Inquiry Portal API", version="3.0")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SQLite Database connection (absolute path so this always works regardless of CWD)
DB_NAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")


def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_column(cursor, table, column, coltype):
    """Add a column to a table if it doesn't already exist (safe migration)."""
    cursor.execute(f"PRAGMA table_info({table})")
    existing_cols = [row["name"] for row in cursor.fetchall()]
    if column not in existing_cols:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")


@app.on_event("startup")
def startup_event():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row["name"] for row in cursor.fetchall()]
    print("--> TABLES FOUND IN DB:", tables)

    if "establishments" not in tables:
        print("--> WARNING: 'establishments' table not found. Run backend/fix_import.py to import the master CSV first.")

    # ---- cases_7a : the "Blue Book" master case register ----
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cases_7a (
            case_no TEXT PRIMARY KEY,
            est_id TEXT,
            inquiry_section TEXT DEFAULT '7A',
            assessing_officer TEXT,
            period_from TEXT,
            period_to TEXT,
            current_ndh TEXT,
            hearing_count INTEGER DEFAULT 1,
            status TEXT DEFAULT 'ACTIVE',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            f8_issued INTEGER DEFAULT 0,
            nir_status TEXT DEFAULT 'IR',
            nir_cause TEXT,
            nir_case_no TEXT,
            nir_case_date TEXT,
            bank_ac_attached INTEGER DEFAULT 0
        )
    """)
    ensure_column(cursor, "cases_7a", "inquiry_section", "TEXT DEFAULT '7A'")
    ensure_column(cursor, "cases_7a", "current_ndh", "TEXT")
    ensure_column(cursor, "cases_7a", "hearing_count", "INTEGER DEFAULT 1")
    ensure_column(cursor, "cases_7a", "status", "TEXT DEFAULT 'ACTIVE'")
    ensure_column(cursor, "cases_7a", "created_at", "TIMESTAMP")
    ensure_column(cursor, "cases_7a", "f8_issued", "INTEGER DEFAULT 0")
    ensure_column(cursor, "cases_7a", "nir_status", "TEXT DEFAULT 'IR'")
    ensure_column(cursor, "cases_7a", "nir_cause", "TEXT")
    ensure_column(cursor, "cases_7a", "nir_case_no", "TEXT")
    ensure_column(cursor, "cases_7a", "nir_case_date", "TEXT")
    ensure_column(cursor, "cases_7a", "bank_ac_attached", "INTEGER DEFAULT 0")

    # ---- hearing_log : sequential line-by-line hearing history per case ----
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hearing_log (
            log_id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_no TEXT,
            hearing_no INTEGER,
            hearing_date TEXT,
            proceedings_summary TEXT,
            next_hearing_date TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Backfill hearing_log #1 for any legacy cases that predate this table
    cursor.execute("""
        SELECT c.case_no, c.current_ndh FROM cases_7a c
        WHERE NOT EXISTS (SELECT 1 FROM hearing_log h WHERE h.case_no = c.case_no)
    """)
    legacy_cases = cursor.fetchall()
    for lc in legacy_cases:
        cursor.execute("""
            INSERT INTO hearing_log (case_no, hearing_no, hearing_date, proceedings_summary, next_hearing_date)
            VALUES (?, 1, ?, 'Inquiry initiated. Summons issued.', ?)
        """, (lc["case_no"], date.today().isoformat(), lc["current_ndh"]))

    # ---- redbook : recovery / defaulter register with EPF account-head-wise dues ----
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='redbook'")
    redbook_exists = cursor.fetchone() is not None
    if redbook_exists:
        cursor.execute("PRAGMA table_info(redbook)")
        cols = [r["name"] for r in cursor.fetchall()]
        if "account1" not in cols:
            cursor.execute("SELECT COUNT(*) as c FROM redbook")
            if cursor.fetchone()["c"] == 0:
                cursor.execute("DROP TABLE redbook")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS redbook (
            case_no TEXT PRIMARY KEY,
            est_id TEXT,
            order_date TEXT,
            account1 REAL DEFAULT 0,
            account2 REAL DEFAULT 0,
            account10 REAL DEFAULT 0,
            account21 REAL DEFAULT 0,
            account22 REAL DEFAULT 0,
            total_assessed REAL DEFAULT 0
        )
    """)
    ensure_column(cursor, "redbook", "order_date", "TEXT")
    ensure_column(cursor, "redbook", "account1", "REAL DEFAULT 0")
    ensure_column(cursor, "redbook", "account2", "REAL DEFAULT 0")
    ensure_column(cursor, "redbook", "account10", "REAL DEFAULT 0")
    ensure_column(cursor, "redbook", "account21", "REAL DEFAULT 0")
    ensure_column(cursor, "redbook", "account22", "REAL DEFAULT 0")
    ensure_column(cursor, "redbook", "total_assessed", "REAL DEFAULT 0")

    # ---- collections : payment received register (cheque / DD) against redbook cases ----
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS collections (
            collection_id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_no TEXT,
            est_id TEXT,
            collection_date TEXT,
            mode TEXT,
            instrument_no TEXT,
            account1 REAL DEFAULT 0,
            account2 REAL DEFAULT 0,
            account10 REAL DEFAULT 0,
            account21 REAL DEFAULT 0,
            account22 REAL DEFAULT 0,
            total_collected REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    ensure_column(cursor, "collections", "instrument_no", "TEXT")

    conn.commit()
    conn.close()


class InquiryRequest(BaseModel):
    est_id: str
    inquiry_section: str
    assessing_officer: str
    period_from: str
    period_to: str
    first_hearing_date: str


class HearingRequest(BaseModel):
    case_no: str
    hearing_date: str
    proceedings_summary: str
    next_hearing_date: Optional[str] = None


class FinalizeRequest(BaseModel):
    case_no: str
    order_date: str
    account1: float = 0
    account2: float = 0
    account10: float = 0
    account21: float = 0
    account22: float = 0


class CollectionRequest(BaseModel):
    case_no: str
    collection_date: str
    mode: str = "CHEQUE"
    instrument_no: str = ""
    account1: float = 0
    account2: float = 0
    account10: float = 0
    account21: float = 0
    account22: float = 0


class CaseTrackingRequest(BaseModel):
    f8_issued: Optional[bool] = None
    nir_status: Optional[str] = None
    nir_cause: Optional[str] = None
    nir_case_no: Optional[str] = None
    nir_case_date: Optional[str] = None
    bank_ac_attached: Optional[bool] = None


def est_columns_select(prefix="e"):
    """Standard aliasing of establishment columns to the names the frontend expects."""
    return f"""
        {prefix}.est_id AS EST_ID,
        {prefix}.est_name AS EST_NAME,
        {prefix}.address1 AS ADDRESS1,
        {prefix}.address2 AS ADDRESS2,
        {prefix}.city AS CITY,
        {prefix}.district_name AS DISTRICT_NAME,
        {prefix}.primary_email AS PRIMARY_EMAIL,
        {prefix}.no_of_uan AS NO_OF_UAN,
        {prefix}.pan AS PAN
    """


@app.get("/api/establishments/search")
def search_establishments(
    q: str = Query("", description="Search term"),
    page: int = 1,
    limit: int = 10
):
    conn = get_db_connection()
    cursor = conn.cursor()
    offset = (page - 1) * limit
    search_pattern = f"%{q.strip()}%" if q.strip() else "%"

    try:
        query = f"""
            SELECT {est_columns_select("establishments")}
            FROM establishments
            WHERE est_id LIKE ? OR est_name LIKE ? OR pan LIKE ?
            LIMIT ? OFFSET ?
        """
        cursor.execute(query, (search_pattern, search_pattern, search_pattern, limit, offset))
        data = [dict(row) for row in cursor.fetchall()]

        count_query = """
            SELECT COUNT(*) as total FROM establishments
            WHERE est_id LIKE ? OR est_name LIKE ? OR pan LIKE ?
        """
        cursor.execute(count_query, (search_pattern, search_pattern, search_pattern))
        total = cursor.fetchone()["total"]
    except Exception as e:
        print("Search/Load error:", e)
        data = []
        total = 0

    conn.close()
    return {"data": data, "total": total}


def fetch_cases(status_filter=None, ndh_today=False, q="", page=1, limit=10):
    conn = get_db_connection()
    cursor = conn.cursor()
    offset = (page - 1) * limit
    search_pattern = f"%{q.strip()}%" if q.strip() else "%"

    where_clauses = ["(e.est_name LIKE ? OR e.est_id LIKE ? OR c.case_no LIKE ?)"]
    params = [search_pattern, search_pattern, search_pattern]

    if status_filter:
        where_clauses.append("c.status = ?")
        params.append(status_filter)
    if ndh_today:
        where_clauses.append("c.current_ndh = ?")
        params.append(str(date.today()))

    where_sql = " AND ".join(where_clauses)

    try:
        query = f"""
            SELECT
                c.case_no, c.est_id, c.inquiry_section, c.assessing_officer,
                c.period_from, c.period_to, c.current_ndh, c.hearing_count, c.status,
                c.f8_issued, c.nir_status, c.nir_cause, c.nir_case_no, c.nir_case_date,
                c.bank_ac_attached,
                substr(c.created_at, 1, 10) AS initiation_date,
                COALESCE(col.amount_received, 0) AS amount_received,
                {est_columns_select("e")}
            FROM cases_7a c
            LEFT JOIN establishments e ON c.est_id = e.est_id
            LEFT JOIN (
                SELECT case_no, SUM(total_collected) AS amount_received
                FROM collections
                GROUP BY case_no
            ) col ON col.case_no = c.case_no
            WHERE {where_sql}
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        """
        cursor.execute(query, (*params, limit, offset))
        data = [dict(row) for row in cursor.fetchall()]

        count_query = f"""
            SELECT COUNT(*) as total
            FROM cases_7a c
            LEFT JOIN establishments e ON c.est_id = e.est_id
            WHERE {where_sql}
        """
        cursor.execute(count_query, params)
        total = cursor.fetchone()["total"]
    except Exception as e:
        print("Cases fetch error:", e)
        data = []
        total = 0

    conn.close()
    return {"data": data, "total": total}


@app.get("/api/bluebook")
def get_bluebook(q: str = "", page: int = 1, limit: int = 10):
    """Full register of all 7A/7B/14B/7Q cases regardless of status."""
    return fetch_cases(status_filter=None, q=q, page=page, limit=limit)


@app.get("/api/7a/active")
def get_active_7a(q: str = "", page: int = 1, limit: int = 10):
    """Cases still pending (not yet finalised)."""
    return fetch_cases(status_filter="ACTIVE", q=q, page=page, limit=limit)


@app.get("/api/hearings/today")
def get_hearings_today(q: str = "", page: int = 1, limit: int = 10):
    """Cases whose Next Date of Hearing (NDH) is today."""
    return fetch_cases(status_filter="ACTIVE", ndh_today=True, q=q, page=page, limit=limit)


@app.get("/api/cases/hearings")
def get_case_hearings(case_no: str = Query(..., description="Case number (URL-encoded if contains slashes)")):
    """Line-by-line hearing history (1st, 2nd, 3rd... hearing) for a given case."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT log_id, case_no, hearing_no, hearing_date, proceedings_summary, next_hearing_date, created_at
        FROM hearing_log
        WHERE case_no = ?
        ORDER BY hearing_no ASC
    """, (case_no,))
    data = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"data": data}


@app.post("/api/cases/{case_no}/tracking")
def update_case_tracking(case_no: str, payload: CaseTrackingRequest):
    """Update operational tracking flags for a case (8F Issued / NIR / Bank A/c Attached)."""
    updates = {}
    if payload.f8_issued is not None:
        updates["f8_issued"] = 1 if payload.f8_issued else 0
    if payload.nir_status is not None:
        updates["nir_status"] = payload.nir_status
    if payload.nir_cause is not None:
        updates["nir_cause"] = payload.nir_cause
    if payload.nir_case_no is not None:
        updates["nir_case_no"] = payload.nir_case_no
    if payload.nir_case_date is not None:
        updates["nir_case_date"] = payload.nir_case_date
    if payload.bank_ac_attached is not None:
        updates["bank_ac_attached"] = 1 if payload.bank_ac_attached else 0

    if not updates:
        raise HTTPException(status_code=400, detail="No tracking fields provided")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT case_no FROM cases_7a WHERE case_no = ?", (case_no,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Case not found")

    set_clause = ", ".join(f"{col} = ?" for col in updates)
    params = list(updates.values()) + [case_no]
    cursor.execute(f"UPDATE cases_7a SET {set_clause} WHERE case_no = ?", params)
    conn.commit()
    conn.close()
    return {"success": True, "case_no": case_no, **updates}


@app.get("/api/redbook")
def get_redbook(q: str = "", page: int = 1, limit: int = 10):
    conn = get_db_connection()
    cursor = conn.cursor()
    offset = (page - 1) * limit
    search_pattern = f"%{q.strip()}%" if q.strip() else "%"

    try:
        query = f"""
            SELECT
                r.case_no, r.est_id, r.order_date,
                r.account1, r.account2, r.account10, r.account21, r.account22, r.total_assessed,
                COALESCE(c.sum1, 0) AS collected1,
                COALESCE(c.sum2, 0) AS collected2,
                COALESCE(c.sum10, 0) AS collected10,
                COALESCE(c.sum21, 0) AS collected21,
                COALESCE(c.sum22, 0) AS collected22,
                COALESCE(c.sum_total, 0) AS total_collected,
                COALESCE(c.collection_count, 0) AS collection_count,
                c.last_collection_date AS last_collection_date,
                c.last_mode AS last_mode,
                c.last_instrument AS last_instrument,
                c7.inquiry_section, c7.assessing_officer, c7.period_from, c7.period_to,
                {est_columns_select("e")}
            FROM redbook r
            LEFT JOIN establishments e ON r.est_id = e.est_id
            LEFT JOIN cases_7a c7 ON r.case_no = c7.case_no
            LEFT JOIN (
                SELECT
                    case_no,
                    SUM(account1) AS sum1,
                    SUM(account2) AS sum2,
                    SUM(account10) AS sum10,
                    SUM(account21) AS sum21,
                    SUM(account22) AS sum22,
                    SUM(total_collected) AS sum_total,
                    COUNT(*) AS collection_count,
                    MAX(collection_date) AS last_collection_date,
                    (SELECT mode FROM collections c2 WHERE c2.case_no = collections.case_no ORDER BY collection_date DESC, collection_id DESC LIMIT 1) AS last_mode,
                    (SELECT instrument_no FROM collections c3 WHERE c3.case_no = collections.case_no ORDER BY collection_date DESC, collection_id DESC LIMIT 1) AS last_instrument
                FROM collections
                GROUP BY case_no
            ) c ON r.case_no = c.case_no
            WHERE (e.est_name LIKE ? OR e.est_id LIKE ? OR r.case_no LIKE ?)
            ORDER BY r.order_date DESC
            LIMIT ? OFFSET ?
        """
        cursor.execute(query, (search_pattern, search_pattern, search_pattern, limit, offset))
        data = [dict(row) for row in cursor.fetchall()]

        count_query = """
            SELECT COUNT(*) as total
            FROM redbook r
            LEFT JOIN establishments e ON r.est_id = e.est_id
            WHERE (e.est_name LIKE ? OR e.est_id LIKE ? OR r.case_no LIKE ?)
        """
        cursor.execute(count_query, (search_pattern, search_pattern, search_pattern))
        total = cursor.fetchone()["total"]
    except Exception as e:
        print("Redbook fetch error:", e)
        data = []
        total = 0

    conn.close()
    return {"data": data, "total": total}


@app.get("/api/collections")
def get_collections(q: str = "", month: str = "", page: int = 1, limit: int = 100):
    """Month-wise collection register. Each row = one payment received (cheque/DD) per establishment."""
    conn = get_db_connection()
    cursor = conn.cursor()
    offset = (page - 1) * limit
    search_pattern = f"%{q.strip()}%" if q.strip() else "%"

    where = []
    params = []
    if q.strip():
        where.append("(e.est_name LIKE ? OR e.est_id LIKE ? OR r.case_no LIKE ?)")
        params += [search_pattern, search_pattern, search_pattern]
    if month:
        where.append("substr(col.collection_date, 1, 7) = ?")
        params.append(month)

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    try:
        query = f"""
            SELECT
                col.collection_id, col.case_no, col.est_id, col.collection_date, col.mode, col.instrument_no,
                col.account1, col.account2, col.account10, col.account21, col.account22, col.total_collected,
                r.order_date,
                c7.inquiry_section, c7.assessing_officer, c7.period_from, c7.period_to,
                {est_columns_select("e")}
            FROM collections col
            LEFT JOIN redbook r ON col.case_no = r.case_no
            LEFT JOIN cases_7a c7 ON col.case_no = c7.case_no
            LEFT JOIN establishments e ON col.est_id = e.est_id
            {where_sql}
            ORDER BY col.collection_date DESC, col.collection_id DESC
            LIMIT ? OFFSET ?
        """
        cursor.execute(query, (*params, limit, offset))
        data = [dict(row) for row in cursor.fetchall()]

        count_query = f"""
            SELECT COUNT(*) as total
            FROM collections col
            LEFT JOIN redbook r ON col.case_no = r.case_no
            LEFT JOIN establishments e ON col.est_id = e.est_id
            {where_sql}
        """
        cursor.execute(count_query, params)
        total = cursor.fetchone()["total"]
    except Exception as e:
        print("Collections fetch error:", e)
        data = []
        total = 0

    conn.close()
    return {"data": data, "total": total}


@app.get("/api/collections/monthly")
def get_collections_monthly(year: Optional[int] = None):
    """Account-wise monthly collection summary for a financial year (April to March)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    today = date.today()
    fy = year if year else (today.year if today.month >= 4 else today.year - 1)

    try:
        cursor.execute("SELECT SUM(total_collected) FROM collections")
        total = cursor.fetchone()[0] or 0
        cursor.execute("SELECT COUNT(*) FROM collections")
        count = cursor.fetchone()[0]
    except Exception as e:
        print("Collections monthly error:", e)
        total, count = 0, 0

    months = []
    for i in range(12):
        if i < 9:
            m = i + 4
            y = fy
        else:
            m = i - 8
            y = fy + 1
        ym = f"{y:04d}-{m:02d}"
        try:
            cursor.execute("""
                SELECT
                    COALESCE(SUM(account1),0) AS a1, COALESCE(SUM(account2),0) AS a2,
                    COALESCE(SUM(account10),0) AS a10, COALESCE(SUM(account21),0) AS a21,
                    COALESCE(SUM(account22),0) AS a22, COALESCE(SUM(total_collected),0) AS total,
                    COUNT(*) AS count
                FROM collections WHERE substr(collection_date,1,7) = ?
            """, (ym,))
            row = cursor.fetchone()
            months.append({
                "month": f"{calendar.month_abbr[m]} {y}",
                "ym": ym,
                "account1": row["a1"], "account2": row["a2"], "account10": row["a10"],
                "account21": row["a21"], "account22": row["a22"],
                "total": row["total"], "count": row["count"],
            })
        except Exception as e:
            print("Collections monthly error:", e)
            months.append({"month": ym, "account1": 0, "account2": 0, "account10": 0,
                           "account21": 0, "account22": 0, "total": 0, "count": 0})

    conn.close()
    return {"fy": f"{fy}-{str(fy + 1)[-2:]}", "months": months, "grand_total": total, "grand_count": count}


@app.post("/api/collections")
def add_collection(req: CollectionRequest):
    """Record a payment received (cheque/DD) against a redbook case.
    Multiple payments allowed for the same establishment/period, but each
    cheque/DD instrument number must be unique."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT est_id FROM redbook WHERE case_no = ?", (req.case_no,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found in Red Book")

        instrument_no = (req.instrument_no or "").strip().upper()
        if not instrument_no:
            raise HTTPException(status_code=400, detail="Cheque/DD number is required")

        cursor.execute(
            "SELECT collection_id FROM collections WHERE case_no = ? AND instrument_no = ?",
            (req.case_no, instrument_no)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail=f"Cheque/DD number {instrument_no} already recorded for this case"
            )

        total = req.account1 + req.account2 + req.account10 + req.account21 + req.account22
        cursor.execute("""
            INSERT INTO collections
                (case_no, est_id, collection_date, mode, instrument_no,
                 account1, account2, account10, account21, account22, total_collected)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            req.case_no, row["est_id"], req.collection_date, req.mode.upper(), instrument_no,
            req.account1, req.account2, req.account10, req.account21, req.account22, total
        ))
        conn.commit()
        return {"success": True, "collection_id": cursor.lastrowid, "total_collected": total}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/dashboard/stats")
def get_dashboard_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) as count FROM cases_7a WHERE status = 'ACTIVE'")
        active_7a_cases = cursor.fetchone()["count"]

        cursor.execute(
            "SELECT COUNT(*) as count FROM cases_7a WHERE status = 'ACTIVE' AND current_ndh = ?",
            (str(date.today()),)
        )
        hearings_today = cursor.fetchone()["count"]

        cursor.execute("SELECT SUM(total_assessed) as total FROM redbook")
        res = cursor.fetchone()["total"]
        total_amount_assessed = res if res else 0

        cursor.execute("SELECT COUNT(*) as count FROM redbook")
        redbook_defaulters = cursor.fetchone()["count"]
    except Exception as e:
        print("Dashboard stats error:", e)
        active_7a_cases = 0
        hearings_today = 0
        total_amount_assessed = 0
        redbook_defaulters = 0
    conn.close()
    return {
        "active_7a_cases": active_7a_cases,
        "hearings_today": hearings_today,
        "total_amount_assessed": total_amount_assessed,
        "redbook_defaulters": redbook_defaulters
    }


@app.get("/api/dashboard/monthly")
def get_monthly_dashboard(year: Optional[int] = None):
    """Monthly running balance of inquiries for a financial year (April to March).
    Opening = carried forward balance, Added = cases initiated in the month,
    Disposed = cases finalised (entered in Red Book) in the month,
    Closing = opening + added - disposed."""
    conn = get_db_connection()
    cursor = conn.cursor()
    today = date.today()
    fy = year if year else (today.year if today.month >= 4 else today.year - 1)

    try:
        cursor.execute("SELECT substr(created_at, 1, 10) AS d FROM cases_7a")
        created_dates = [row["d"] for row in cursor.fetchall() if row["d"]]
        cursor.execute("SELECT order_date AS d FROM redbook")
        disposed_dates = [row["d"] for row in cursor.fetchall() if row["d"]]
    except Exception as e:
        print("Monthly dashboard error:", e)
        created_dates, disposed_dates = [], []
    finally:
        conn.close()

    months = []
    opening = 0
    for i in range(12):
        if i < 9:
            m = i + 4
            y = fy
        else:
            m = i - 8
            y = fy + 1
        first = f"{y:04d}-{m:02d}-01"
        last = f"{y:04d}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"
        if i == 0:
            opening = sum(1 for d in created_dates if d < first) - sum(1 for d in disposed_dates if d < first)
        added = sum(1 for d in created_dates if first <= d <= last)
        disposed = sum(1 for d in disposed_dates if first <= d <= last)
        closing = opening + added - disposed
        months.append({
            "month": f"{calendar.month_abbr[m]} {y}",
            "opening": opening,
            "added": added,
            "disposed": disposed,
            "closing": closing,
        })
        opening = closing

    return {
        "fy": f"{fy}-{str(fy + 1)[-2:]}",
        "months": months,
    }


@app.post("/api/7a/initiate")
def initiate_7a(req: InquiryRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        unique_suffix = uuid.uuid4().hex[:6].upper()
        case_no = f"{req.inquiry_section}-{req.est_id}-{unique_suffix}"
        cursor.execute("""
            INSERT INTO cases_7a
                (case_no, est_id, inquiry_section, assessing_officer, period_from, period_to, current_ndh, hearing_count, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE')
        """, (
            case_no, req.est_id, req.inquiry_section, req.assessing_officer,
            req.period_from, req.period_to, req.first_hearing_date
        ))
        # Automatically record hearing #1 (initiation / summons)
        cursor.execute("""
            INSERT INTO hearing_log (case_no, hearing_no, hearing_date, proceedings_summary, next_hearing_date)
            VALUES (?, 1, ?, ?, ?)
        """, (
            case_no, date.today().isoformat(),
            f"Inquiry initiated under Section {req.inquiry_section}. Summons issued to employer.",
            req.first_hearing_date
        ))
        conn.commit()
        return {"success": True, "case_no": case_no}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/7a/hearing")
def record_hearing(req: HearingRequest):
    """Record the next sequential hearing (2nd, 3rd, 4th...) for an active case."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT hearing_count, status FROM cases_7a WHERE case_no = ?", (req.case_no,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found")
        if row["status"] != "ACTIVE":
            raise HTTPException(status_code=400, detail="Case is already concluded; cannot add more hearings")

        next_no = (row["hearing_count"] or 0) + 1
        cursor.execute("""
            INSERT INTO hearing_log (case_no, hearing_no, hearing_date, proceedings_summary, next_hearing_date)
            VALUES (?, ?, ?, ?, ?)
        """, (req.case_no, next_no, req.hearing_date, req.proceedings_summary, req.next_hearing_date))

        cursor.execute("""
            UPDATE cases_7a SET hearing_count = ?, current_ndh = ? WHERE case_no = ?
        """, (next_no, req.next_hearing_date, req.case_no))

        conn.commit()
        return {"success": True, "hearing_no": next_no}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/7a/finalize")
def finalize_order(req: FinalizeRequest):
    """Issue the final assessment order: totals A/c 1,2,10,21,22, closes the case and enters it into the Red Book."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT est_id, status, hearing_count FROM cases_7a WHERE case_no = ?", (req.case_no,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found")
        if row["status"] != "ACTIVE":
            raise HTTPException(status_code=400, detail="Case is already concluded")

        total = req.account1 + req.account2 + req.account10 + req.account21 + req.account22

        cursor.execute("""
            INSERT INTO redbook (case_no, est_id, order_date, account1, account2, account10, account21, account22, total_assessed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            req.case_no, row["est_id"], req.order_date,
            req.account1, req.account2, req.account10, req.account21, req.account22, total
        ))

        final_hearing_no = (row["hearing_count"] or 0) + 1
        cursor.execute("""
            INSERT INTO hearing_log (case_no, hearing_no, hearing_date, proceedings_summary, next_hearing_date)
            VALUES (?, ?, ?, ?, NULL)
        """, (
            req.case_no, final_hearing_no, req.order_date,
            f"Final assessment order issued. Total dues assessed: Rs.{total:,.2f}. Case concluded & entered into Red Book."
        ))

        cursor.execute("""
            UPDATE cases_7a SET status = 'CONCLUDED', current_ndh = NULL, hearing_count = ? WHERE case_no = ?
        """, (final_hearing_no, req.case_no))

        conn.commit()
        return {"success": True, "total_assessed": total}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
