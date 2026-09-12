import os
import sys
import time
import json
import csv
import math
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import numpy as np
import yfinance as yf
import requests

import re

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

HIGH_DEBT_SECTORS = [
    "Private Bank", "Public Bank", "NBFC", "Financial Services", 
    "Power & Green Energy", "Power Transmission", "Infra & Engineering", 
    "Ports & Logistics", "Conglomerate", "Mining & Energy", "Power Finance", "Rail Finance"
]

MAJOR_EVENT_KEYWORDS = [
    "AGM", "EGM", "RESULT", "EARNINGS", "DIVIDEND", "SPLIT", "BONUS", 
    "BUYBACK", "BOARD MEETING", "ORDER", "CONTRACT", "ACQUISITION", "MERGER", "EXPANSION"
]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATUS_FILE = os.path.join(BASE_DIR, "scan_status.json")

def get_ist_now():
    utc_now = datetime.datetime.now(datetime.timezone.utc)
    return utc_now + datetime.timedelta(hours=5, minutes=30)

def update_scan_status(is_running, pct=0, msg="Idle"):
    try:
        ist_now = get_ist_now()
        with open(STATUS_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                "is_running": is_running,
                "progress_pct": pct,
                "status_message": msg,
                "last_updated": ist_now.strftime("%Y-%m-%d %I:%M %p IST"),
                "timestamp": int(time.time())
            }, f, indent=2)
    except Exception:
        pass

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
        f_val = float(val)
        return default if (math.isnan(f_val) or math.isinf(f_val)) else f_val
    except Exception:
        return default

def sanitize_json(obj):
    if obj is None:
        return None
    if isinstance(obj, (float, np.floating)):
        if math.isnan(float(obj)) or math.isinf(float(obj)):
            return 0.0
        return round(float(obj), 4)
    elif isinstance(obj, (int, np.integer)):
        return int(obj)
    elif isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    elif isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [sanitize_json(x) for x in obj]
    elif isinstance(obj, str):
        if re.search(r'(?:₹\s*|\b)nan\b', obj, flags=re.IGNORECASE):
            res = re.sub(r'₹\s*nan\b', '₹0.00', obj, flags=re.IGNORECASE)
            res = re.sub(r'\bnan\b', '0.0', res, flags=re.IGNORECASE)
            return res
        return obj
    return obj

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

    # 1. Fetch Official Calendar Announced Events (Earnings Date & Ex-Dividend Date)
    try:
        cal = ticker.calendar or {}
        
        # Check Earnings Date
        earnings_dates = cal.get('Earnings Date')
        if earnings_dates:
            if isinstance(earnings_dates, list) and len(earnings_dates) > 0:
                e_date = earnings_dates[0]
            elif isinstance(earnings_dates, datetime.date):
                e_date = earnings_dates
            else:
                e_date = None

            if e_date and isinstance(e_date, datetime.date) and e_date >= today:
                date_tag = "Today" if e_date == today else ("Tomorrow" if e_date == tomorrow else e_date.strftime("%d %b"))
                events_list.append({
                    "date": e_date.strftime("%Y-%m-%d"),
                    "date_tag": date_tag,
                    "type": "Qtr Results",
                    "title": f"Official Qtr Results Announced ({e_date.strftime('%d %b %Y')})",
                    "summary": f"Company officially announced quarterly results date on {e_date.strftime('%d %b %Y')}.",
                    "impact": "High Volatility ⚡",
                    "impact_reason": "Quarterly results announcement impacts stock trend."
                })

        # Check Ex-Dividend Date
        ex_div_date = cal.get('Ex-Dividend Date')
        if ex_div_date and isinstance(ex_div_date, datetime.date) and ex_div_date >= today:
            date_tag = "Today" if ex_div_date == today else ("Tomorrow" if ex_div_date == tomorrow else ex_div_date.strftime("%d %b"))
            events_list.append({
                "date": ex_div_date.strftime("%Y-%m-%d"),
                "date_tag": date_tag,
                "type": "Dividend Action",
                "title": f"Official Dividend Ex-Date ({ex_div_date.strftime('%d %b %Y')})",
                "summary": f"Company announced dividend payout ex-date.",
                "impact": "Bullish Income 💰" if dividend_yield >= 1.5 else "Neutral ⚖️",
                "impact_reason": f"Dividend payout ex-date."
            })

    except Exception:
        pass

    # 2. Filter Yahoo Corporate News Disclosures ONLY for Verified Major Announcements
    try:
        news_items = ticker.news or []
        for n in news_items:
            title = n.get('title', '')
            upper_title = title.upper()

            is_major = any(kw in upper_title for kw in MAJOR_EVENT_KEYWORDS)
            if not is_major:
                continue

            pub_time = n.get('providerPublishTime')
            if pub_time:
                n_date = datetime.datetime.fromtimestamp(pub_time).date()
                if n_date >= yesterday:
                    n_tag = "Today" if n_date == today else ("Yesterday" if n_date == yesterday else ("Tomorrow" if n_date == tomorrow else n_date.strftime("%d %b")))
                    
                    event_type = "Board Meeting"
                    if "AGM" in upper_title or "EGM" in upper_title: event_type = "AGM / EGM"
                    elif "DIVIDEND" in upper_title: event_type = "Dividend Action"
                    elif "SPLIT" in upper_title or "BONUS" in upper_title: event_type = "Stock Split"
                    elif "ORDER" in upper_title or "CONTRACT" in upper_title: event_type = "Big Order Win"
                    elif "RESULT" in upper_title or "EARNINGS" in upper_title: event_type = "Qtr Results"

                    events_list.append({
                        "date": n_date.strftime("%Y-%m-%d"),
                        "date_tag": n_tag,
                        "type": event_type,
                        "title": f"{title} ({n_date.strftime('%d %b')})",
                        "summary": f"Official corporate disclosure for {symbol.replace('.NS','').replace('.BO','')}.",
                        "impact": "High Impact ⚡",
                        "impact_reason": f"Major {event_type} announcement."
                    })
    except Exception:
        pass

