import os
import sys
import uuid
import calendar
from datetime import date
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Make the backend directory importable regardless of the working directory
# (gunicorn loads this as backend.main, but db.py sits next to this file).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db

app = FastAPI(title="EPFO RO Bhubaneswar Inquiry Portal API", version="3.1")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db_connection():
    return db.get_db_connection()


def ensure_column(cursor, table, column, coltype):
    db.ensure_column(cursor, table, column, coltype)


@app.on_event("startup")
def startup_event():
    conn = get_db_connection()
    try:
        db.create_tables(conn)
        tables = db.list_tables(conn)
        print("--> TABLES FOUND IN DB:", tables)

        if "establishments" not in tables:
            print("--> WARNING: 'establishments' table not found. Run backend/seed_pg.py to migrate data, or backend/fix_import.py for local SQLite.")

        # Backfill hearing_log #1 for any legacy cases that predate this table
        cursor = db.execute(conn, """
            SELECT c.case_no, c.current_ndh FROM cases_7a c
            WHERE NOT EXISTS (SELECT 1 FROM hearing_log h WHERE h.case_no = c.case_no)
        """)
        legacy_cases = cursor.fetchall()
        for lc in legacy_cases:
            db.execute(conn, """
                INSERT INTO hearing_log (case_no, hearing_no, hearing_date, proceedings_summary, next_hearing_date)
                VALUES (?, 1, ?, 'Inquiry initiated. Summons issued.', ?)
            """, (lc["case_no"], date.today().isoformat(), lc["current_ndh"]))

        conn.commit()
    finally:
        conn.close()


class InquiryRequest(BaseModel):
    est_id: str
    inquiry_section: str
    assessing_officer: str
    period_from: str
    period_to: str
    first_hearing_date: str
    aeo: Optional[str] = None


class AeoRequest(BaseModel):
    name: str
    designation: str = ""


class AeoBulkRequest(BaseModel):
    officers: list[AeoRequest]


class EstAeoMapping(BaseModel):
    est_id: str
    aeo: str


class EstAeoImportRequest(BaseModel):
    mappings: list[EstAeoMapping]


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
    # Section 7Q interest rider (14B orders only); account-wise.
    q_account1: float = 0
    q_account2: float = 0
    q_account10: float = 0
    q_account21: float = 0
    q_account22: float = 0


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
    q_account1: float = 0
    q_account2: float = 0
    q_account10: float = 0
    q_account21: float = 0
    q_account22: float = 0


class CaseTrackingRequest(BaseModel):
    f8_issued: Optional[bool] = None
    nir_status: Optional[str] = None
    nir_cause: Optional[str] = None
    nir_case_no: Optional[str] = None
    nir_case_date: Optional[str] = None
    bank_ac_attached: Optional[bool] = None


class CaseEditRequest(BaseModel):
    inquiry_section: Optional[str] = None
    assessing_officer: Optional[str] = None
    aeo: Optional[str] = None
    period_from: Optional[str] = None
    period_to: Optional[str] = None
    current_ndh: Optional[str] = None
    status: Optional[str] = None


class RedBookEditRequest(BaseModel):
    order_date: Optional[str] = None
    account1: Optional[float] = None
    account2: Optional[float] = None
    account10: Optional[float] = None
    account21: Optional[float] = None
    account22: Optional[float] = None
    q_account1: Optional[float] = None
    q_account2: Optional[float] = None
    q_account10: Optional[float] = None
    q_account21: Optional[float] = None
    q_account22: Optional[float] = None


class CollectionEditRequest(BaseModel):
    collection_date: Optional[str] = None
    mode: Optional[str] = None
    instrument_no: Optional[str] = None
    account1: Optional[float] = None
    account2: Optional[float] = None
    account10: Optional[float] = None
    account21: Optional[float] = None
    account22: Optional[float] = None
    q_account1: Optional[float] = None
    q_account2: Optional[float] = None
    q_account10: Optional[float] = None
    q_account21: Optional[float] = None
    q_account22: Optional[float] = None


