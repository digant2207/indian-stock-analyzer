import os
import json
import csv
import math
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import numpy as np
import yfinance as yf
import requests

HIGH_DEBT_SECTORS = [
    "Private Bank", "Public Bank", "NBFC", "Financial Services", 
    "Power & Green Energy", "Power Transmission", "Infra & Engineering", 
    "Ports & Logistics", "Conglomerate", "Mining & Energy", "Power Finance", "Rail Finance"
]

def clean_symbol(sym):
    sym = sym.strip().upper()
    if not sym: return ""
    sym = sym.replace(" ", "").replace("&", "%26")
    if not sym.endswith(".NS") and not sym.endswith(".BO"):
        return sym + ".NS"
    return sym

def clean_val(val, default=0.0):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return default
    try:
        return float(val)
    except Exception:
        return default

def safe_pct_change(current, previous):
    if previous is None or current is None or previous == 0 or math.isnan(previous) or math.isnan(current):
        return 0.0
    return ((current - previous) / abs(previous)) * 100.0

def calculate_rsi(prices, period=14):
    if len(prices) < period + 1:
        return 50.0
    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)
    
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])
    
    if avg_loss == 0:
        return 100.0
    
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        
    if avg_loss == 0:
        return 100.0
    
    rs = avg_gain / avg_loss
    return float(100.0 - (100.0 / (1.0 + rs)))

def calculate_macd(prices):
    if len(prices) < 26:
        return 0.0, 0.0, 0.0
    s = pd.Series(prices)
    exp1 = s.ewm(span=12, adjust=False).mean()
    exp2 = s.ewm(span=26, adjust=False).mean()
    macd = exp1 - exp2
    signal = macd.ewm(span=9, adjust=False).mean()
    hist = macd - signal
    return float(macd.iloc[-1]), float(signal.iloc[-1]), float(hist.iloc[-1])

def fetch_events_and_news(ticker, symbol, current_price, rev_growth_yoy, earnings_growth_yoy, dividend_yield):
    events_list = []
    today = datetime.date.today()
    yesterday = today - datetime.timedelta(days=1)
    tomorrow = today + datetime.timedelta(days=1)

    try:
        ex_date_timestamp = ticker.info.get('exDividendDate')
        if ex_date_timestamp:
            ex_date = datetime.datetime.fromtimestamp(ex_date_timestamp).date()
            if abs((ex_date - today).days) <= 7:
                date_tag = "Today" if ex_date == today else ("Yesterday" if ex_date == yesterday else ("Tomorrow" if ex_date == tomorrow else ex_date.strftime("%d %b %Y")))
                events_list.append({
                    "date": ex_date.strftime("%Y-%m-%d"),
                    "date_tag": date_tag,
                    "type": "Dividend Ex-Date",
                    "title": f"Ex-Dividend Event ({dividend_yield:.2f}% Yield)",
                    "summary": f"Ex-dividend date for dividend payout. Stock trades ex-dividend on this date.",
                    "impact": "Bullish Income" if dividend_yield >= 2.0 else "Neutral ⚖️",
                    "impact_reason": f"High dividend yield ({dividend_yield:.2f}%) attracts income investors."
                })
    except Exception:
        pass

    if rev_growth_yoy > 15 or earnings_growth_yoy > 20:
        events_list.append({
            "date": today.strftime("%Y-%m-%d"),
            "date_tag": "Today",
            "type": "Quarterly Earnings Growth",
            "title": f"Strong Earnings Growth Release (YoY Profit +{earnings_growth_yoy:.1f}%)",
            "summary": f"Strong YoY revenue growth of {rev_growth_yoy:.1f}% and Net Profit growth of {earnings_growth_yoy:.1f}%.",
            "impact": "Bullish Re-rating 🚀",
            "impact_reason": "Beating growth expectations provides positive fundamental momentum."
        })
    elif earnings_growth_yoy < -10:
        events_list.append({
            "date": yesterday.strftime("%Y-%m-%d"),
            "date_tag": "Yesterday",
            "type": "Earnings Caution",
            "title": f"Earnings De-growth Reported (YoY Profit Drop {earnings_growth_yoy:.1f}%)",
            "summary": f"Recent financial results show profit declining by {abs(earnings_growth_yoy):.1f}%.",
            "impact": "Bearish Caution ⚠️",
            "impact_reason": "Margin pressure may trigger short-term profit booking."
        })

    try:
        news_items = ticker.news or []
        for n in news_items[:2]:
            title = n.get('title', '')
            pub_time = n.get('providerPublishTime')
            if pub_time:
                n_date = datetime.datetime.fromtimestamp(pub_time).date()
                n_tag = "Today" if n_date == today else ("Yesterday" if n_date == yesterday else ("Tomorrow" if n_date == tomorrow else n_date.strftime("%d %b %Y")))
                events_list.append({
                    "date": n_date.strftime("%Y-%m-%d"),
                    "date_tag": n_tag,
                    "type": "Corporate News",
                    "title": title,
                    "summary": f"Recent corporate announcement for {symbol.replace('.NS','')}.",
                    "impact": "Neutral / Watch ⚖️",
                    "impact_reason": "Monitored for corporate development."
                })
    except Exception:
        pass

    if not events_list:
        events_list.append({
            "date": today.strftime("%Y-%m-%d"),
            "date_tag": "Today",
            "type": "Corporate Monitoring",
            "title": "Regular Trading & Volume Watch",
            "summary": f"Stock trading normally at ₹{current_price:.2f}. No pending corporate disclosures.",
            "impact": "Neutral ⚖️",
            "impact_reason": "Stock undergoing normal trading activity."
        })

    return events_list

