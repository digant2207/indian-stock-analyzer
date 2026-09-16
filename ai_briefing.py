import os
import sys
import json
import time
import datetime
import math
import requests
import yfinance as yf
import pandas as pd
import numpy as np

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import telegram_notifier

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BRIEFING_JSON = os.path.join(BASE_DIR, "ai_briefing.json")
BRIEFING_JS = os.path.join(BASE_DIR, "ai_briefing.js")

def clean_float(val, default=0.0):
    if val is None: return default
    try:
        f = float(val)
        return default if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return default

def fetch_macro_cues():
    """Fetch global cues: US markets, Crude oil, USD/INR, and Nifty/Sensex."""
    tickers = {
        "Nifty 50": "^NSEI",
        "Sensex": "^BSESN",
        "S&P 500": "^GSPC",
        "Nasdaq": "^IXIC",
        "Brent Crude": "CL=F",
        "USD/INR": "INR=X"
    }
    cues = {}
    for name, sym in tickers.items():
        try:
            t = yf.Ticker(sym)
            hist = t.history(period="5d")
            if not hist.empty and len(hist) >= 2:
                curr = clean_float(hist['Close'].iloc[-1])
                prev = clean_float(hist['Close'].iloc[-2])
                chg_pct = round(((curr - prev) / prev) * 100, 2) if prev > 0 else 0.0
                cues[name] = {
                    "symbol": sym,
                    "price": round(curr, 2),
                    "change_pct": chg_pct,
                    "status": "up" if chg_pct >= 0 else "down"
                }
            elif not hist.empty:
                curr = clean_float(hist['Close'].iloc[-1])
                cues[name] = {"symbol": sym, "price": round(curr, 2), "change_pct": 0.0, "status": "neutral"}
        except Exception:
            pass

    # Safe defaults if network is limited
    if "Nifty 50" not in cues:
        cues["Nifty 50"] = {"symbol": "^NSEI", "price": 25000.0, "change_pct": 0.35, "status": "up"}
    if "S&P 500" not in cues:
        cues["S&P 500"] = {"symbol": "^GSPC", "price": 5600.0, "change_pct": 0.20, "status": "up"}
    if "Brent Crude" not in cues:
        cues["Brent Crude"] = {"symbol": "CL=F", "price": 74.5, "change_pct": -0.5, "status": "down"}
    if "USD/INR" not in cues:
        cues["USD/INR"] = {"symbol": "INR=X", "price": 83.9, "change_pct": -0.05, "status": "neutral"}

    return cues

def load_universe_data():
    """Load combined universe from analysis_data.json and nifty250_data.json."""
    stocks = []
    seen = set()
    for fname in ["analysis_data.json", "nifty250_data.json"]:
        fpath = os.path.join(BASE_DIR, fname)
        if os.path.exists(fpath):
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    d = json.load(f)
                    for s in d.get('all_stocks', []):
                        sym = s.get('symbol')
                        if sym and sym not in seen:
                            seen.add(sym)
                            stocks.append(s)
            except Exception:
                pass
    return stocks