def est_columns_select(prefix="e"):
    """Standard aliasing of establishment columns to the names the frontend expects."""
    # Alias identifiers are double-quoted so PostgreSQL preserves the exact
    # upper-case names the frontend reads (unquoted identifiers fold to
    # lower-case on Postgres; SQLite keeps them regardless).
    return f"""
        {prefix}.est_id AS "EST_ID",
        {prefix}.est_name AS "EST_NAME",
        {prefix}.address1 AS "ADDRESS1",
        {prefix}.address2 AS "ADDRESS2",
        {prefix}.city AS "CITY",
        {prefix}.district_name AS "DISTRICT_NAME",
        {prefix}.primary_email AS "PRIMARY_EMAIL",
        {prefix}.no_of_uan AS "NO_OF_UAN",
        {prefix}.pan AS "PAN",
        {prefix}.aeo AS "AEO"
    """


@app.get("/api/establishments/search")
def search_establishments(
    q: str = Query("", description="Search term"),
    page: int = 1,
    limit: int = 10
):
    conn = get_db_connection()
    offset = (page - 1) * limit
    search_pattern = f"%{q.strip()}%" if q.strip() else "%"

    try:
        query = f"""
            SELECT {est_columns_select("establishments")}
            FROM establishments
            WHERE est_id LIKE ? OR est_name LIKE ? OR pan LIKE ?
            LIMIT ? OFFSET ?
        """
        cursor = db.execute(conn, query, (search_pattern, search_pattern, search_pattern, limit, offset))
        data = [dict(row) for row in cursor.fetchall()]

        count_query = """
            SELECT COUNT(*) as total FROM establishments
            WHERE est_id LIKE ? OR est_name LIKE ? OR pan LIKE ?
        """
        cursor = db.execute(conn, count_query, (search_pattern, search_pattern, search_pattern))
        total = cursor.fetchone()["total"]
    except Exception as e:
        print("Search/Load error:", e)
        data = []
        total = 0

    conn.close()
    return {"data": data, "total": total}