def fetch_stock_data(stock_meta):
    symbol = stock_meta['symbol']
    ticker = yf.Ticker(symbol)
    
    try:
        hist = ticker.history(period="1y", interval="1d")
    except Exception:
        hist = pd.DataFrame()
        
    if hist.empty or len(hist) < 20:
        return None

    close_prices = hist['Close'].values
    high_prices = hist['High'].values
    low_prices = hist['Low'].values
    volumes = hist['Volume'].values
    
    current_price = round(clean_val(close_prices[-1]), 2)
    prev_close = round(clean_val(close_prices[-2]), 2) if len(close_prices) > 1 else current_price
    day_change_pct = round(safe_pct_change(current_price, prev_close), 2)
    
    high_52w = round(float(np.max(high_prices)), 2)
    low_52w = round(float(np.min(low_prices)), 2)
    pct_from_52w_high = round(((current_price - high_52w) / high_52w) * 100.0, 2)
    pct_from_52w_low = round(((current_price - low_52w) / low_52w) * 100.0, 2)
    
    sma_20 = round(float(np.mean(close_prices[-20:])), 2)
    sma_50 = round(float(np.mean(close_prices[-50:])), 2) if len(close_prices) >= 50 else sma_20
    sma_200 = round(float(np.mean(close_prices[-200:])), 2) if len(close_prices) >= 200 else sma_50
    
    rsi = round(calculate_rsi(close_prices), 1)
    macd_val, macd_signal, macd_hist = calculate_macd(close_prices)
    macd_val = round(macd_val, 2)
    macd_signal = round(macd_signal, 2)
    macd_hist = round(macd_hist, 2)
    
    vol_20_avg = float(np.mean(volumes[-20:])) if len(volumes) >= 20 else float(np.mean(volumes))
    vol_surge_ratio = round(float(volumes[-1] / vol_20_avg), 2) if vol_20_avg > 0 else 1.0
    
    high_20d_prev = float(np.max(high_prices[-21:-1])) if len(high_prices) > 20 else float(np.max(high_prices[:-1]))
    low_20d_prev = float(np.min(low_prices[-21:-1])) if len(low_prices) > 20 else float(np.min(low_prices[:-1]))
    
    is_20d_high_breakout = current_price > high_20d_prev and vol_surge_ratio > 1.2
    is_20d_low_breakdown = current_price < low_20d_prev and vol_surge_ratio > 1.2
    is_52w_high_breakout = current_price >= high_52w * 0.985
    is_52w_low_breakdown = current_price <= low_52w * 1.015

    info = {}
    try:
        info = ticker.info or {}
    except Exception:
        pass
        
    pe_ratio = round(clean_val(info.get('trailingPE')), 2)
    forward_pe = round(clean_val(info.get('forwardPE')), 2)
    peg_ratio = round(clean_val(info.get('pegRatio')), 2)
    pb_ratio = round(clean_val(info.get('priceToBook')), 2)
    roe = round(clean_val(info.get('returnOnEquity')) * 100.0, 1)
    profit_margins = round(clean_val(info.get('profitMargins')) * 100.0, 1)
    operating_margins = round(clean_val(info.get('operatingMargins')) * 100.0, 1)
    debt_to_equity = round(clean_val(info.get('debtToEquity')) / 100.0 if info.get('debtToEquity') else 0.0, 2)
    
    rev_growth_yoy = round(clean_val(info.get('revenueGrowth')) * 100.0, 1)
    earnings_growth_yoy = round(clean_val(info.get('earningsGrowth')) * 100.0, 1)
    free_cash_flow = clean_val(info.get('freeCashflow'))
    target_mean_price = round(clean_val(info.get('targetMeanPrice'), current_price), 2)
    recommendation_key = info.get('recommendationKey', 'none').replace('_', ' ').title()
    dividend_yield = round(clean_val(info.get('dividendYield')) * 100.0, 2)

    promoter_holding = round(clean_val(info.get('heldPercentInsiders'), 0.50) * 100.0, 1)
    institutional_holding = round(clean_val(info.get('heldPercentInstitutions'), 0.30) * 100.0, 1)
    public_holding = round(max(0.0, 100.0 - promoter_holding - institutional_holding), 1)
    pledged_pct = round(clean_val(info.get('pledgedPercent'), 0.0), 1)

    sector = stock_meta.get('sector', 'General')
    is_high_debt_sector = any(hds.lower() in sector.lower() for hds in HIGH_DEBT_SECTORS)
    
    if is_high_debt_sector:
        debt_status = "Acceptable (Financial/Infra Sector)" if debt_to_equity < 4.0 else "High Debt"
        debt_score_penalty = 0 if debt_to_equity < 3.5 else 10
    else:
        if debt_to_equity == 0.0:
            debt_status = "Zero Debt"
            debt_score_penalty = 0
        elif debt_to_equity <= 0.5:
            debt_status = "Low Debt (Healthy)"
            debt_score_penalty = 0
        elif debt_to_equity <= 1.0:
            debt_status = "Moderate Debt"
            debt_score_penalty = 5
        else:
            debt_status = "High Debt Warning"
            debt_score_penalty = 15

    q_sales_growth = rev_growth_yoy
    q_pat_growth = earnings_growth_yoy

    f_score = 0
    if rev_growth_yoy >= 15: f_score += 10
    elif rev_growth_yoy >= 5: f_score += 6
    elif rev_growth_yoy > 0: f_score += 3

    if earnings_growth_yoy >= 15: f_score += 10
    elif earnings_growth_yoy >= 5: f_score += 6
    elif earnings_growth_yoy > 0: f_score += 3

    if roe >= 18: f_score += 10
    elif roe >= 12: f_score += 7
    elif roe >= 8: f_score += 4

    f_score = max(0, f_score + 5 - debt_score_penalty)

    t_score = 0
    if current_price > sma_20: t_score += 8
    if current_price > sma_50: t_score += 8
    if current_price > sma_200: t_score += 7
    
    if 50 <= rsi <= 68: t_score += 6
    elif 40 <= rsi < 50: t_score += 3
    elif rsi > 70: t_score += 2
    elif rsi < 35: t_score += 4

    if macd_hist > 0: t_score += 6

    b_score = 0
    if is_52w_high_breakout or is_20d_high_breakout: b_score += 8
    if vol_surge_ratio > 1.5: b_score += 4
    if institutional_holding > 25: b_score += 3

    analyst_upside_pct = round(safe_pct_change(target_mean_price, current_price), 1)
    v_score = 0
    if analyst_upside_pct > 20: v_score += 8
    elif analyst_upside_pct > 10: v_score += 5
    elif analyst_upside_pct > 0: v_score += 3

    if 0 < pe_ratio <= 35: v_score += 7
    elif 35 < pe_ratio <= 60: v_score += 4
    elif pe_ratio > 60: v_score += 2

    composite_score = round(min(100.0, f_score + t_score + b_score + v_score), 1)

    if composite_score >= 75 and debt_score_penalty <= 5:
        long_term_signal = "STRONG BUY"
    elif composite_score >= 60:
        long_term_signal = "ACCUMULATE"
    elif composite_score >= 45:
        long_term_signal = "HOLD"
    elif composite_score >= 35:
        long_term_signal = "REDUCE"
    else:
        long_term_signal = "EXIT / AVOID"

    if is_20d_high_breakout or (current_price > sma_20 and macd_hist > 0 and 52 <= rsi <= 68 and vol_surge_ratio >= 1.3):
        swing_signal = "BREAKOUT BUY"
    elif current_price > sma_20 and macd_hist > 0:
        swing_signal = "MOMENTUM BUY"
    elif current_price > sma_50 and rsi >= 45:
        swing_signal = "RANGE CONSOLIDATION"
    elif rsi < 40 or is_20d_low_breakdown:
        swing_signal = "STOPLOSS / SELL"
    else:
        swing_signal = "NEUTRAL / WATCH"

    if is_20d_high_breakout and vol_surge_ratio >= 1.8:
        intraday_signal = "HIGH VOLATILITY BREAKOUT"
    elif vol_surge_ratio >= 1.5 and day_change_pct > 1.2:
        intraday_signal = "MOMENTUM SCALP BUY"
    elif is_20d_low_breakdown and vol_surge_ratio >= 1.5:
        intraday_signal = "INTRADAY SHORT / CAUTION"
    else:
        intraday_signal = "NEUTRAL"

    atr_approx = np.std(close_prices[-14:]) * 1.5
    swing_stoploss = round(current_price - (atr_approx * 1.8), 2)
    swing_target_1 = round(current_price + (atr_approx * 2.5), 2)
    swing_target_2 = round(current_price + (atr_approx * 4.2), 2)

    rationale_bullets = []
    if rev_growth_yoy > 10: rationale_bullets.append(f"YoY Revenue up {rev_growth_yoy:.1f}%")
    if earnings_growth_yoy > 10: rationale_bullets.append(f"YoY Profit up {earnings_growth_yoy:.1f}%")
    if is_52w_high_breakout: rationale_bullets.append("Trading near 52-Week High")
    if is_20d_high_breakout: rationale_bullets.append(f"20-Day Range Breakout with {vol_surge_ratio:.1f}x volume")
    if current_price > sma_200: rationale_bullets.append("Above 200-day EMA long-term uptrend")
    if debt_score_penalty > 10: rationale_bullets.append("Warning: High debt level")
    if pledged_pct > 5: rationale_bullets.append(f"Warning: {pledged_pct:.1f}% promoter pledge")
    if len(rationale_bullets) == 0: rationale_bullets.append("Consolidation phase with neutral momentum")

    corporate_actions = []
    if dividend_yield > 1.5:
        corporate_actions.append(f"Attractive Dividend Yield: {dividend_yield:.2f}%")

    events = fetch_events_and_news(ticker, symbol, current_price, rev_growth_yoy, earnings_growth_yoy, dividend_yield)

    return {
        "symbol": symbol,
        "clean_symbol": symbol.replace('.NS', '').replace('.BO', ''),
        "name": stock_meta.get('name', symbol.split('.')[0]),
        "sector": stock_meta.get('sector', 'General'),
        "cap_type": stock_meta.get('cap_type', 'Equity'),
        "tracking_notes": stock_meta.get('tracking_notes', ''),
        "current_price": current_price,
        "prev_close": prev_close,
        "day_change_pct": day_change_pct,
        "52w_high": high_52w,
        "52w_low": low_52w,
        "pct_from_52w_high": pct_from_52w_high,
        "pct_from_52w_low": pct_from_52w_low,
        "sma_20": sma_20,
        "sma_50": sma_50,
        "sma_200": sma_200,
        "rsi_14": rsi,
        "macd_val": macd_val,
        "macd_signal": macd_signal,
        "macd_hist": macd_hist,
        "vol_surge_ratio": vol_surge_ratio,
        "pe_ratio": pe_ratio,
        "forward_pe": forward_pe,
        "peg_ratio": peg_ratio,
        "pb_ratio": pb_ratio,
        "roe": roe,
        "profit_margins": profit_margins,
        "operating_margins": operating_margins,
        "debt_to_equity": debt_to_equity,
        "debt_status": debt_status,
        "rev_growth_yoy": rev_growth_yoy,
        "earnings_growth_yoy": earnings_growth_yoy,
        "q_sales_growth": q_sales_growth,
        "q_pat_growth": q_pat_growth,
        "free_cash_flow": free_cash_flow,
        "target_mean_price": target_mean_price,
        "analyst_upside_pct": analyst_upside_pct,
        "recommendation_key": recommendation_key,
        "dividend_yield": dividend_yield,
        "promoter_holding": promoter_holding,
        "institutional_holding": institutional_holding,
        "public_holding": public_holding,
        "pledged_pct": pledged_pct,
        "is_20d_high_breakout": is_20d_high_breakout,
        "is_20d_low_breakdown": is_20d_low_breakdown,
        "is_52w_high_breakout": is_52w_high_breakout,
        "is_52w_low_breakdown": is_52w_low_breakdown,
        "composite_score": composite_score,
        "long_term_signal": long_term_signal,
        "swing_signal": swing_signal,
        "intraday_signal": intraday_signal,
        "swing_stoploss": swing_stoploss,
        "swing_target_1": swing_target_1,
        "swing_target_2": swing_target_2,
        "rationale": rationale_bullets,
        "corporate_actions": corporate_actions,
        "events": events
    }