def analyze_wyckoff(close_prices, high_prices, low_prices, volumes, current_price, prev_close):
    n = len(close_prices) if close_prices is not None else 0
    if n < 20:
        creek = round(current_price * 1.05, 2)
        ice = round(current_price * 0.95, 2)
        return {
            "wyckoff_phase": "Phase B",
            "wyckoff_structure": "Accumulation",
            "wyckoff_event": "Consolidation Range",
            "wyckoff_creek": creek,
            "wyckoff_ice": ice,
            "wyckoff_breakout": creek,
            "wyckoff_dist_to_breakout_pct": 5.0,
            "wyckoff_stoploss": ice,
            "wyckoff_stoploss_pct": 5.0,
            "wyckoff_target_1": round(creek + (creek - ice), 2),
            "wyckoff_target_2": round(creek + (creek - ice) * 2.0, 2),
            "wyckoff_signal": "RANGE WATCH",
            "wyckoff_rationale": ["Building trading range; monitoring volume absorption."]
        }

    # Range Window: last 60 to 90 trading days on 1-day daily chart
    rw = min(n, 90)
    w_close = close_prices[-rw:]
    w_high = high_prices[-rw:]
    w_low = low_prices[-rw:]
    w_vol = volumes[-rw:]

    # Creek (TR Supply / Resistance) & Ice (TR Demand / Support)
    try:
        creek = round(float(np.percentile(w_high, 93)), 2)
        ice = round(float(np.percentile(w_low, 7)), 2)
    except Exception:
        creek = round(float(np.max(w_high)), 2)
        ice = round(float(np.min(w_low)), 2)

    if creek <= ice:
        creek = round(float(np.max(w_high)), 2)
        ice = round(float(np.min(w_low)), 2)
        if creek <= ice:
            creek = round(current_price * 1.05, 2)
            ice = round(current_price * 0.95, 2)

    tr_height = round(max(creek - ice, current_price * 0.03), 2)
    tr_midpoint = round((creek + ice) / 2.0, 2)

    # Moving averages for trend context
    sma_20 = float(np.mean(close_prices[-20:]))
    sma_50 = float(np.mean(close_prices[-50:])) if n >= 50 else sma_20
    sma_200 = float(np.mean(close_prices[-200:])) if n >= 200 else sma_50

    # Volume: Up-day volume vs Down-day volume in last 20 bars (Effort vs Result)
    recent_len = min(20, n - 1)
    up_vol = 0.0
    down_vol = 0.0
    for i in range(-recent_len, 0):
        if close_prices[i] >= close_prices[i - 1]:
            up_vol += float(volumes[i])
        else:
            down_vol += float(volumes[i])

    total_vol = up_vol + down_vol
    up_vol_pct = (up_vol / total_vol * 100.0) if total_vol > 0 else 50.0
    vol_avg_20 = float(np.mean(volumes[-20:])) if n >= 20 else float(np.mean(volumes))
    vol_surge = float(volumes[-1] / vol_avg_20) if vol_avg_20 > 0 else 1.0

    # Extremes in last 12 bars
    recent_12_low = float(np.min(low_prices[-12:]))
    recent_12_high = float(np.max(high_prices[-12:]))

    # Wyckoff Schematics & Phase Detection
    is_spring = (recent_12_low < ice * 1.005) and (current_price >= ice) and (current_price <= creek)
    is_utad = (recent_12_high > creek * 0.995) and (current_price < creek) and (current_price >= ice) and (current_price > tr_midpoint)
    is_jac_breakout = (current_price >= creek * 0.995) and (vol_surge >= 1.2 or current_price > prev_close)
    is_lps = (creek * 0.98 <= current_price <= creek * 1.04) and (current_price > tr_midpoint) and (vol_surge <= 1.25)
    is_markup = (current_price > creek * 1.03) and (current_price > sma_20) and (sma_20 >= sma_50)
    is_sow_breakdown = (current_price < ice * 0.995) and (vol_surge >= 1.2 or current_price < prev_close)
    is_markdown = (current_price < ice * 0.96) and (current_price < sma_20) and (sma_20 <= sma_50)
    is_climax = (vol_surge >= 2.0) and (abs(current_price - prev_close) / prev_close >= 0.03)

    if is_markup:
        phase = "Phase E"
        structure = "Markup"
        event = "Markup Uptrend (Expansion)"
        breakout = round(max(creek, float(np.max(high_prices[-15:])) * 1.003), 2)
        stoploss = round(max(ice, current_price * 0.92, sma_20 * 0.97), 2)
        signal = "MARKUP RIDE"
        rationale = [
            f"Trading firmly above Wyckoff Creek (₹{creek}) in active Markup Phase E.",
            f"Strong alignment above 20 EMA (₹{sma_20:.1f}) and 50 EMA (₹{sma_50:.1f}).",
            f"Accumulation cause built in ₹{ice} - ₹{creek} base now in vertical effect."
        ]
    elif is_markdown:
        phase = "Phase E"
        structure = "Markdown"
        event = "Markdown Downtrend"
        breakout = creek
        stoploss = round(max(creek * 1.02, current_price * 1.06), 2)
        signal = "MARKDOWN AVOID"
        rationale = [
            f"Broken below Wyckoff Ice support (₹{ice}) into Markdown Phase E.",
            f"Supply heavily dominant with prices below 20 & 50 EMAs.",
            "Avoid long positions until selling climax halts descent."
        ]
    elif is_sow_breakdown:
        phase = "Phase D"
        structure = "Distribution"
        event = "Sign of Weakness (Break of Ice)"
        breakout = creek
        stoploss = round(max(creek, current_price * 1.05), 2)
        signal = "SOW EXIT / SHORT"
        rationale = [
            f"Major Sign of Weakness (SOW) breaking below Ice support (₹{ice}).",
            f"Elevated selling pressure ({100 - up_vol_pct:.1f}% down-volume).",
            "High probability of entering Phase E markdown."
        ]
    elif is_jac_breakout:
        phase = "Phase D"
        structure = "Accumulation"
        event = "Jump Across Creek (Sign of Strength)"
        breakout = round(max(creek * 1.002, current_price * 1.002), 2)
        stoploss = round(min(creek * 0.97, float(np.min(low_prices[-10:])) * 0.985), 2)
        signal = "JAC BREAKOUT BUY"
        rationale = [
            f"Jump Across the Creek (JAC / SOS) breaking through Creek resistance (₹{creek}).",
            f"Volume surge {vol_surge:.1f}x confirms institutional demand absorption.",
            f"Cause of {tr_height} pts horizontal accumulation ready to unlock upward effect."
        ]
    elif is_lps:
        phase = "Phase D"
        structure = "Accumulation"
        event = "Last Point of Support (LPS / Backup)"
        breakout = round(max(creek * 1.005, recent_12_high * 1.002), 2)
        stoploss = round(min(creek * 0.97, ice * 1.02), 2)
        signal = "LPS PULLBACK BUY"
        rationale = [
            f"Last Point of Support (LPS) successfully holding above Creek (₹{creek}).",
            f"Low-volume pullback demonstrates floating supply is exhausted.",
            "Prime Wyckoff low-risk entry before Phase E markup acceleration."
        ]
    elif is_spring:
        phase = "Phase C"
        structure = "Accumulation"
        event = "Spring / Shakeout Test"
        breakout = creek
        stoploss = round(min(recent_12_low, ice) * 0.985, 2)
        signal = "SPRING TEST BUY"
        rationale = [
            f"Phase C Spring test under Ice support (₹{ice}) quickly rejected.",
            f"Liquidity sweep completed; supply dried up on the test.",
            f"Asymmetric risk-reward setup with stop loss strictly below Spring low (₹{stoploss})."
        ]
    elif is_utad:
        phase = "Phase C"
        structure = "Distribution"
        event = "UTAD (Upthrust After Distribution)"
        breakout = creek
        stoploss = round(max(recent_12_high * 1.015, creek * 1.02), 2)
        signal = "UTAD EXIT / CAUTION"
        rationale = [
            f"Upthrust After Distribution (UTAD) spiked above Creek (₹{creek}) and failed.",
            "Smart money distributing to trap breakout buyers.",
            "Tighten stop loss or take profits on long positions."
        ]
    elif is_climax:
        phase = "Phase A"
        structure = "Accumulation" if current_price < tr_midpoint else "Distribution"
        event = "Stopping Climax & Secondary Test"
        breakout = creek
        stoploss = round(ice * 0.98 if structure == "Accumulation" else creek * 1.02, 2)
        signal = "CLIMAX WATCH"
        rationale = [
            f"Phase A Stopping Action: Climactic volume surge ({vol_surge:.1f}x vol).",
            f"Automatic reaction establishes Trading Range between ₹{ice} and ₹{creek}.",
            "Wait for Phase B cause development before initiating trades."
        ]
    else:
        phase = "Phase B"
        structure = "Accumulation" if up_vol_pct >= 50.0 else "Distribution"
        event = "Range Cause Building (Absorption)"
        breakout = creek
        stoploss = round(ice * 0.98, 2)
        signal = "CAUSE BUILDING WATCH"
        rationale = [
            f"Phase B Cause Building inside Trading Range: ₹{ice} (Ice) to ₹{creek} (Creek).",
            f"Volume balance: {up_vol_pct:.1f}% up-volume vs {100 - up_vol_pct:.1f}% down-volume.",
            f"Smart money absorbing supply within {tr_height} pts horizontal range."
        ]

    dist_to_breakout = round(((breakout - current_price) / current_price) * 100.0, 2) if current_price > 0 else 0.0
    stoploss_risk_pct = round(((current_price - stoploss) / current_price) * 100.0, 2) if current_price > 0 else 0.0

    target_1 = round(creek + tr_height * 1.0, 2)
    target_2 = round(creek + tr_height * 2.0, 2)

    return {
        "wyckoff_phase": phase,
        "wyckoff_structure": structure,
        "wyckoff_event": event,
        "wyckoff_creek": creek,
        "wyckoff_ice": ice,
        "wyckoff_breakout": breakout,
        "wyckoff_dist_to_breakout_pct": dist_to_breakout,
        "wyckoff_stoploss": stoploss,
        "wyckoff_stoploss_pct": stoploss_risk_pct,
        "wyckoff_target_1": target_1,
        "wyckoff_target_2": target_2,
        "wyckoff_signal": signal,
        "wyckoff_rationale": rationale
    }