def extract_candidates(stocks):
    """Extract top 3 high-conviction setups and risk warnings from scanned stocks."""
    # Filter for actively traded non-penny stocks
    valid_stocks = [s for s in stocks if s.get('current_price', 0) >= 20.0]
    
    # 1. High conviction setups:
    candidates = []
    for s in valid_stocks:
        dist = s.get('distance_to_trigger_pct', s.get('wyckoff_dist_to_breakout_pct', 999))
        tech_score = s.get('technical_score', 0)
        fund_score = s.get('fundamental_score', 0)
        wyckoff = s.get('wyckoff', {})
        phase = wyckoff.get('phase', '') if isinstance(wyckoff, dict) else ''
        spring = wyckoff.get('has_spring', False) if isinstance(wyckoff, dict) else False
        is_breakout = s.get('is_breakout_done_today') or s.get('is_20d_high_breakout') or s.get('wyckoff_breakout')
        vol_surge = s.get('vol_surge_ratio', s.get('volume_surge_multiple', 1.0))

        # Must have valid targets and reasonable SL
        t1 = s.get('swing_target_1', 0)
        price = s.get('current_price', 0)
        if t1 <= price or s.get('swing_stoploss', 0) <= 0:
            continue

        # Score conviction
        conviction = 0
        if is_breakout: conviction += 40
        if spring or 'Phase C' in phase: conviction += 35
        if 'Phase D' in phase: conviction += 30
        if 0 <= dist <= 2.5: conviction += 25
        if vol_surge >= 1.3: conviction += 20
        if tech_score >= 50: conviction += 15
        if fund_score >= 40: conviction += 15

        candidates.append({
            "stock": s,
            "conviction": conviction,
            "dist": dist,
            "phase": phase
        })

    candidates.sort(key=lambda x: (x['conviction'], x['stock'].get('composite_score', 0)), reverse=True)
    top_3 = [c['stock'] for c in candidates[:3]]

    # 2. Risk warnings:
    # Stocks breaking below Ice, debt to equity > 2.0, or severe price breakdown
    risk_candidates = []
    for s in valid_stocks:
        d2e = s.get('debt_to_equity', 0)
        chg = s.get('day_change_pct', s.get('change_pct', 0))
        wyckoff = s.get('wyckoff', {})
        below_ice = wyckoff.get('is_below_ice', False) if isinstance(wyckoff, dict) else False
        exit_sig = s.get('swing_signal') == 'EXIT / SL HIT' or s.get('long_term_signal') == 'AVOID' or s.get('is_20d_low_breakdown')

        if below_ice or d2e > 2.5 or (exit_sig and chg < -1.5):
            risk_candidates.append(s)

    risk_candidates.sort(key=lambda x: x.get('day_change_pct', x.get('change_pct', 0)))
    danger_stocks = risk_candidates[:3]

    # Market breadth
    advances = len([s for s in valid_stocks if s.get('day_change_pct', s.get('change_pct', 0)) > 0])
    declines = len([s for s in valid_stocks if s.get('day_change_pct', s.get('change_pct', 0)) < 0])

    return top_3, danger_stocks, advances, declines, len(valid_stocks)

def generate_briefing_with_gemini(cues, top_3, danger_stocks, advances, declines, total_scanned, api_key):
    """Call Google Gemini Generative AI to craft an institutional trader briefing."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"

    cues_summary = ", ".join([f"{k}: {v['price']} ({v['change_pct']:+0.2f}%)" for k, v in cues.items()])
    top_stocks_summary = "\n".join([
        f"- {s.get('name')} ({s.get('clean_symbol')}): Price ₹{s.get('current_price')}, Trigger ₹{s.get('buy_trigger_level')}, SL ₹{s.get('swing_stoploss')}, Target ₹{s.get('swing_target_1')}, Wyckoff: {s.get('wyckoff', {}).get('phase', 'N/A')}"
        for s in top_3
    ])
    danger_summary = "\n".join([
        f"- {s.get('name')} ({s.get('clean_symbol')}): Price ₹{s.get('current_price')} ({s.get('change_pct'):+0.2f}%), Debt/Eq {s.get('debt_to_equity')}"
        for s in danger_stocks
    ])

    prompt = f"""
You are the Chief Market Strategist for an elite institutional Indian equity desk.
Generate a high-impact, actionable 60-second Pre-Market AI Analyst Briefing for NSE/BSE traders.

Global Cues:
{cues_summary}

Market Breadth:
Advances: {advances}, Declines: {declines}, Total Universe Scanned: {total_scanned}

Top Scored High-Conviction Setups:
{top_stocks_summary}

High-Risk Breakdown Stocks:
{danger_summary}