def fetch_cases(status_filter=None, ndh_today=False, q="", page=1, limit=10):
    conn = get_db_connection()
    offset = (page - 1) * limit
    search_pattern = f"%{q.strip()}%" if q.strip() else "%"

    where_clauses = ["(e.est_name LIKE ? OR e.est_id LIKE ? OR c.case_no LIKE ?)"]
    params = [search_pattern, search_pattern, search_pattern]

    if status_filter:
        where_clauses.append("c.status = ?")
        params.append(status_filter)
        # A case is only "active" if it has NOT been finalised. Any case with
        # a Red Book assessment order is concluded even if its status flag was
        # not updated (legacy data), so exclude it from active views.
        where_clauses.append("NOT EXISTS (SELECT 1 FROM redbook rb WHERE rb.case_no = c.case_no)")
    if ndh_today:
        where_clauses.append("c.current_ndh = ?")
        params.append(str(date.today()))

    where_sql = " AND ".join(where_clauses)

    try:
        query = f"""
            SELECT
                c.case_no, c.est_id, c.inquiry_section, c.assessing_officer, c.aeo,
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
        cursor = db.execute(conn, query, (*params, limit, offset))
        data = [dict(row) for row in cursor.fetchall()]

        count_query = f"""
            SELECT COUNT(*) as total
            FROM cases_7a c
            LEFT JOIN establishments e ON c.est_id = e.est_id
            WHERE {where_sql}
        """
        cursor = db.execute(conn, count_query, params)
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
    cursor = db.execute(conn, """
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
    cursor = db.execute(conn, "SELECT case_no FROM cases_7a WHERE case_no = ?", (case_no,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Case not found")

    set_clause = ", ".join(f"{col} = ?" for col in updates)
    params = list(updates.values()) + [case_no]
    db.execute(conn, f"UPDATE cases_7a SET {set_clause} WHERE case_no = ?", params)
    conn.commit()
    conn.close()
    return {"success": True, "case_no": case_no, **updates}


@app.put("/api/cases/{case_no}")
def update_case(case_no: str, payload: CaseEditRequest):
    """Edit the basic details of a case (Blue Book / Active Inquiries)."""
    updates = {}
    if payload.inquiry_section is not None:
        updates["inquiry_section"] = payload.inquiry_section
    if payload.assessing_officer is not None:
        updates["assessing_officer"] = payload.assessing_officer
    if payload.aeo is not None:
        updates["aeo"] = payload.aeo or None
    if payload.period_from is not None:
        updates["period_from"] = payload.period_from
    if payload.period_to is not None:
        updates["period_to"] = payload.period_to
    if payload.current_ndh is not None:
        updates["current_ndh"] = payload.current_ndh or None
    if payload.status is not None:
        updates["status"] = payload.status

    if not updates:
        raise HTTPException(status_code=400, detail="No case fields provided")

    conn = get_db_connection()
    cursor = db.execute(conn, "SELECT case_no FROM cases_7a WHERE case_no = ?", (case_no,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Case not found")

    set_clause = ", ".join(f"{col} = ?" for col in updates)
    params = list(updates.values()) + [case_no]
    db.execute(conn, f"UPDATE cases_7a SET {set_clause} WHERE case_no = ?", params)
    conn.commit()
    conn.close()
    return {"success": True, "case_no": case_no, **updates}


@app.delete("/api/cases/{case_no}")
def delete_case(case_no: str):
    """Delete a case and its associated hearing log, Red Book entry and collections."""
    conn = get_db_connection()
    cursor = db.execute(conn, "SELECT case_no FROM cases_7a WHERE case_no = ?", (case_no,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Case not found")

    for table in ["hearing_log", "redbook", "collections"]:
        db.execute(conn, f"DELETE FROM {table} WHERE case_no = ?", (case_no,))
    db.execute(conn, "DELETE FROM cases_7a WHERE case_no = ?", (case_no,))
    conn.commit()
    conn.close()
    return {"success": True, "case_no": case_no}


@app.put("/api/redbook/{case_no}")
def update_redbook(case_no: str, payload: RedBookEditRequest):
    """Edit a Red Book entry's order date and account-wise dues."""
    account_keys = [
        "account1", "account2", "account10", "account21", "account22",
        "q_account1", "q_account2", "q_account10", "q_account21", "q_account22",
    ]

    updates = {}
    if payload.order_date is not None:
        updates["order_date"] = payload.order_date
    for key in account_keys:
        val = getattr(payload, key)
        if val is not None:
            updates[key] = val

    if not updates:
        raise HTTPException(status_code=400, detail="No Red Book fields provided")

    conn = get_db_connection()
    cursor = db.execute(
        conn,
        f"SELECT {', '.join(account_keys)}, total_assessed FROM redbook WHERE case_no = ?",
        (case_no,),
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Red Book entry not found")

    if any(k in updates for k in account_keys):
        updates["total_assessed"] = sum(
            (updates.get(k, row[k]) or 0) for k in account_keys
        )

    set_clause = ", ".join(f"{col} = ?" for col in updates)
    params = list(updates.values()) + [case_no]
    db.execute(conn, f"UPDATE redbook SET {set_clause} WHERE case_no = ?", params)
    conn.commit()
    conn.close()
    return {"success": True, "case_no": case_no, **updates}


@app.delete("/api/redbook/{case_no}")
def delete_redbook(case_no: str):
    """Remove a Red Book entry (and its collection payments)."""
    conn = get_db_connection()
    cursor = db.execute(conn, "SELECT case_no FROM redbook WHERE case_no = ?", (case_no,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Red Book entry not found")

    db.execute(conn, "DELETE FROM collections WHERE case_no = ?", (case_no,))
    db.execute(conn, "DELETE FROM redbook WHERE case_no = ?", (case_no,))
    conn.commit()
    conn.close()
    return {"success": True, "case_no": case_no}


@app.put("/api/collections/{collection_id}")
def update_collection(collection_id: int, payload: CollectionEditRequest):
    """Edit a collection entry (payment received)."""
    amount_keys = [
        "account1", "account2", "account10", "account21", "account22",
        "q_account1", "q_account2", "q_account10", "q_account21", "q_account22",
    ]

    updates = {}
    if payload.collection_date is not None:
        updates["collection_date"] = payload.collection_date
    if payload.mode is not None:
        updates["mode"] = payload.mode.upper()
    if payload.instrument_no is not None:
        updates["instrument_no"] = (payload.instrument_no or "").strip().upper()
    for key in amount_keys:
        val = getattr(payload, key)
        if val is not None:
            updates[key] = val

    if not updates:
        raise HTTPException(status_code=400, detail="No collection fields provided")

    conn = get_db_connection()
    cursor = db.execute(conn, "SELECT collection_id, case_no FROM collections WHERE collection_id = ?", (collection_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Collection entry not found")

    # Enforce per-case Cheque/DD number uniqueness (excluding this entry itself).
    if "instrument_no" in updates and updates["instrument_no"]:
        cursor = db.execute(conn, """
            SELECT collection_id FROM collections
            WHERE case_no = ? AND instrument_no = ? AND collection_id != ?
        """, (row["case_no"], updates["instrument_no"], collection_id))
        if cursor.fetchone():
            conn.close()
            raise HTTPException(
                status_code=400,
                detail=f"Cheque/DD number {updates['instrument_no']} already recorded for this case"
            )

    # Recompute the running total for the entry (14B heads + 7Q heads).
    cursor = db.execute(
        conn,
        f"SELECT {', '.join(amount_keys)} FROM collections WHERE collection_id = ?",
        (collection_id,),
    )
    cur = cursor.fetchone()
    updates["total_collected"] = sum((updates.get(k, cur[k]) or 0) for k in amount_keys)

    set_clause = ", ".join(f"{col} = ?" for col in updates)
    params = list(updates.values()) + [collection_id]
    db.execute(conn, f"UPDATE collections SET {set_clause} WHERE collection_id = ?", params)
    conn.commit()
    conn.close()
    return {"success": True, "collection_id": collection_id, **updates}


@app.delete("/api/collections/{collection_id}")
def delete_collection(collection_id: int):
    """Delete a collection entry (payment received)."""
    conn = get_db_connection()
    cursor = db.execute(conn, "SELECT collection_id FROM collections WHERE collection_id = ?", (collection_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Collection entry not found")

    db.execute(conn, "DELETE FROM collections WHERE collection_id = ?", (collection_id,))
    conn.commit()
    conn.close()
    return {"success": True, "collection_id": collection_id}


@app.get("/api/redbook")
def get_redbook(q: str = "", page: int = 1, limit: int = 10):
    conn = get_db_connection()
    offset = (page - 1) * limit
    search_pattern = f"%{q.strip()}%" if q.strip() else "%"

    try:
        query = f"""
            SELECT
                r.case_no, r.est_id, r.order_date,
                r.account1, r.account2, r.account10, r.account21, r.account22, r.total_assessed,
                r.q_account1, r.q_account2, r.q_account10, r.q_account21, r.q_account22,
                COALESCE(c.sum1, 0) AS collected1,
                COALESCE(c.sum2, 0) AS collected2,
                COALESCE(c.sum10, 0) AS collected10,
                COALESCE(c.sum21, 0) AS collected21,
                COALESCE(c.sum22, 0) AS collected22,
                COALESCE(c.qsum1, 0) AS q_collected1,
                COALESCE(c.qsum2, 0) AS q_collected2,
                COALESCE(c.qsum10, 0) AS q_collected10,
                COALESCE(c.qsum21, 0) AS q_collected21,
                COALESCE(c.qsum22, 0) AS q_collected22,
                COALESCE(c.sum_total, 0) AS total_collected,
                COALESCE(c.qsum_total, 0) AS q_total_collected,
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
                    SUM(q_account1) AS qsum1,
                    SUM(q_account2) AS qsum2,
                    SUM(q_account10) AS qsum10,
                    SUM(q_account21) AS qsum21,
                    SUM(q_account22) AS qsum22,
                    SUM(total_collected) AS sum_total,
                    SUM(q_account1 + q_account2 + q_account10 + q_account21 + q_account22) AS qsum_total,
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
        cursor = db.execute(conn, query, (search_pattern, search_pattern, search_pattern, limit, offset))
        data = [dict(row) for row in cursor.fetchall()]

        count_query = """
            SELECT COUNT(*) as total
            FROM redbook r
            LEFT JOIN establishments e ON r.est_id = e.est_id
            WHERE (e.est_name LIKE ? OR e.est_id LIKE ? OR r.case_no LIKE ?)
        """
        cursor = db.execute(conn, count_query, (search_pattern, search_pattern, search_pattern))
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
                col.account1, col.account2, col.account10, col.account21, col.account22,
                col.q_account1, col.q_account2, col.q_account10, col.q_account21, col.q_account22,
                col.total_collected,
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
        cursor = db.execute(conn, query, (*params, limit, offset))
        data = [dict(row) for row in cursor.fetchall()]

        count_query = f"""
            SELECT COUNT(*) as total
            FROM collections col
            LEFT JOIN redbook r ON col.case_no = r.case_no
            LEFT JOIN establishments e ON col.est_id = e.est_id
            {where_sql}
        """
        cursor = db.execute(conn, count_query, params)
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
    today = date.today()
    fy = year if year else (today.year if today.month >= 4 else today.year - 1)

    try:
        cursor = db.execute(conn, "SELECT SUM(total_collected) FROM collections")
        total = cursor.fetchone()[0] or 0
        cursor = db.execute(conn, "SELECT COUNT(*) FROM collections")
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
            cursor = db.execute(conn, """
                SELECT
                    COALESCE(SUM(account1 + q_account1),0) AS a1, COALESCE(SUM(account2 + q_account2),0) AS a2,
                    COALESCE(SUM(account10 + q_account10),0) AS a10, COALESCE(SUM(account21 + q_account21),0) AS a21,
                    COALESCE(SUM(account22 + q_account22),0) AS a22, COALESCE(SUM(total_collected),0) AS total,
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
    try:
        cursor = db.execute(conn, "SELECT est_id FROM redbook WHERE case_no = ?", (req.case_no,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found in Red Book")

        instrument_no = (req.instrument_no or "").strip().upper()
        if not instrument_no:
            raise HTTPException(status_code=400, detail="Cheque/DD number is required")

        cursor = db.execute(conn,
            "SELECT collection_id FROM collections WHERE case_no = ? AND instrument_no = ?",
            (req.case_no, instrument_no)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail=f"Cheque/DD number {instrument_no} already recorded for this case"
            )

        damages = req.account1 + req.account2 + req.account10 + req.account21 + req.account22
        interest = req.q_account1 + req.q_account2 + req.q_account10 + req.q_account21 + req.q_account22
        total = damages + interest
        returning = " RETURNING collection_id" if db.is_postgres() else ""
        cursor = db.execute(conn, f"""
            INSERT INTO collections
                (case_no, est_id, collection_date, mode, instrument_no,
                 account1, account2, account10, account21, account22,
                 q_account1, q_account2, q_account10, q_account21, q_account22,
                 total_collected)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            {returning}
        """, (
            req.case_no, row["est_id"], req.collection_date, req.mode.upper(), instrument_no,
            req.account1, req.account2, req.account10, req.account21, req.account22,
            req.q_account1, req.q_account2, req.q_account10, req.q_account21, req.q_account22,
            total
        ))
        conn.commit()
        collection_id = cursor.fetchone()["collection_id"] if db.is_postgres() else cursor.lastrowid
        return {"success": True, "collection_id": collection_id, "total_collected": total,
                "damages": damages, "interest": interest}
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
    try:
        cursor = db.execute(conn, """
            SELECT COUNT(*) as count FROM cases_7a c
            WHERE c.status = 'ACTIVE'
              AND NOT EXISTS (SELECT 1 FROM redbook rb WHERE rb.case_no = c.case_no)
        """)
        active_7a_cases = cursor.fetchone()["count"]

        cursor = db.execute(conn, """
            SELECT COUNT(*) as count FROM cases_7a c
            WHERE c.status = 'ACTIVE'
              AND c.current_ndh = ?
              AND NOT EXISTS (SELECT 1 FROM redbook rb WHERE rb.case_no = c.case_no)
        """, (str(date.today()),))
        hearings_today = cursor.fetchone()["count"]

        cursor = db.execute(conn, "SELECT SUM(total_assessed) as total FROM redbook")
        res = cursor.fetchone()["total"]
        total_amount_assessed = res if res else 0

        cursor = db.execute(conn, "SELECT COUNT(*) as count FROM redbook")
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
    today = date.today()
    fy = year if year else (today.year if today.month >= 4 else today.year - 1)

    try:
        cursor = db.execute(conn, "SELECT substr(created_at, 1, 10) AS d FROM cases_7a")
        created_dates = [row["d"] for row in cursor.fetchall() if row["d"]]
        cursor = db.execute(conn, "SELECT order_date AS d FROM redbook")
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
            "ym": f"{y:04d}-{m:02d}",
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


@app.get("/api/dashboard/monthly/detail")
def get_monthly_dashboard_detail(month: str = Query(..., description="Month as YYYY-MM")):
    """Establishment-wise breakdown for a single month:
      * added    - inquiries initiated in the month (from cases_7a.created_at)
      * disposed - inquiries finalised in the month (entered into the Red Book)
    """
    conn = get_db_connection()
    try:
        cursor = db.execute(conn, f"""
            SELECT
                c.case_no, c.est_id, c.inquiry_section, c.assessing_officer, c.aeo,
                c.period_from, c.period_to, c.status,
                substr(c.created_at, 1, 10) AS initiation_date,
                {est_columns_select("e")}
            FROM cases_7a c
            LEFT JOIN establishments e ON c.est_id = e.est_id
            WHERE substr(c.created_at, 1, 7) = ?
            ORDER BY c.created_at ASC, c.case_no ASC
        """, (month,))
        added = [dict(row) for row in cursor.fetchall()]

        cursor = db.execute(conn, f"""
            SELECT
                rb.case_no, rb.est_id, rb.order_date, rb.total_assessed,
                rb.account1, rb.account2, rb.account10, rb.account21, rb.account22,
                c.inquiry_section, c.assessing_officer, c.aeo, c.period_from, c.period_to,
                {est_columns_select("e")}
            FROM redbook rb
            LEFT JOIN establishments e ON rb.est_id = e.est_id
            LEFT JOIN cases_7a c ON rb.case_no = c.case_no
            WHERE substr(rb.order_date, 1, 7) = ?
            ORDER BY rb.order_date ASC, rb.case_no ASC
        """, (month,))
        disposed = [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        print("Monthly detail error:", e)
        added, disposed = [], []

    conn.close()
    return {"month": month, "added": added, "disposed": disposed}


# ---------------------------------------------------------------------------
# Area Enforcement Officers (AEO) directory
# ---------------------------------------------------------------------------

@app.get("/api/aeo")
def list_aeo():
    """All Area Enforcement Officers, ordered by name."""
    conn = get_db_connection()
    try:
        cursor = db.execute(conn, "SELECT aeo_id, name, designation FROM aeo ORDER BY name ASC")
        data = [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        print("AEO list error:", e)
        data = []
    conn.close()
    return {"data": data}


@app.post("/api/aeo")
def add_aeo(req: AeoRequest):
    """Add a single Area Enforcement Officer."""
    name = req.name.strip()
    designation = (req.designation or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Officer name is required")

    conn = get_db_connection()
    try:
        cursor = db.execute(
            conn,
            "SELECT aeo_id FROM aeo WHERE lower(name) = lower(?) AND lower(designation) = lower(?)",
            (name, designation),
        )
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail=f"{name} is already in the AEO directory")

        returning = " RETURNING aeo_id" if db.is_postgres() else ""
        cursor = db.execute(
            conn,
            f"INSERT INTO aeo (name, designation) VALUES (?, ?){returning}",
            (name, designation),
        )
        conn.commit()
        aeo_id = cursor.fetchone()["aeo_id"] if db.is_postgres() else cursor.lastrowid
        return {"success": True, "aeo_id": aeo_id, "name": name, "designation": designation}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/aeo/bulk")
def add_aeo_bulk(req: AeoBulkRequest):
    """Insert many AEOs at once (used for spreadsheet imports).
    Exact (name, designation) duplicates - existing or within the batch - are skipped."""
    conn = get_db_connection()
    inserted, skipped = 0, 0
    try:
        cursor = db.execute(conn, "SELECT lower(name) AS n, lower(designation) AS d FROM aeo")
        seen = {(r["n"], r["d"]) for r in cursor.fetchall()}
        for officer in req.officers:
            name = (officer.name or "").strip()
            designation = (officer.designation or "").strip()
            if not name:
                skipped += 1
                continue
            key = (name.lower(), designation.lower())
            if key in seen:
                skipped += 1
                continue
            db.execute(conn, "INSERT INTO aeo (name, designation) VALUES (?, ?)", (name, designation))
            seen.add(key)
            inserted += 1
        conn.commit()
        return {"success": True, "inserted": inserted, "skipped": skipped}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/establishments/aeo/import")
def import_establishment_aeo(req: EstAeoImportRequest):
    """Bulk-assign the jurisdictional AEO to establishments (spreadsheet import).

    Sets establishments.aeo by est_id and makes sure every AEO name used
    also exists in the /api/aeo directory. Safe to re-run.
    """
    conn = get_db_connection()
    updated, missing, directory_added = 0, 0, 0
    try:
        cursor = db.execute(conn, "SELECT lower(name) AS n FROM aeo WHERE designation = '' OR designation IS NULL")
        known = {r["n"] for r in cursor.fetchall()}

        for mp in req.mappings:
            est_id = (mp.est_id or "").strip()
            aeo = (mp.aeo or "").strip()
            if not est_id or not aeo:
                continue

            if aeo.lower() not in known:
                db.execute(conn, "INSERT INTO aeo (name, designation) VALUES (?, '')", (aeo,))
                known.add(aeo.lower())
                directory_added += 1

            cur = db.execute(conn, "UPDATE establishments SET aeo = ? WHERE est_id = ?", (aeo, est_id))
            if cur.rowcount and cur.rowcount > 0:
                updated += cur.rowcount
            else:
                missing += 1

        conn.commit()
        return {
            "success": True,
            "establishments_updated": updated,
            "est_ids_not_found": missing,
            "directory_names_added": directory_added,
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.delete("/api/aeo/{aeo_id}")
def delete_aeo(aeo_id: int):
    """Remove an Area Enforcement Officer from the directory."""
    conn = get_db_connection()
    try:
        cursor = db.execute(conn, "SELECT aeo_id FROM aeo WHERE aeo_id = ?", (aeo_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="AEO not found")
        db.execute(conn, "DELETE FROM aeo WHERE aeo_id = ?", (aeo_id,))
        conn.commit()
        return {"success": True, "aeo_id": aeo_id}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/7a/initiate")
def initiate_7a(req: InquiryRequest):
    conn = get_db_connection()
    try:
        unique_suffix = uuid.uuid4().hex[:6].upper()
        case_no = f"{req.inquiry_section}-{req.est_id}-{unique_suffix}"
        db.execute(conn, """
            INSERT INTO cases_7a
                (case_no, est_id, inquiry_section, assessing_officer, aeo, period_from, period_to, current_ndh, hearing_count, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE')
        """, (
            case_no, req.est_id, req.inquiry_section, req.assessing_officer,
            (req.aeo or None), req.period_from, req.period_to, req.first_hearing_date
        ))
        # Automatically record hearing #1 (initiation / summons)
        db.execute(conn, """
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
    try:
        cursor = db.execute(conn, "SELECT hearing_count, status FROM cases_7a WHERE case_no = ?", (req.case_no,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found")
        if row["status"] != "ACTIVE":
            raise HTTPException(status_code=400, detail="Case is already concluded; cannot add more hearings")

        next_no = (row["hearing_count"] or 0) + 1
        db.execute(conn, """
            INSERT INTO hearing_log (case_no, hearing_no, hearing_date, proceedings_summary, next_hearing_date)
            VALUES (?, ?, ?, ?, ?)
        """, (req.case_no, next_no, req.hearing_date, req.proceedings_summary, req.next_hearing_date))

        db.execute(conn, """
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
    try:
        cursor = db.execute(conn, "SELECT est_id, status, hearing_count FROM cases_7a WHERE case_no = ?", (req.case_no,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found")
        if row["status"] != "ACTIVE":
            raise HTTPException(status_code=400, detail="Case is already concluded")

        damages = req.account1 + req.account2 + req.account10 + req.account21 + req.account22
        interest = req.q_account1 + req.q_account2 + req.q_account10 + req.q_account21 + req.q_account22
        total = damages + interest

        db.execute(conn, """
            INSERT INTO redbook
                (case_no, est_id, order_date,
                 account1, account2, account10, account21, account22,
                 q_account1, q_account2, q_account10, q_account21, q_account22,
                 total_assessed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            req.case_no, row["est_id"], req.order_date,
            req.account1, req.account2, req.account10, req.account21, req.account22,
            req.q_account1, req.q_account2, req.q_account10, req.q_account21, req.q_account22,
            total
        ))

        final_hearing_no = (row["hearing_count"] or 0) + 1
        note = f"Final assessment order issued. Total dues assessed: Rs.{total:,.2f}."
        if interest:
            note = (f"Final assessment order issued. Section 14B damages Rs.{damages:,.2f} + "
                    f"Section 7Q interest Rs.{interest:,.2f} = Rs.{total:,.2f}.")
        db.execute(conn, """
            INSERT INTO hearing_log (case_no, hearing_no, hearing_date, proceedings_summary, next_hearing_date)
            VALUES (?, ?, ?, ?, NULL)
        """, (
            req.case_no, final_hearing_no, req.order_date,
            note + " Case concluded & entered into Red Book."
        ))

        db.execute(conn, """
            UPDATE cases_7a SET status = 'CONCLUDED', current_ndh = NULL, hearing_count = ? WHERE case_no = ?
        """, (final_hearing_no, req.case_no))

        conn.commit()
        return {"success": True, "total_assessed": total, "damages": damages, "interest": interest}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ---- Serve the built React frontend (production) ----
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    print("--> frontend/dist not found; API-only mode (no UI).")