def fetch_stock_data(stock_meta):
    symbol = stock_meta['symbol']
    ticker = yf.Ticker(symbol)
    
    try:
        hist = ticker.history(period="1y", interval="1d")
    except Exception:
        hist = pd.DataFrame()
        
    if hist.empty or len(hist) < 20:
        if symbol.endswith(".NS"):
            bo_sym = symbol.replace(".NS", ".BO")
            ticker = yf.Ticker(bo_sym)
            try:
                hist = ticker.history(period="1y", interval="1d")
                if not hist.empty and len(hist) >= 20:
                    symbol = bo_sym
            except Exception:
                pass

    close_prices = hist['Close'].values
    high_prices = hist['High'].values
    low_prices = hist['Low'].values
    volumes = hist['Volume'].values

    valid_closes = [clean_val(c) for c in close_prices if c is not None and not math.isnan(c) and clean_val(c) > 0]
    if not valid_closes or len(valid_closes) < 10:
        return None

    current_price = round(valid_closes[-1], 2)
    today_high = round(clean_val(high_prices[-1]), 2)
    if today_high == 0: today_high = current_price

    # Base Starting Price for Today's Breakout is Yesterday's Close
    prev_close = round(valid_closes[-2], 2) if len(valid_closes) > 1 else current_price
    if prev_close == 0: prev_close = current_price

    day_change_pct = round(safe_pct_change(current_price, prev_close), 2)
    
    high_52w = round(float(np.max(high_prices)), 2)
    low_52w = round(float(np.min(low_prices)), 2)
    pct_from_52w_high = round(((current_price - high_52w) / high_52w) * 100.0, 2) if high_52w > 0 else 0.0
    pct_from_52w_low = round(((current_price - low_52w) / low_52w) * 100.0, 2) if low_52w > 0 else 0.0
    
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
    
    # 20-Day High prior to today (Yesterday's 20-day high)
    high_20d_prev = float(np.max(high_prices[-21:-1])) if len(high_prices) > 20 else float(np.max(high_prices[:-1]))
    low_20d_prev = float(np.min(low_prices[-21:-1])) if len(low_prices) > 20 else float(np.min(low_prices[:-1]))
    
    is_20d_high_breakout = current_price > high_20d_prev and vol_surge_ratio > 1.2
    is_20d_low_breakdown = current_price < low_20d_prev and vol_surge_ratio > 1.2
    is_52w_high_breakout = current_price >= high_52w * 0.985
    is_52w_low_breakdown = current_price <= low_52w * 1.015

    # Breakout Levels Calculated from Yesterday's Close as Starting Base
    buy_trigger_level = round(max(high_20d_prev * 1.002, prev_close * 1.005), 2)
    sell_trigger_level = round(min(low_20d_prev * 0.998, prev_close * 0.995), 2)

    # Breakout distance % calculated strictly from Yesterday's Close
    dist_from_prev_close = round(((buy_trigger_level - prev_close) / prev_close) * 100.0, 2) if prev_close > 0 else 0.0

    # Has Breakout Already Occurred Today? (Price or High crossed trigger)
    is_breakout_done_today = (current_price >= buy_trigger_level or today_high >= buy_trigger_level) and day_change_pct > 0.3

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

    # Strength vs Weakness Lists
    strengths = []
    weaknesses = []

    if rev_growth_yoy >= 15: strengths.append(f"Strong YoY Sales Growth (+{rev_growth_yoy:.1f}%)")
    elif rev_growth_yoy < 0: weaknesses.append(f"Revenue Contracting YoY ({rev_growth_yoy:.1f}%)")

    if earnings_growth_yoy >= 15: strengths.append(f"Robust YoY Profit Expansion (+{earnings_growth_yoy:.1f}%)")
    elif earnings_growth_yoy < 0: weaknesses.append(f"Earnings De-growth YoY ({earnings_growth_yoy:.1f}%)")

    if roe >= 18: strengths.append(f"High Return on Equity ({roe:.1f}% ROE)")
    elif roe < 8: weaknesses.append(f"Weak Return on Capital ({roe:.1f}% ROE)")

    if debt_to_equity == 0.0: strengths.append("Zero Debt Balance Sheet")
    elif debt_to_equity <= 0.5: strengths.append(f"Healthy Low Debt (D/E {debt_to_equity:.2f})")
    elif debt_score_penalty >= 10: weaknesses.append(f"High Debt Burden (D/E {debt_to_equity:.2f})")

    if current_price > sma_200: strengths.append("Trading Above 200-Day EMA Long-term Uptrend")
    else: weaknesses.append("Trading Below 200-Day EMA Trendline")

    if is_20d_high_breakout or is_52w_high_breakout: strengths.append(f"Breakout Momentum with {vol_surge_ratio:.1f}x Volume Surge")
    if pledged_pct > 5: weaknesses.append(f"Promoter Share Pledge Risk ({pledged_pct:.1f}%)")
    if rsi > 72: weaknesses.append(f"RSI Overbought Warning ({rsi:.1f})")
    elif rsi < 35: weaknesses.append(f"RSI Weak Momentum ({rsi:.1f})")

    if len(strengths) == 0: strengths.append("Stable Price Consolidation")
    if len(weaknesses) == 0: weaknesses.append("No Major Red Flags Detected")

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

    # Determine genuine announced upcoming event string ONLY if corporate announcement exists
    upcoming_event_str = "None"
    if events:
        first_evt = events[0]
        upcoming_event_str = f"{first_evt.get('type','Event')} ({first_evt.get('date_tag','Upcoming')})"

    wyckoff_data = analyze_wyckoff(close_prices, high_prices, low_prices, volumes, current_price, prev_close)

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
        "buy_trigger_level": buy_trigger_level,
        "sell_trigger_level": sell_trigger_level,
        "dist_from_prev_close": dist_from_prev_close,
        "is_breakout_done_today": is_breakout_done_today,
        "upcoming_event_str": upcoming_event_str,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "fundamental_score": round(float(f_score), 1),
        "technical_score": round(float(t_score + b_score), 1),
        "composite_score": composite_score,
        "long_term_signal": long_term_signal,
        "swing_signal": swing_signal,
        "intraday_signal": intraday_signal,
        "swing_stoploss": swing_stoploss,
        "swing_target_1": swing_target_1,
        "swing_target_2": swing_target_2,
        "rationale": rationale_bullets,
        "corporate_actions": corporate_actions,
        "events": events,
        "wyckoff_phase": wyckoff_data.get("wyckoff_phase", "Phase B"),
        "wyckoff_structure": wyckoff_data.get("wyckoff_structure", "Accumulation"),
        "wyckoff_event": wyckoff_data.get("wyckoff_event", "Range Cause Building (Absorption)"),
        "wyckoff_creek": wyckoff_data.get("wyckoff_creek", buy_trigger_level),
        "wyckoff_ice": wyckoff_data.get("wyckoff_ice", sell_trigger_level),
        "wyckoff_breakout": wyckoff_data.get("wyckoff_breakout", buy_trigger_level),
        "wyckoff_dist_to_breakout_pct": wyckoff_data.get("wyckoff_dist_to_breakout_pct", 0.0),
        "wyckoff_stoploss": wyckoff_data.get("wyckoff_stoploss", swing_stoploss),
        "wyckoff_stoploss_pct": wyckoff_data.get("wyckoff_stoploss_pct", 0.0),
        "wyckoff_target_1": wyckoff_data.get("wyckoff_target_1", swing_target_1),
        "wyckoff_target_2": wyckoff_data.get("wyckoff_target_2", swing_target_2),
        "wyckoff_signal": wyckoff_data.get("wyckoff_signal", "CAUSE BUILDING WATCH"),
        "wyckoff_rationale": wyckoff_data.get("wyckoff_rationale", [])
    }