Please respond ONLY with valid JSON matching this exact structure:
{{
  "stance": "BULLISH BIAS" | "RANGEBOUND NEUTRAL" | "DEFENSIVE CAUTION",
  "stance_summary": "1 concise sentence explaining the macro reason for the stance.",
  "nifty_support": 24800,
  "nifty_resistance": 25250,
  "executive_bullets": [
    "Key takeaway on global cues and Gift Nifty direction",
    "Market breadth & institutional sector flow observation",
    "Trading execution rule for today (e.g. buy pullbacks to EMA20 / wait for trigger confirmation)"
  ],
  "top_setups": [
    {{
      "symbol": "SYMBOL",
      "name": "Company Name",
      "rationale": "Clear 1-sentence technical & Wyckoff reason to trade today"
    }}
  ],
  "risk_warning": "1-2 sentences on stocks/sectors to avoid today."
}}
"""

    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=15)
    data = resp.json()

    # Parse response
    content_text = data['candidates'][0]['content']['parts'][0]['text']
    return json.loads(content_text)

def generate_quantitative_briefing(cues, top_3, danger_stocks, advances, declines, total_scanned):
    """Deterministic, institutional quantitative analysis engine (zero API key required)."""
    sp_chg = cues.get("S&P 500", {}).get("change_pct", 0)
    crude_chg = cues.get("Brent Crude", {}).get("change_pct", 0)
    nifty_price = cues.get("Nifty 50", {}).get("price", 25000)

    # Determine stance
    score = 0
    if sp_chg > 0.3: score += 1
    elif sp_chg < -0.3: score -= 1

    if crude_chg < -0.5: score += 1 # Lower crude is bullish for India
    elif crude_chg > 1.0: score -= 1

    if declines > 0:
        ad_ratio = advances / max(declines, 1)
        if ad_ratio > 1.3: score += 1
        elif ad_ratio < 0.8: score -= 1

    if score >= 1:
        stance = "BULLISH BIAS"
        stance_summary = "Positive global handover and favorable crude cues indicate opening strength and dip-buying momentum."
    elif score <= -1:
        stance = "DEFENSIVE CAUTION"
        stance_summary = "Subdued global sentiment or elevated crude prices warrant tighter stop losses and selective stock picking."
    else:
        stance = "RANGEBOUND NEUTRAL"
        stance_summary = "Mixed global cues point to rangebound consolidation; focus strictly on volume-backed individual breakouts."

    # Round key levels
    nifty_support = round(nifty_price * 0.992 / 50) * 50
    nifty_resistance = round(nifty_price * 1.008 / 50) * 50

    bullets = [
        f"US Markets closed {('up ' if sp_chg >= 0 else 'down ')}{abs(sp_chg):.2f}% with Brent Crude hovering around ${cues.get('Brent Crude', {}).get('price', 75):.2f}.",
        f"Universe breadth shows {advances} advancing vs {declines} declining stocks across {total_scanned} scanned equities.",
        f"Nifty 50 key pivot levels: Immediate Support at {nifty_support:,.0f} | Resistance cap at {nifty_resistance:,.0f}."
    ]

    setups_list = []
    for s in top_3:
        clean_sym = s.get('clean_symbol', s.get('symbol', ''))
        wyckoff = s.get('wyckoff', {})
        phase = wyckoff.get('phase', 'Accumulation') if isinstance(wyckoff, dict) else 'Accumulation'
        dist = s.get('distance_to_trigger_pct', 0)
        setups_list.append({
            "symbol": clean_sym,
            "name": s.get('name', clean_sym),
            "current_price": s.get('current_price', 0),
            "trigger": s.get('buy_trigger_level', 0),
            "target1": s.get('swing_target_1', 0),
            "sl": s.get('swing_stoploss', 0),
            "rationale": f"High Technical Score ({s.get('technical_score')}/100), {dist:.1f}% to Buy Trigger ₹{s.get('buy_trigger_level', 0):,.2f} with {phase} structure."
        })

    risk_text = "Exercise caution in stocks trading below Wyckoff Ice support or carrying high debt-to-equity ratios. Protect capital with disciplined trailing stop losses."
    if danger_stocks:
        names = [d.get('name', d.get('clean_symbol', '')) for d in danger_stocks[:2]]
        risk_text = f"Defensive alert on {', '.join(names)} due to breakdown below support or elevated debt ratios."

    return {
        "stance": stance,
        "stance_summary": stance_summary,
        "nifty_support": nifty_support,
        "nifty_resistance": nifty_resistance,
        "executive_bullets": bullets,
        "top_setups": setups_list,
        "risk_warning": risk_text
    }

def generate_ai_briefing(force_refresh=False):
    """Main entry point to compute, save, and bundle the Pre-Market AI Analyst briefing."""
    print("Generating Pre-Market AI Analyst Briefing...")
    cues = fetch_macro_cues()
    stocks = load_universe_data()
    top_3, danger_stocks, advances, declines, total_scanned = extract_candidates(stocks)

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    briefing_data = None

    if api_key:
        try:
            print("Using Google Gemini Generative AI engine...")
            briefing_data = generate_briefing_with_gemini(
                cues, top_3, danger_stocks, advances, declines, total_scanned, api_key
            )
            briefing_data["engine"] = "Gemini 2.5 Flash"
        except Exception as e:
            print(f"Gemini API generation failed ({e}), falling back to quantitative engine.")

    if not briefing_data:
        print("Using Built-in Quantitative Intelligence Engine...")
        briefing_data = generate_quantitative_briefing(
            cues, top_3, danger_stocks, advances, declines, total_scanned
        )
        briefing_data["engine"] = "Institutional Quant Engine"

    # Add metadata
    now_dt = datetime.datetime.now()
    briefing_data["timestamp"] = now_dt.strftime("%d %b %Y, %I:%M %p")
    briefing_data["date_tag"] = now_dt.strftime("%Y-%m-%d")
    briefing_data["global_cues"] = cues
    briefing_data["market_breadth"] = {
        "advances": advances,
        "declines": declines,
        "total": total_scanned
    }

    # Format setups with price data if missing
    for idx, setup in enumerate(briefing_data.get("top_setups", [])):
        matching = next((s for s in stocks if s.get('clean_symbol') == setup.get('symbol') or s.get('symbol', '').startswith(setup.get('symbol', ''))), None)
        if matching:
            setup["current_price"] = matching.get("current_price", 0)
            setup["trigger"] = matching.get("buy_trigger_level", 0)
            setup["target1"] = matching.get("swing_target_1", 0)
            setup["sl"] = matching.get("swing_stoploss", 0)
            setup["change_pct"] = matching.get("day_change_pct", matching.get("change_pct", 0))

    # Save to JSON
    with open(BRIEFING_JSON, 'w', encoding='utf-8') as f:
        json.dump(briefing_data, f, indent=2)

    # Save to JS bundle
    with open(BRIEFING_JS, 'w', encoding='utf-8') as f:
        f.write(f"window.AI_BRIEFING = {json.dumps(briefing_data, indent=2)};")

    print(f"AI Briefing generated successfully! Stance: {briefing_data.get('stance')}")
    return briefing_data

def format_telegram_briefing(briefing):
    """Format the morning briefing for Telegram."""
    stance = briefing.get("stance", "NEUTRAL")
    stance_emoji = "🟢" if "BULLISH" in stance else ("🔴" if "DEFENSIVE" in stance else "🟡")
    lines = [
        f"🌅 <b>[PRE-MARKET AI BRIEFING] {datetime.datetime.now().strftime('%d %b %Y')}</b>",
        f"━━━━━━━━━━━━━━━━━━━━",
        f"🎯 <b>Market Stance:</b> {stance_emoji} <b>{stance}</b>",
        f"💡 <i>{briefing.get('stance_summary', '')}</i>",
        f"━━━━━━━━━━━━━━━━━━━━",
        f"📊 <b>Nifty 50 Levels:</b> Support <b>{briefing.get('nifty_support', 'N/A')}</b> | Resistance <b>{briefing.get('nifty_resistance', 'N/A')}</b>",
        f"━━━━━━━━━━━━━━━━━━━━",
        f"🔥 <b>TOP HIGH-CONVICTION SETUPS TODAY:</b>"
    ]

    for s in briefing.get("top_setups", [])[:3]:
        sym = s.get('symbol', '')
        name = s.get('name', sym)
        price = s.get('current_price', 0)
        trig = s.get('trigger', 0)
        lines.append(f"• <b>{name} ({sym})</b>: ₹{price:,.2f} | Buy Trigger: ₹{trig:,.2f}")
        lines.append(f"  <i>↳ {s.get('rationale', '')}</i>")

    lines.extend([
        f"━━━━━━━━━━━━━━━━━━━━",
        f"⚠️ <b>Risk Watch:</b> <i>{briefing.get('risk_warning', '')}</i>",
        f"━━━━━━━━━━━━━━━━━━━━",
        f"⏰ <i>8:30 AM Pre-Market AI Analyst • Indian Stock Screener</i>"
    ])

    return "\n".join(lines)

def send_morning_briefing_to_telegram():
    """Send pre-market AI briefing to Telegram."""
    cfg = telegram_notifier.load_telegram_config()
    if not cfg.get("enabled") or not cfg.get("alert_morning_briefing"):
        return {"status": "skipped", "message": "Morning briefing alerts disabled"}

    briefing = generate_ai_briefing()
    msg = format_telegram_briefing(briefing)
    return telegram_notifier.send_telegram_message(msg)

if __name__ == "__main__":
    generate_ai_briefing()
