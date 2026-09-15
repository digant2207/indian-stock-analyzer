import os
import json
import time
import math
import numpy as np
import pandas as pd
import yfinance as yf

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def clean_val(v, default=0.0):
    if v is None: return default
    try:
        f = float(v)
        return default if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return default

def sanitize_json(obj):
    if obj is None: return None
    if isinstance(obj, (float, np.floating)):
        return 0.0 if (math.isnan(float(obj)) or math.isinf(float(obj))) else round(float(obj), 4)
    elif isinstance(obj, (int, np.integer)):
        return int(obj)
    elif isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    elif isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_json(x) for x in obj]
    return obj

def process_file(json_file, js_file, var_name):
    if not os.path.exists(json_file):
        print(f"Skipping {json_file}, does not exist.")
        return

    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    stocks = data.get('all_stocks', [])
    symbols = []
    for s in stocks:
        sym = s.get('symbol', '').strip().upper()
        if sym and sym not in symbols:
            symbols.append(sym)

    print(f"Fetching 60-day OHLCV candles for {len(symbols)} stocks in {os.path.basename(json_file)}...")

    batch_size = 25
    symbol_candles = {}

    for i in range(0, len(symbols), batch_size):
        batch = symbols[i:i+batch_size]
        try:
            df = yf.download(batch, period="60d", interval="1d", group_by='ticker', progress=False, timeout=15)
            for sym in batch:
                try:
                    if len(batch) == 1:
                        ticker_df = df
                    else:
                        if hasattr(df.columns, 'levels') and sym in df.columns.levels[0]:
                            ticker_df = df[sym]
                        elif sym in df.columns:
                            ticker_df = df[sym]
                        else:
                            ticker_df = pd.DataFrame()

                    if not ticker_df.empty:
                        candles = []
                        for idx_val, row in ticker_df.iterrows():
                            c_val = round(clean_val(row.get('Close')), 2)
                            if c_val <= 0: continue
                            o_val = round(clean_val(row.get('Open', c_val)), 2)
                            h_val = round(clean_val(row.get('High', c_val)), 2)
                            l_val = round(clean_val(row.get('Low', c_val)), 2)
                            v_val = int(clean_val(row.get('Volume', 0)))
                            candles.append({
                                "time": str(idx_val)[:10],
                                "open": o_val,
                                "high": h_val,
                                "low": l_val,
                                "close": c_val,
                                "volume": v_val
                            })
                        if candles:
                            symbol_candles[sym] = candles
                except Exception as ex:
                    print(f"Error parsing candles for {sym}: {ex}")
        except Exception as e:
            print(f"Batch download failed for {batch}: {e}")

    matched_count = 0
    for s in stocks:
        sym = s.get('symbol', '').strip().upper()
        if sym in symbol_candles:
            s['candles'] = symbol_candles[sym]
            matched_count += 1
        elif 'candles' not in s:
            s['candles'] = []

    print(f"Matched {matched_count}/{len(stocks)} stocks with real candle series.")

    data['all_stocks'] = stocks
    data['top_15_stocks'] = stocks[:15]
    data['worst_5_stocks'] = stocks[-5:]

    clean_data = sanitize_json(data)

    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(clean_data, f, indent=2, allow_nan=False)

    with open(js_file, 'w', encoding='utf-8') as f:
        f.write(f"window.{var_name} = " + json.dumps(clean_data, indent=2, allow_nan=False) + ";")

    print(f"Saved {json_file} and {js_file} successfully!")

if __name__ == "__main__":
    process_file(os.path.join(BASE_DIR, "analysis_data.json"), os.path.join(BASE_DIR, "analysis_data.js"), "stockData")
    process_file(os.path.join(BASE_DIR, "nifty250_data.json"), os.path.join(BASE_DIR, "nifty250_data.js"), "nifty250Data")