def process_csv_file_fast(csv_path, output_json, output_js, js_var_name, start_pct=0, end_pct=100, max_workers=12):
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

    total_count = len(stocks)
    print(f"Processing {total_count} stocks from {csv_path} with {max_workers} threads...")
    analyzed = []
    completed_count = 0
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_stock_data, s): s for s in stocks}
        for future in as_completed(futures):
            res = future.result()
            completed_count += 1
            curr_pct = int(start_pct + ((completed_count / total_count) * (end_pct - start_pct)))
            update_scan_status(True, curr_pct, f"Scanning {completed_count}/{total_count} stocks in {os.path.basename(csv_path)}...")
            if res:
                analyzed.append(res)

    analyzed.sort(key=lambda x: x['composite_score'], reverse=True)
    
    top_15 = analyzed[:15]
    worst_5 = analyzed[-5:] if len(analyzed) >= 5 else analyzed[-len(analyzed):]
    worst_5 = sorted(worst_5, key=lambda x: x['composite_score'])

    ist_now = get_ist_now()
    ist_str = ist_now.strftime("%Y-%m-%d %I:%M %p IST")

    summary_stats = {
        "last_updated": ist_str,
        "total_stocks_scanned": len(analyzed),
        "strong_buys_count": sum(1 for s in analyzed if s['long_term_signal'] in ['STRONG BUY', 'ACCUMULATE']),
        "swing_breakouts_count": sum(1 for s in analyzed if s['swing_signal'] == 'BREAKOUT BUY'),
        "intraday_setups_count": sum(1 for s in analyzed if s['intraday_signal'] != 'NEUTRAL'),
        "high_debt_warnings": sum(1 for s in analyzed if 'High Debt' in s['debt_status']),
        "breakouts_done_today": sum(1 for s in analyzed if s.get('is_breakout_done_today')),
        "wyckoff_accumulation_count": sum(1 for s in analyzed if s.get('wyckoff_structure') == 'Accumulation' and s.get('wyckoff_phase') in ['Phase C', 'Phase D']),
        "wyckoff_markup_count": sum(1 for s in analyzed if s.get('wyckoff_phase') == 'Phase E' and s.get('wyckoff_structure') == 'Markup'),
        "wyckoff_phase_c_springs": sum(1 for s in analyzed if s.get('wyckoff_phase') == 'Phase C' and 'Spring' in s.get('wyckoff_event', '')),
        "wyckoff_phase_d_breakouts": sum(1 for s in analyzed if s.get('wyckoff_phase') == 'Phase D' and s.get('wyckoff_structure') == 'Accumulation'),
        "wyckoff_distribution_count": sum(1 for s in analyzed if s.get('wyckoff_structure') in ['Distribution', 'Markdown'])
    }
    
    output_payload = {
        "summary": summary_stats,
        "top_15_stocks": top_15,
        "worst_5_stocks": worst_5,
        "all_stocks": analyzed
    }
    
    output_payload = sanitize_json(output_payload)
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(output_payload, f, indent=2, allow_nan=False)
        
    with open(output_js, 'w', encoding='utf-8') as f:
        f.write(f"window.{js_var_name} = " + json.dumps(output_payload, indent=2, allow_nan=False) + ";")
        
    print(f"Completed {csv_path}! Scanned {len(analyzed)} stocks. Saved to {output_json} & {output_js}")
    return output_payload

