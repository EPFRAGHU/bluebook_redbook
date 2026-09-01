"""One-time migration: Create schema + seed establishments into Neon (Singapore).

Usage:
    set DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require
    python migrate_to_neon.py
"""

import csv
import os
import sys
import glob
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

import db

assert os.environ.get("DATABASE_URL"), "Set the DATABASE_URL environment variable to your Neon connection string."

CSV_PATTERN = "downloadest-master-download_data_360_AL_04-03-1952_*_0_9999999_0_0_0_0_0_0_0_0_0_0_0_LST_OFC.csv"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def find_csv():
    candidates = glob.glob(os.path.join(BASE_DIR, CSV_PATTERN))
    if not candidates:
        candidates = glob.glob(os.path.join(BASE_DIR, "backend", CSV_PATTERN))
    if not candidates:
        raise FileNotFoundError(f"No master CSV matching {CSV_PATTERN} in {BASE_DIR}")
    # Pick the most recently modified file
    candidates.sort(key=os.path.getmtime, reverse=True)
    return candidates[0]


def create_schema(conn):
    print("Creating schema via db.create_tables()...")
    db.create_tables(conn)
    print("Schema ready.")


def seed_establishments(conn, csv_path):
    print(f"Reading CSV: {csv_path}")
    with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"  Total rows in CSV: {len(rows)}")

    # Build insert values
    # Column mapping: CSV -> DB
    records = []
    for row in rows:
        est_id = (row.get("EST_ID") or "").strip()
        if not est_id:
            continue
        records.append((
            est_id,
            (row.get("EST_NAME") or "").strip(),
            (row.get("ADDRESS_LINE1") or "").strip(),
            (row.get("ADDRESS_LINE2") or "").strip(),
            (row.get("CITY") or "").strip(),
            (row.get("DISTRICT_NAME") or "").strip(),
            (row.get("PRIMARY_EMAIL") or "").strip(),
            int(row.get("UANS") or 0),
            (row.get("PAN") or "").strip(),
        ))

    print(f"  Valid records to insert: {len(records)}")

    # Clear existing + insert in batches
    cur = conn.cursor()
    cur.execute("DELETE FROM establishments")
    conn.commit()
    print("  Cleared existing establishments rows.")

    batch_size = 2000
    inserted = 0
    start = time.time()
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        args_str = ",".join(
            cur.mogrify(
                "(%s,%s,%s,%s,%s,%s,%s,%s,%s)", rec
            ).decode()
            for rec in batch
        )
        cur.execute(
            f"INSERT INTO establishments "
            f"(est_id, est_name, address1, address2, city, district_name, "
            f"primary_email, no_of_uan, pan) VALUES {args_str}"
        )
        conn.commit()
        inserted += len(batch)
        elapsed = time.time() - start
        rate = inserted / elapsed if elapsed > 0 else 0
        print(f"  Inserted {inserted}/{len(records)} ({rate:.0f} rows/s)")

    elapsed = time.time() - start
    print(f"  Done: {inserted} establishments in {elapsed:.1f}s")
    return inserted


def verify(conn):
    print("\nVerifying...")
    cur = conn.cursor()
    tables_to_check = [
        "establishments", "cases_7a", "hearing_log",
        "redbook", "collections", "aeo",
    ]
    for table in tables_to_check:
        try:
            cur.execute(f"SELECT COUNT(*) AS cnt FROM {table}")
            count = cur.fetchone()["cnt"]
            print(f"  {table}: {count} rows")
        except Exception as e:
            print(f"  {table}: ERROR ({e})")
    cur.close()


def main():
    print("=" * 60)
    print("Migrate to Neon (Singapore)")
    print("=" * 60)

    csv_path = find_csv()
    print(f"Using CSV: {csv_path}")

    conn = db.get_db_connection()
    print("Connected to Neon PostgreSQL.")

    create_schema(conn)
    seed_establishments(conn, csv_path)
    verify(conn)

    conn.close()
    print("\nMigration complete.")


if __name__ == "__main__":
    main()
