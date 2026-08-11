import json
import csv
import os
import pandas as pd
import numpy as np
import yfinance as yf

def clean_symbol(sym):
    sym = sym.strip().upper()
    if not sym: return ""
    sym = sym.replace(" ", "").replace("&", "%26")
    if not sym.endswith(".NS") and not sym.endswith(".BO"):
        return sym + ".NS"
    return sym

def backtest_breakout_strategy(symbol, hold_days=30):
    try:
        hist = yf.Ticker(symbol).history(period="1y", interval="1d")
        if hist.empty or len(hist) < 60:
            return None
            
        prices = hist['Close'].values
        volumes = hist['Volume'].values
        dates = hist.index
        
        trades = []
        in_trade = False
        entry_price = 0.0
        entry_date = None
        
        for i in range(30, len(prices) - hold_days):
            rolling_20_high = np.max(prices[i-20:i])
            vol_20_avg = np.mean(volumes[i-20:i])
            
            if not in_trade:
                if prices[i] > rolling_20_high and volumes[i] > 1.3 * vol_20_avg:
                    in_trade = True
                    entry_price = prices[i]
                    entry_date = str(dates[i])[:10]
                    target_exit_idx = min(i + hold_days, len(prices) - 1)
                    
                    stoploss = entry_price * 0.95
                    actual_exit_price = prices[target_exit_idx]
                    
                    for j in range(i + 1, target_exit_idx + 1):
                        if prices[j] <= stoploss:
                            actual_exit_price = prices[j]
                            break
                            
                    ret_pct = ((actual_exit_price - entry_price) / entry_price) * 100.0
                    trades.append({
                        "entry_date": entry_date,
                        "entry_price": round(float(entry_price), 2),
                        "exit_price": round(float(actual_exit_price), 2),
                        "return_pct": round(float(ret_pct), 2),
                        "is_win": ret_pct > 0
                    })
                    in_trade = False
                    
        if not trades:
            return {"symbol": symbol, "total_trades": 0, "win_rate": 0.0, "avg_return": 0.0, "total_wins": 0, "total_losses": 0}
            
        wins = [t for t in trades if t['is_win']]
        win_rate = (len(wins) / len(trades)) * 100.0
        avg_return = np.mean([t['return_pct'] for t in trades])
        
        return {
            "symbol": symbol,
            "total_trades": len(trades),
            "win_rate": round(float(win_rate), 1),
            "avg_return": round(float(avg_return), 2),
            "total_wins": len(wins),
            "total_losses": len(trades) - len(wins)
        }
    except Exception as e:
        print(f"Backtest error for {symbol}: {e}")
        return None

def run_backtest_all(stocks_csv_path="stocks.csv", output_json_path="backtest_results.json", output_js_path="backtest_results.js"):
    print("Running Backtest Strategy Engine...")
    if not os.path.exists(stocks_csv_path):
        return
        
    symbols = []
    with open(stocks_csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            s_val = row.get('symbol') or row.get('Symbol') or ''
            if s_val.strip():
                symbols.append(clean_symbol(s_val))
            
    results = []
    for sym in symbols[:25]:
        res = backtest_breakout_strategy(sym)
        if res:
            results.append(res)
            
    avg_system_win_rate = np.mean([r['win_rate'] for r in results]) if results else 0.0
    avg_system_return = np.mean([r['avg_return'] for r in results]) if results else 0.0
    
    summary = {
        "strategy_name": "20-Day Range Breakout & Volume Expansion",
        "tested_symbols_count": len(results),
        "overall_win_rate": round(float(avg_system_win_rate), 1),
        "overall_avg_return_per_trade": round(float(avg_system_return), 2),
        "symbol_details": results
    }
    
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
        
    with open(output_js_path, 'w', encoding='utf-8') as f:
        f.write("window.backtestData = " + json.dumps(summary, indent=2) + ";")
        
    print(f"Backtest complete! Saved to {output_json_path} & {output_js_path}")
    return summary

if __name__ == "__main__":
    run_backtest_all()