def process_csv_file_fast(csv_path, output_json, output_js, js_var_name, max_workers=12):
    if not os.path.exists(csv_path):
        return None
        
    stocks = []
    with open(csv_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            s_val = row.get('symbol') or row.get('Symbol') or ''
            if s_val.strip():
                stocks.append({
                    "symbol": clean_symbol(s_val),
                    "name": row.get('name') or row.get('Stock Name') or s_val,
                    "sector": row.get('sector') or 'General',
                    "cap_type": row.get('cap_type') or 'Equity',
                    "tracking_notes": row.get('tracking_notes') or ''
                })

    print(f"Processing {len(stocks)} stocks from {csv_path} with {max_workers} threads...")
    analyzed = []
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_stock_data, s): s for s in stocks}
        for future in as_completed(futures):
            res = future.result()
            if res:
                analyzed.append(res)

    analyzed.sort(key=lambda x: x['composite_score'], reverse=True)
    
    top_15 = analyzed[:15]
    worst_5 = analyzed[-5:] if len(analyzed) >= 5 else analyzed[-len(analyzed):]
    worst_5 = sorted(worst_5, key=lambda x: x['composite_score'])

    summary_stats = {
        "last_updated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S IST"),
        "total_stocks_scanned": len(analyzed),
        "strong_buys_count": sum(1 for s in analyzed if s['long_term_signal'] in ['STRONG BUY', 'ACCUMULATE']),
        "swing_breakouts_count": sum(1 for s in analyzed if s['swing_signal'] == 'BREAKOUT BUY'),
        "intraday_setups_count": sum(1 for s in analyzed if s['intraday_signal'] != 'NEUTRAL'),
        "high_debt_warnings": sum(1 for s in analyzed if 'High Debt' in s['debt_status'])
    }
    
    output_payload = {
        "summary": summary_stats,
        "top_15_stocks": top_15,
        "worst_5_stocks": worst_5,
        "all_stocks": analyzed
    }
    
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(output_payload, f, indent=2)
        
    with open(output_js, 'w', encoding='utf-8') as f:
        f.write(f"window.{js_var_name} = " + json.dumps(output_payload, indent=2) + ";")
        
    print(f"Completed {csv_path}! Scanned {len(analyzed)} stocks. Saved to {output_json} & {output_js}")
    return output_payload

if __name__ == "__main__":
    process_csv_file_fast("stocks.csv", "analysis_data.json", "analysis_data.js", "stockData", max_workers=12)
    process_csv_file_fast("nifty250.csv", "nifty250_data.json", "nifty250_data.js", "nifty250Data", max_workers=12)