GSHEET_URL = "https://docs.google.com/spreadsheets/d/1_rWhyap8gO-u8ehP1vDCiad-RwnFjGBCn2R5qiis4_A/export?format=csv"

def sync_google_sheet():
    print("Syncing live stock list from Spark Google Sheet...")
    try:
        resp = requests.get(GSHEET_URL, timeout=10)
        if resp.status_code == 200:
            resp.encoding = 'utf-8'
            lines = resp.text.splitlines()
            reader = csv.reader(lines)
            rows = [row for row in reader if row]

            extracted_stocks = []
            seen_symbols = set()

            for idx, row in enumerate(rows):
                if idx == 0: continue
                raw_symbol = row[0].strip().upper()
                name = row[1].strip() if len(row) > 1 else raw_symbol
                notes = row[6].strip() if len(row) > 6 else ""

                if not raw_symbol or raw_symbol.startswith("SYMBOL"): continue

                clean_sym = clean_symbol(raw_symbol)
                if clean_sym not in seen_symbols:
                    seen_symbols.add(clean_sym)
                    extracted_stocks.append({
                        "symbol": clean_sym,
                        "name": name,
                        "sector": "Spark Watchlist",
                        "cap_type": "Equity",
                        "tracking_notes": f"Spark Sheet: {notes}" if notes else "Spark Sheet"
                    })

            if extracted_stocks:
                csv_path = os.path.join(BASE_DIR, "stocks.csv")
                with open(csv_path, "w", encoding="utf-8", newline="") as f:
                    writer = csv.DictWriter(f, fieldnames=["symbol", "name", "sector", "cap_type", "tracking_notes"])
                    writer.writeheader()
                    for s in extracted_stocks:
                        writer.writerow(s)
                print(f"✅ Successfully synced {len(extracted_stocks)} stocks live from Spark Google Sheet!")
    except Exception as e:
        print(f"Google Sheet live sync notice: {e}")

