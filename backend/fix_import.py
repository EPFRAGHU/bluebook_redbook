import os
import glob
import sqlite3
import pandas as pd

# Get current folder where backend lives
backend_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
db_path = os.path.join(backend_dir, "database.db")

print(f" Target Database Path: {db_path}")

# Search for master CSV in current folder or parent folder
parent_dir = os.path.dirname(backend_dir)
csv_files = glob.glob(os.path.join(backend_dir, "*.csv")) + glob.glob(os.path.join(parent_dir, "*.csv"))

# Also search root directory if needed
if not csv_files:
    csv_files = glob.glob("../*.csv") + glob.glob("*.csv")

if not csv_files:
    print("❌ ERROR: Could not find any CSV file! Please place your CSV file in the INQUIRY or backend folder.")
    exit()

csv_file = csv_files[0]
print(f" Found CSV File: {csv_file}")

# Load CSV
df = pd.read_csv(csv_file, low_memory=False)
df.columns = df.columns.str.strip().str.upper()

# Connect to database.db inside backend/
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Recreate establishments table
cursor.execute("DROP TABLE IF EXISTS establishments")
cursor.execute("""
    CREATE TABLE establishments (
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

# Batch insert
records = []
for _, row in df.iterrows():
    records.append((
        str(row.get('EST_ID', '')).strip(),
        str(row.get('EST_NAME', '')).strip(),
        str(row.get('ADDRESS_LINE1', '') if pd.notna(row.get('ADDRESS_LINE1')) else ''),
        str(row.get('ADDRESS_LINE2', '') if pd.notna(row.get('ADDRESS_LINE2')) else ''),
        str(row.get('CITY', '') if pd.notna(row.get('CITY')) else ''),
        str(row.get('DISTRICT_NAME', '') if pd.notna(row.get('DISTRICT_NAME')) else ''),
        str(row.get('PRIMARY_EMAIL', '') if pd.notna(row.get('PRIMARY_EMAIL')) else ''),
        int(row.get('UANS', 0) if pd.notna(row.get('UANS')) else 0),
        str(row.get('PAN', '') if pd.notna(row.get('PAN')) else '')
    ))

cursor.executemany("""
    INSERT INTO establishments 
    (est_id, est_name, address1, address2, city, district_name, primary_email, no_of_uan, pan)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
""", records)

conn.commit()

# Verify record count
count = cursor.execute("SELECT COUNT(*) FROM establishments").fetchone()[0]
conn.close()

print(f"\n SUCCESS! {count} establishments successfully imported into {db_path}")