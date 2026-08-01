"""One-time migration: copy all data from the local SQLite database into PostgreSQL.

Usage:
    DATABASE_URL=postgresql://user:pass@host:5432/dbname python backend/seed_pg.py

The target PostgreSQL must already exist (create it on Render, then use its
Internal/External connection string as DATABASE_URL).
"""

import os
import sqlite3

from psycopg2.extras import execute_values

import db


def source_sqlite_connection():
    return sqlite3.connect(db.SQLITE_DB)


def copy_table(src_conn, dst_conn, table, columns, batch_size=2000):
    src = src_conn.cursor()
    dst = dst_conn.cursor()
    src.execute(f"SELECT {', '.join(columns)} FROM {table}")

    col_sql = ", ".join(columns)
    sql = f"INSERT INTO {table} ({col_sql}) VALUES %s"

    inserted = 0
    while True:
        rows = src.fetchmany(batch_size)
        if not rows:
            break
        # execute_values takes a list of tuples; uses multi-row VALUES (...),(...)
        execute_values(dst, sql, [tuple(r) for r in rows], page_size=1000)
        inserted += len(rows)
        dst_conn.commit()
        print(f"  {table}: {inserted} rows...")

    print(f"  {table}: {inserted} rows copied (total)")
    return inserted


def main():
    if not db.is_postgres():
        raise SystemExit(
            "DATABASE_URL environment variable not set. "
            "Point it at the target PostgreSQL database and retry."
        )

    dst = db.get_db_connection()
    dst_conn = dst  # psycopg2 connection
    print("Connected to target PostgreSQL.")

    db.create_tables(dst_conn)
    print("Schema ready on target.")

    src = source_sqlite_connection()
    print("Opened source SQLite database.")

    # Explicit column lists (avoid relying on auto-increment id ordering).
    tables = {
        "establishments": [
            "est_id", "est_name", "address1", "address2", "city",
            "district_name", "primary_email", "no_of_uan", "pan",
        ],
        "cases_7a": [
            "case_no", "est_id", "inquiry_section", "assessing_officer",
            "period_from", "period_to", "current_ndh", "hearing_count", "status",
            "created_at", "f8_issued", "nir_status", "nir_cause", "nir_case_no",
            "nir_case_date", "bank_ac_attached",
        ],
        "hearing_log": [
            "case_no", "hearing_no", "hearing_date", "proceedings_summary",
            "next_hearing_date", "created_at",
        ],
        "redbook": [
            "case_no", "est_id", "order_date",
            "account1", "account2", "account10", "account21", "account22", "total_assessed",
        ],
        "collections": [
            "case_no", "est_id", "collection_date", "mode", "instrument_no",
            "account1", "account2", "account10", "account21", "account22", "total_collected",
            "created_at",
        ],
    }

    # Clear any previously-migrated rows so re-runs are idempotent.
    for table in tables:
        cur = dst_conn.cursor()
        cur.execute(f"TRUNCATE {table} RESTART IDENTITY CASCADE")
    dst_conn.commit()
    print("Cleared target tables.")

    for table, columns in tables.items():
        print(f"Copying {table}...")
        copy_table(src, dst_conn, table, columns)

    src.close()
    dst.close()
    print("\nMigration complete.")


if __name__ == "__main__":
    main()