if __name__ == "__main__":
    try:
        stocks_csv = os.path.join(BASE_DIR, "stocks.csv")
        nifty250_csv = os.path.join(BASE_DIR, "nifty250.csv")
        analysis_json = os.path.join(BASE_DIR, "analysis_data.json")
        analysis_js = os.path.join(BASE_DIR, "analysis_data.js")
        nifty250_json = os.path.join(BASE_DIR, "nifty250_data.json")
        nifty250_js = os.path.join(BASE_DIR, "nifty250_data.js")

        update_scan_status(True, 2, "Syncing live stock list from Google Sheet...")
        sync_google_sheet()
        update_scan_status(True, 5, "Initializing market scan for Spark Watchlist...")
        process_csv_file_fast(stocks_csv, analysis_json, analysis_js, "stockData", start_pct=5, end_pct=60, max_workers=30)
        update_scan_status(True, 60, "Scanning Nifty 250 Universe...")
        process_csv_file_fast(nifty250_csv, nifty250_json, nifty250_js, "nifty250Data", start_pct=60, end_pct=100, max_workers=30)
        
        ist_now = get_ist_now()
        ist_str = ist_now.strftime("%Y-%m-%d %I:%M %p IST")
        with open(os.path.join(BASE_DIR, "last_run.txt"), "w", encoding="utf-8") as f:
            f.write(f"Last Market Scan: {ist_str}\n")
        
        # Send Morning Email Digest: Only once at 9:45 AM IST on weekdays
        try:
            if os.environ.get("GMAIL_APP_PASSWORD") or os.path.exists(os.path.join(BASE_DIR, "email_config.json")):
                import email_notifier
                cfg = email_notifier.load_email_config()
                if cfg.get("enabled", True):
                    with open(analysis_json, 'r', encoding='utf-8') as f:
                        a_data = json.load(f)
                    with open(nifty250_json, 'r', encoding='utf-8') as f:
                        n_data = json.load(f)
                    
                    is_weekday = ist_now.weekday() < 5  # Mon (0) to Fri (4)
                    # 9:45 AM window (allow 9:40 to 10:15 IST to accommodate GitHub Actions job scheduling)
                    is_945_am_window = (ist_now.hour == 9 and ist_now.minute >= 40) or (ist_now.hour == 10 and ist_now.minute <= 15)
                    
                    email_log_file = os.path.join(BASE_DIR, "last_email_sent.txt")
                    today_str = ist_now.strftime("%Y-%m-%d")
                    already_sent_today = False
                    if os.path.exists(email_log_file):
                        try:
                            with open(email_log_file, "r", encoding="utf-8") as elf:
                                if elf.read().strip() == today_str:
                                    already_sent_today = True
                        except Exception:
                            pass

                    force_email = str(os.environ.get("FORCE_EMAIL", "")).lower() in ["true", "1", "yes"]

                    if force_email or (is_weekday and is_945_am_window and not already_sent_today):
                        print(f"[{ist_str}] Triggering 9:45 AM Weekday Email Digest...")
                        success, msg = email_notifier.send_morning_digest(a_data, n_data)
                        if success:
                            with open(email_log_file, "w", encoding="utf-8") as elf:
                                elf.write(today_str)
                            print(f"[{ist_str}] ✅ 9:45 AM Email digest recorded for {today_str}.")
                    elif not is_weekday:
                        print(f"[{ist_str}] Email skipped: weekend.")
                    elif already_sent_today:
                        print(f"[{ist_str}] Email skipped: already sent today ({today_str}).")
                    else:
                        print(f"[{ist_str}] Email skipped: outside 9:45 AM window (Current IST: {ist_now.strftime('%I:%M %p')}).")
        except Exception as em_err:
            print(f"Email notification notice: {em_err}")

        update_scan_status(False, 100, "Scan Complete! All stocks updated.")
    except Exception as err:
        print(f"Fast runner execution error: {err}")
        update_scan_status(False, 0, f"Scan failed: {err}")
        sys.exit(1)
