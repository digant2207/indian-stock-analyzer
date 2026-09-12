import json
import os
import math
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def sanitize_json(obj):
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0.0
        return round(obj, 4)
    elif isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_json(x) for x in obj]
    elif isinstance(obj, tuple):
        return [sanitize_json(x) for x in obj]
    elif isinstance(obj, str):
        if "nan" in obj.lower():
            res = re.sub(r'₹\s*nan\b', '₹0.00', obj, flags=re.IGNORECASE)
            res = re.sub(r'\bnan\b', '0.0', res, flags=re.IGNORECASE)
            return res
        return obj
    return obj

def enrich_file(json_path, js_path, js_var_name):
    if not os.path.exists(json_path):
        print(f"File not found: {json_path}")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    stocks = data.get('all_stocks', [])
    print(f"Processing {len(stocks)} stocks in {json_path}...")

    for s in stocks:
        current_price = float(s.get('current_price') or 0.0)
        prev_close = float(s.get('prev_close') or current_price)
        day_chg = float(s.get('day_change_pct') or 0.0)
        h52 = float(s.get('52w_high') or (current_price * 1.2))
        l52 = float(s.get('52w_low') or (current_price * 0.8))
        sma20 = float(s.get('sma_20') or current_price)
        sma50 = float(s.get('sma_50') or current_price)
        sma200 = float(s.get('sma_200') or current_price)
        rsi = float(s.get('rsi_14') or 50.0)
        vol_surge = float(s.get('vol_surge_ratio') or 1.0)
        is_breakout_done = s.get('is_breakout_done_today', False)
        is_20d_high = s.get('is_20d_high_breakout', False)
        is_20d_low = s.get('is_20d_low_breakdown', False)

        # Trading Range (TR) Creek and Ice
        buy_trig = float(s.get('buy_trigger_level') or (current_price * 1.01))
        sell_trig = float(s.get('sell_trigger_level') or (current_price * 0.99))

        creek = round(max(buy_trig, current_price * 1.005), 2)
        ice = round(min(sell_trig, current_price * 0.98), 2)
        tr_height = round(max(creek - ice, current_price * 0.03), 2)
        tr_midpoint = round((creek + ice) / 2.0, 2)

        # Phase determination
        is_markup = (current_price > creek * 1.015) and (current_price >= sma20 >= sma50)
        is_markdown = (current_price < ice * 0.97) and (current_price <= sma20 <= sma50)
        is_sow = is_20d_low or (current_price < ice * 0.995 and vol_surge >= 1.2)
        is_jac = is_breakout_done or is_20d_high or (current_price >= creek * 0.995 and (vol_surge >= 1.2 or day_chg > 0.8))
        is_lps = (creek * 0.98 <= current_price <= creek * 1.04) and (current_price > tr_midpoint) and (vol_surge <= 1.3)
        is_spring = (current_price <= ice * 1.02) and (rsi <= 45)
        is_utad = (current_price >= creek * 0.99) and (rsi >= 68) and (day_chg < 0)
        is_climax = (vol_surge >= 2.0) and (abs(day_chg) >= 3.0)

        if is_markup:
            phase = "Phase E"
            structure = "Markup"
            event = "Markup Uptrend (Expansion)"
            breakout = round(max(creek, current_price * 1.008), 2)
            stoploss = round(max(ice, current_price * 0.92, sma20 * 0.97), 2)
            signal = "MARKUP RIDE"
            rationale = [
                f"Trading firmly above Wyckoff Creek (₹{creek}) in active Markup Phase E.",
                f"Strong alignment above 20 EMA (₹{sma20:.1f}) and 50 EMA (₹{sma50:.1f}).",
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
        elif is_sow:
            phase = "Phase D"
            structure = "Distribution"
            event = "Sign of Weakness (Break of Ice)"
            breakout = creek
            stoploss = round(max(creek, current_price * 1.05), 2)
            signal = "SOW EXIT / SHORT"
            rationale = [
                f"Major Sign of Weakness (SOW) breaking below Ice support (₹{ice}).",
                "Elevated selling volume and momentum breakdown.",
                "High probability of entering Phase E markdown."
            ]
        elif is_jac:
            phase = "Phase D"
            structure = "Accumulation"
            event = "Jump Across Creek (Sign of Strength)"
            breakout = round(max(creek * 1.002, current_price * 1.002), 2)
            stoploss = round(min(creek * 0.97, ice * 1.01), 2)
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
            breakout = round(max(creek * 1.005, current_price * 1.01), 2)
            stoploss = round(min(creek * 0.97, ice * 1.02), 2)
            signal = "LPS PULLBACK BUY"
            rationale = [
                f"Last Point of Support (LPS) successfully holding above Creek (₹{creek}).",
                "Low-volume pullback demonstrates floating supply is exhausted.",
                "Prime Wyckoff low-risk entry before Phase E markup acceleration."
            ]
        elif is_spring:
            phase = "Phase C"
            structure = "Accumulation"
            event = "Spring / Shakeout Test"
            breakout = creek
            stoploss = round(ice * 0.985, 2)
            signal = "SPRING TEST BUY"
            rationale = [
                f"Phase C Spring test under Ice support (₹{ice}) holding firmly.",
                "Liquidity sweep completed; supply dried up on the test.",
                f"Asymmetric risk-reward setup with stop loss strictly below Spring low (₹{stoploss})."
            ]
        elif is_utad:
            phase = "Phase C"
            structure = "Distribution"
            event = "UTAD (Upthrust After Distribution)"
            breakout = creek
            stoploss = round(creek * 1.025, 2)
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
            structure = "Accumulation" if (sma50 >= sma200 or rsi >= 48) else "Distribution"
            event = "Range Cause Building (Absorption)"
            breakout = creek
            stoploss = round(ice * 0.98, 2)
            signal = "CAUSE BUILDING WATCH"
            rationale = [
                f"Phase B Cause Building inside Trading Range: ₹{ice} (Ice) to ₹{creek} (Creek).",
                f"Consolidation inside {tr_height} pts horizontal range.",
                "Smart money absorbing supply; wait for Phase C Spring or Phase D breakout."
            ]

        dist_to_breakout = round(((breakout - current_price) / current_price) * 100.0, 2) if current_price > 0 else 0.0
        stoploss_risk_pct = round(((current_price - stoploss) / current_price) * 100.0, 2) if current_price > 0 else 0.0

        target_1 = round(creek + tr_height * 1.0, 2)
        target_2 = round(creek + tr_height * 2.0, 2)

        s["wyckoff_phase"] = phase
        s["wyckoff_structure"] = structure
        s["wyckoff_event"] = event
        s["wyckoff_creek"] = creek
        s["wyckoff_ice"] = ice
        s["wyckoff_breakout"] = breakout
        s["wyckoff_dist_to_breakout_pct"] = dist_to_breakout
        s["wyckoff_stoploss"] = stoploss
        s["wyckoff_stoploss_pct"] = stoploss_risk_pct
        s["wyckoff_target_1"] = target_1
        s["wyckoff_target_2"] = target_2
        s["wyckoff_signal"] = signal
        s["wyckoff_rationale"] = rationale

    # Update top 15 and worst 5
    data["all_stocks"] = stocks
    data["top_15_stocks"] = stocks[:15]
    data["worst_5_stocks"] = stocks[-5:]

    # Update summary
    smry = data.get("summary", {})
    smry["wyckoff_accumulation_count"] = sum(1 for s in stocks if s.get('wyckoff_structure') == 'Accumulation' and s.get('wyckoff_phase') in ['Phase C', 'Phase D'])
    smry["wyckoff_markup_count"] = sum(1 for s in stocks if s.get('wyckoff_phase') == 'Phase E' and s.get('wyckoff_structure') == 'Markup')
    smry["wyckoff_phase_c_springs"] = sum(1 for s in stocks if s.get('wyckoff_phase') == 'Phase C' and 'Spring' in s.get('wyckoff_event', ''))
    smry["wyckoff_phase_d_breakouts"] = sum(1 for s in stocks if s.get('wyckoff_phase') == 'Phase D' and s.get('wyckoff_structure') == 'Accumulation')
    smry["wyckoff_distribution_count"] = sum(1 for s in stocks if s.get('wyckoff_structure') in ['Distribution', 'Markdown'])
    data["summary"] = smry

    sanitized_data = sanitize_json(data)

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(sanitized_data, f, indent=2, allow_nan=False)

    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(f"window.{js_var_name} = " + json.dumps(sanitized_data, indent=2, allow_nan=False) + ";")

    print(f"Successfully enriched {json_path} and {js_path}!")

if __name__ == "__main__":
    enrich_file(os.path.join(BASE_DIR, "analysis_data.json"), os.path.join(BASE_DIR, "analysis_data.js"), "stockData")
    enrich_file(os.path.join(BASE_DIR, "nifty250_data.json"), os.path.join(BASE_DIR, "nifty250_data.js"), "nifty250Data")
