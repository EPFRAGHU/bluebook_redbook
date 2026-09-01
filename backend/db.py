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
import threading

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

SQLITE_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")

_pg_pool = None
_pg_pool_lock = threading.Lock()


def is_postgres() -> bool:
    return bool(os.environ.get("DATABASE_URL"))


def get_db_connection():
    """Return a connection whose cursor exposes dict-like rows (row['col'])."""
    if is_postgres():
        return _get_pg_connection()
    conn = sqlite3.connect(SQLITE_DB)
    conn.row_factory = sqlite3.Row
    return conn


def _get_pg_connection():
    """Return a pooled PostgreSQL connection (kept alive across requests).

    In production the app is single-process (gunicorn --workers 1), so a small
    in-process pool is enough. The 'close()' call made by callers returns the
    connection to the pool instead of dropping it, avoiding a fresh TCP+TLS
    handshake (and Neon cold-start) on every request.
    """
    global _pg_pool
    dsn = os.environ["DATABASE_URL"]
    if _pg_pool is None:
        with _pg_pool_lock:
            if _pg_pool is None:
                _pg_pool = _create_pool(dsn)
    conn = _pg_pool.getconn()
    conn.cursor_factory = psycopg2.extras.RealDictCursor
    return _PooledPgConnection(conn)


class _PooledPgConnection:
    """Proxy that forwards everything to a psycopg2 connection but routes
    .close() back to the pool so app code can keep calling conn.close()."""

    __slots__ = ("_wrapped",)

    def __init__(self, wrapped):
        self._wrapped = wrapped

    def close(self):
        _return_pg_connection(self._wrapped)

    def __getattr__(self, name):
        return getattr(self._wrapped, name)

    def __enter__(self):
        return self._wrapped.__enter__()

    def __exit__(self, *exc):
        return self._wrapped.__exit__(*exc)


def _return_pg_connection(conn):
    """Return a connection to the in-process pool (idempotent, safe if broken)."""
    try:
        if getattr(conn, "closed", False):
            _pg_pool.putconn(conn, close=True)
        else:
            _pg_pool.putconn(conn)
    except Exception:
        try:
            _pg_pool.putconn(conn, close=True)
        except Exception:
            try:
                conn.close()
            except Exception:
                pass


def close_db_connection(conn):
    """Return a PostgreSQL connection to the pool (or close an SQLite one)."""
    if is_postgres():
        if isinstance(conn, _PooledPgConnection):
            conn.close()
        else:
            _return_pg_connection(conn)
    else:
        try:
            conn.close()
        except Exception:
            pass


def _create_pool(dsn):
    try:
        return ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=dsn,
            connect_timeout=10,
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
    except TypeError:
        # Older psycopg2 doesn't accept cursor_factory in the pool ctor.
        pool = ThreadedConnectionPool(1, 10, dsn, connect_timeout=10)
        return pool


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
