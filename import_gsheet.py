import json
import csv
import sys
import requests

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SHEET_URL = "https://docs.google.com/spreadsheets/d/1_rWhyap8gO-u8ehP1vDCiad-RwnFjGBCn2R5qiis4_A/export?format=csv"

# Save Google Sheet config
with open("google_sheet_config.json", "w", encoding="utf-8") as f:
    json.dump({"google_sheet_url": SHEET_URL}, f, indent=2)

print("Fetching CSV from user Google Sheet...")
resp = requests.get(SHEET_URL)
resp.encoding = 'utf-8'

lines = resp.text.splitlines()
reader = csv.reader(lines)
rows = [row for row in reader if row]

extracted_stocks = []
seen_symbols = set()

for idx, row in enumerate(rows):
    if idx == 0:
        continue # Skip header row
        
    raw_symbol = row[0].strip().upper()
    name = row[1].strip() if len(row) > 1 else raw_symbol
    notes = row[6].strip() if len(row) > 6 else ""
    dma_signal = row[11].strip() if len(row) > 11 else ""

    if not raw_symbol or raw_symbol.startswith("SYMBOL"):
        continue

    # Clean ticker symbol and add .NS suffix for NSE equities
    clean_sym = raw_symbol.replace(" ", "").replace("&", "%26")
    if not clean_sym.endswith(".NS") and not clean_sym.endswith(".BO"):
        ns_symbol = clean_sym + ".NS"
    else:
        ns_symbol = clean_sym

    if ns_symbol not in seen_symbols:
        seen_symbols.add(ns_symbol)
        tracking_info = f"Spark Sheet: {notes}" if notes else f"Spark Sheet ({dma_signal})" if dma_signal else "Spark Stock List"
        extracted_stocks.append({
            "symbol": ns_symbol,
            "name": name,
            "sector": "Spark Watchlist",
            "cap_type": "Equity",
            "tracking_notes": tracking_info
        })

print(f"Extracted {len(extracted_stocks)} clean NSE stocks from Spark Google Sheet!")

with open("stocks.csv", "w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["symbol", "name", "sector", "cap_type", "tracking_notes"])
    writer.writeheader()
    for s in extracted_stocks:
        writer.writerow(s)

print("Updated stocks.csv with complete Spark stock list!")
