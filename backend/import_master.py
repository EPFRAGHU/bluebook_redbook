import pandas as pd
import sqlite3
import glob
import os

# Automatically find the RO Bhubaneswar CSV master file
csv_files = glob.glob("*downloadest-master-download_data_360*.csv")
if not csv_files:
    # Fallback search inside \INQUIRY directory or root
    csv_files = glob.glob("../*downloadest-master-download_data_360*.csv")

if not csv_files:
    raise FileNotFoundError("Could not find the RO Bhubaneswar master CSV file!")

csv_filename = csv_files[0]
print(f" Found master file: {csv_filename}")

# Read CSV with pandas (filling missing string/number values safely)
df = pd.read_csv(csv_filename, low_memory=False)

# Normalize column names to uppercase for consistent mapping
df.columns = df.columns.str.strip().str.upper()

# Connect to SQLite database (use absolute path so this script works regardless of CWD)
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Re-create establishments table matching RO Bhubaneswar schema
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

# Map CSV columns directly to database schema
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
conn.close()
print(f" Successfully imported {len(records)} establishments from RO Bhubaneswar master dataset!")