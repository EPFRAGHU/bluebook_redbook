"""Database abstraction layer.

Supports two backends transparently:

* PostgreSQL  - used in production (Render). Enabled when the DATABASE_URL
                environment variable is set.
* SQLite      - used for local development. Fallback when DATABASE_URL is absent.

All SQL written by the rest of the application uses `?` placeholders and SQLite
dialect; the execute() helper translates them to PostgreSQL syntax on the fly.
"""

import os
import sqlite3

import psycopg2
import psycopg2.extras

SQLITE_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")


def is_postgres() -> bool:
    return bool(os.environ.get("DATABASE_URL"))


def get_db_connection():
    """Return a connection whose cursor exposes dict-like rows (row['col'])."""
    if is_postgres():
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        conn.cursor_factory = psycopg2.extras.RealDictCursor
        return conn
    conn = sqlite3.connect(SQLITE_DB)
    conn.row_factory = sqlite3.Row
    return conn


def _translate(sql: str) -> str:
    """Convert SQLite-dialect SQL to PostgreSQL syntax when needed."""
    if not is_postgres():
        return sql
    sql = sql.replace("?", "%s")
    # SQLite LIKE is case-insensitive by default; Postgres LIKE is not.
    # Use ILIKE so name/case searches behave the same on both backends.
    sql = sql.replace(" LIKE %s", " ILIKE %s")
    return sql


def execute(conn, sql, params=()):
    """Run a query using `?` placeholders, returning the cursor.

    Usage:
        cursor = execute(conn, "SELECT ... WHERE id = ?", (id,))
        rows = cursor.fetchall()
    """
    if not isinstance(params, (tuple, list)):
        params = (params,)
    cursor = conn.cursor()
    cursor.execute(_translate(sql), params)
    return cursor


def list_tables(conn):
    cur = conn.cursor()
    if is_postgres():
        cur.execute("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'")
    else:
        cur.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    return [r["name"] for r in cur.fetchall()]


def list_columns(conn, table):
    """Return the list of column names for a table."""
    cur = conn.cursor()
    if is_postgres():
        cur.execute(
            "SELECT column_name AS name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = %s",
            (table,),
        )
    else:
        cur.execute(f"PRAGMA table_info({table})")
    return [r["name"] for r in cur.fetchall()]


def ensure_column(conn, table, column, coltype):
    """Add a column to a table if it doesn't already exist (safe migration)."""
    cols = list_columns(conn, table)
    if column not in cols:
        pg_type = coltype.replace("REAL", "DOUBLE PRECISION") if is_postgres() else coltype
        cur = conn.cursor()
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {pg_type}")


def create_tables(conn):
    """Idempotent schema bootstrap. Called at startup and by the seed script."""
    if is_postgres():
        autoinc = "BIGSERIAL PRIMARY KEY"
    else:
        autoinc = "INTEGER PRIMARY KEY AUTOINCREMENT"

    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS establishments (
            est_id TEXT PRIMARY KEY,
            est_name TEXT,
            address1 TEXT,
            address2 TEXT,
            city TEXT,
            district_name TEXT,
            primary_email TEXT,
            no_of_uan INTEGER DEFAULT 0,
            pan TEXT
        )
    """)

    cur.execute("""
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
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            f8_issued INTEGER DEFAULT 0,
            nir_status TEXT DEFAULT 'IR',
            nir_cause TEXT,
            nir_case_no TEXT,
            nir_case_date TEXT,
            bank_ac_attached INTEGER DEFAULT 0
        )
    """)
    for col, typ in [
        ("inquiry_section", "TEXT DEFAULT '7A'"),
        ("current_ndh", "TEXT"),
        ("hearing_count", "INTEGER DEFAULT 1"),
        ("status", "TEXT DEFAULT 'ACTIVE'"),
        ("created_at", "TEXT"),
        ("f8_issued", "INTEGER DEFAULT 0"),
        ("nir_status", "TEXT DEFAULT 'IR'"),
        ("nir_cause", "TEXT"),
        ("nir_case_no", "TEXT"),
        ("nir_case_date", "TEXT"),
        ("bank_ac_attached", "INTEGER DEFAULT 0"),
    ]:
        ensure_column(conn, "cases_7a", col, typ)

    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS hearing_log (
            log_id {autoinc},
            case_no TEXT,
            hearing_no INTEGER,
            hearing_date TEXT,
            proceedings_summary TEXT,
            next_hearing_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS redbook (
            case_no TEXT PRIMARY KEY,
            est_id TEXT,
            order_date TEXT,
            account1 DOUBLE PRECISION DEFAULT 0,
            account2 DOUBLE PRECISION DEFAULT 0,
            account10 DOUBLE PRECISION DEFAULT 0,
            account21 DOUBLE PRECISION DEFAULT 0,
            account22 DOUBLE PRECISION DEFAULT 0,
            total_assessed DOUBLE PRECISION DEFAULT 0
        )
    """)
    for col, typ in [
        ("order_date", "TEXT"),
        ("account1", "REAL DEFAULT 0"),
        ("account2", "REAL DEFAULT 0"),
        ("account10", "REAL DEFAULT 0"),
        ("account21", "REAL DEFAULT 0"),
        ("account22", "REAL DEFAULT 0"),
        ("total_assessed", "REAL DEFAULT 0"),
        # Section 7Q interest rider on a 14B order, account-wise. Zero for
        # non-14B cases. total_assessed = SUM(account*) + SUM(q_account*).
        ("q_account1", "REAL DEFAULT 0"),
        ("q_account2", "REAL DEFAULT 0"),
        ("q_account10", "REAL DEFAULT 0"),
        ("q_account21", "REAL DEFAULT 0"),
        ("q_account22", "REAL DEFAULT 0"),
    ]:
        ensure_column(conn, "redbook", col, typ)

    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS collections (
            collection_id {autoinc},
            case_no TEXT,
            est_id TEXT,
            collection_date TEXT,
            mode TEXT,
            instrument_no TEXT,
            account1 DOUBLE PRECISION DEFAULT 0,
            account2 DOUBLE PRECISION DEFAULT 0,
            account10 DOUBLE PRECISION DEFAULT 0,
            account21 DOUBLE PRECISION DEFAULT 0,
            account22 DOUBLE PRECISION DEFAULT 0,
            total_collected DOUBLE PRECISION DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    ensure_column(conn, "collections", "instrument_no", "TEXT")
    # Payment applied to the Section 7Q interest portion of a 14B case,
    # account-wise. Zero for non-14B payments.
    for col in ("q_account1", "q_account2", "q_account10", "q_account21", "q_account22"):
        ensure_column(conn, "collections", col, "REAL DEFAULT 0")

    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS aeo (
            aeo_id {autoinc},
            name TEXT NOT NULL,
            designation TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Area Enforcement Officer selected for an inquiry.
    ensure_column(conn, "cases_7a", "aeo", "TEXT")
    # Jurisdictional Area Enforcement Officer for the establishment.
    ensure_column(conn, "establishments", "aeo", "TEXT")

    conn.commit()
