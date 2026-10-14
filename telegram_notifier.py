import os
import sys
import json
import time
import datetime
import requests

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "telegram_config.json")
TRACKER_FILE = os.path.join(BASE_DIR, "last_telegram_alerts.json")

def is_trading_day(dt=None):
    """Check if the given datetime (or now) is a weekday (Monday-Friday)."""
    if dt is None:
        dt = datetime.datetime.now()
    # 0 = Monday, ..., 4 = Friday, 5 = Saturday, 6 = Sunday
    return dt.weekday() < 5

def is_market_hours(dt=None):
    """
    Check if current time is within Indian Stock Market (NSE/BSE) trading hours:
    Monday to Friday, 09:15 AM to 03:30 PM IST.
    """
    if dt is None:
        dt = datetime.datetime.now()
    if not is_trading_day(dt):
        return False
    
    t = dt.time()
    market_open = datetime.time(9, 15)
    market_close = datetime.time(15, 30)
    return market_open <= t <= market_close

def is_morning_briefing_window(dt=None):
    """
    Check if current time is in the pre-market morning summary window:
    Monday to Friday, 08:20 AM to 09:10 AM IST (centered around 8:30 AM).
    """
    if dt is None:
        dt = datetime.datetime.now()
    if not is_trading_day(dt):
        return False
    
    t = dt.time()
    briefing_start = datetime.time(8, 20)
    briefing_end = datetime.time(9, 10)
    return briefing_start <= t <= briefing_end

def load_telegram_config():
    """Load configuration from file or environment variables."""
    cfg = {
        "enabled": False,
        "bot_token": os.environ.get("TELEGRAM_BOT_TOKEN", "").strip(),
        "chat_id": os.environ.get("TELEGRAM_CHAT_ID", "").strip(),
        "alert_on_breakout": False,
        "alert_on_spring": False,
        "alert_morning_briefing": False
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
                cfg.update(saved)
        except Exception:
            pass
    # Env vars populate token/chat if not already specified, but do not override explicit enabled=false
    if not cfg.get("bot_token") and os.environ.get("TELEGRAM_BOT_TOKEN"):
        cfg["bot_token"] = os.environ.get("TELEGRAM_BOT_TOKEN").strip()
    if not cfg.get("chat_id") and os.environ.get("TELEGRAM_CHAT_ID"):
        cfg["chat_id"] = os.environ.get("TELEGRAM_CHAT_ID").strip()
    return cfg

def save_telegram_config(cfg):
    """Save configuration to telegram_config.json."""
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2)

def load_alert_tracker():
    """Load the deduplication tracker file to avoid duplicate alerts."""
    if os.path.exists(TRACKER_FILE):
        try:
            with open(TRACKER_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception:
            return {}
    return {}

def save_alert_tracker(tracker):
    """Save the deduplication tracker."""
    with open(TRACKER_FILE, 'w', encoding='utf-8') as f:
        json.dump(tracker, f, indent=2)

def send_telegram_message(message_html, bot_token=None, chat_id=None, is_test=False):
    """Send an HTML-formatted message via Telegram Bot API."""
    cfg = load_telegram_config()
    if not is_test and not cfg.get("enabled", False):
        return {"status": "disabled", "message": "Telegram alerts are disabled"}

    token = (bot_token or cfg.get("bot_token", "")).strip()
    chat = (chat_id or cfg.get("chat_id", "")).strip()

    if not token or not chat:
        return {"status": "error", "message": "Telegram Bot Token or Chat ID not configured"}

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat,
        "text": message_html,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }

    try:
        resp = requests.post(url, json=payload, timeout=12)
        data = resp.json()
        if data.get("ok"):
            return {"status": "success", "message": "Telegram message sent successfully"}
        else:
            err_desc = data.get("description", "Unknown Telegram API error")
            return {"status": "error", "message": f"Telegram API Error: {err_desc}"}
    except Exception as e:
        return {"status": "error", "message": f"Network error sending Telegram message: {str(e)}"}

def should_alert(symbol, alert_type="breakout", cooldown_hours=8):
    """
    Check if we already alerted for this stock today.
    Enforces once-per-day per-stock alerting.
    """
    tracker = load_alert_tracker()
    today_str = datetime.datetime.now().strftime("%Y-%m-%d")
    key = f"{symbol}_{today_str}_{alert_type}"

    now_ts = time.time()
    last_sent = tracker.get(key, 0)
    if now_ts - last_sent < (cooldown_hours * 3600):
        return False

    tracker[key] = now_ts
    save_alert_tracker(tracker)
    return True

def has_sent_briefing_today():
    """Check if the morning briefing was already sent today."""
    tracker = load_alert_tracker()
    today_str = datetime.datetime.now().strftime("%Y-%m-%d")
    return tracker.get("last_morning_briefing_date") == today_str

def mark_briefing_sent_today():
    """Record that the morning briefing was dispatched today."""
    tracker = load_alert_tracker()
    today_str = datetime.datetime.now().strftime("%Y-%m-%d")
    tracker["last_morning_briefing_date"] = today_str
    save_alert_tracker(tracker)

def format_single_breakout_alert(stock):
    """Format a clean, institutional breakout alert for Telegram."""
    clean_sym = stock.get('clean_symbol', stock.get('symbol', '')).replace('.NS', '').replace('.BO', '')
    name = stock.get('name', clean_sym)
    price = stock.get('current_price', 0)
    chg = stock.get('day_change_pct', stock.get('change_pct', 0))
    trigger = stock.get('buy_trigger_level', 0)
    target1 = stock.get('swing_target_1', 0)
    target2 = stock.get('swing_target_2', 0)
    sl = stock.get('swing_stoploss', 0)
    vol_surge = stock.get('vol_surge_ratio', stock.get('volume_surge_multiple', 1.0))
    wyckoff = stock.get('wyckoff', {})
    phase = wyckoff.get('phase', '') if isinstance(wyckoff, dict) else ''

    chg_sign = "+" if chg >= 0 else ""
    chg_emoji = "🟢" if chg >= 0 else "🔴"

    lines = [
        f"🚀 <b>[NSE LIVE TRIGGER] {name} ({clean_sym})</b>",
        f"━━━━━━━━━━━━━━━━━━━━",
        f"💵 <b>Current Price:</b> ₹{price:,.2f} ({chg_emoji} {chg_sign}{chg:.2f}%)",
        f"🎯 <b>Buy Trigger:</b> ₹{trigger:,.2f}  ✅ <i>TRIGGERED!</i>",
        f"⚡ <b>Volume Surge:</b> <b>{vol_surge:.1f}x</b> vs 20D Avg",
    ]

    if phase:
        lines.append(f"🏛️ <b>Wyckoff Setup:</b> {phase}")

    lines.extend([
        f"━━━━━━━━━━━━━━━━━━━━",
        f"🎯 <b>Target 1:</b> ₹{target1:,.2f}  |  <b>Target 2:</b> ₹{target2:,.2f}",
        f"🛑 <b>Stop Loss:</b> ₹{sl:,.2f}",
        f"📊 <b>Scores:</b> Tech {stock.get('technical_score', 0)}/100 • Comp {stock.get('composite_score', 0)}/100",
        f"━━━━━━━━━━━━━━━━━━━━",
        f"⏰ <i>{datetime.datetime.now().strftime('%d %b %Y, %I:%M %p')} IST • Market Hours Live Alert</i>"
    ])

    return "\n".join(lines)

def format_batch_breakout_alert(stocks):
    """Format a consolidated digest message when multiple stocks break out at once."""
    count = len(stocks)
    now_str = datetime.datetime.now().strftime('%d %b %Y, %I:%M %p')
    lines = [
        f"🚀 <b>[NSE LIVE BREAKOUTS] {count} Setups Triggered!</b>",
        f"━━━━━━━━━━━━━━━━━━━━",
        f"⚡ <i>Multiple high-conviction breakout triggers detected during market hours.</i>\n"
    ]

    for s in stocks:
        clean_sym = s.get('clean_symbol', s.get('symbol', '')).replace('.NS', '').replace('.BO', '')
        name = s.get('name', clean_sym)
        price = s.get('current_price', 0)
        chg = s.get('day_change_pct', s.get('change_pct', 0))
        trigger = s.get('buy_trigger_level', 0)
        t1 = s.get('swing_target_1', 0)
        sl = s.get('swing_stoploss', 0)
        vol_surge = s.get('vol_surge_ratio', s.get('volume_surge_multiple', 1.0))
        chg_sign = "+" if chg >= 0 else ""

        lines.append(f"🔹 <b>{name} ({clean_sym})</b>")
        lines.append(f"   • Price: <b>₹{price:,.2f}</b> ({chg_sign}{chg:.2f}%) | Trigger: <b>₹{trigger:,.2f}</b>")
        lines.append(f"   • Vol Surge: <b>{vol_surge:.1f}x</b> | Tgt: ₹{t1:,.2f} | SL: ₹{sl:,.2f}")
        lines.append("")

    lines.extend([
        f"━━━━━━━━━━━━━━━━━━━━",
        f"⏰ <i>{now_str} IST • Indian Stock Screener</i>"
    ])
    return "\n".join(lines)

def send_breakout_notifications(stocks_list, force=False):
    """
    Scan and dispatch alerts for stocks breaking out today.
    Strictly constrained to Market Hours (9:15 AM - 3:30 PM IST Mon-Fri) unless forced.
    Prevents spamming by batching multiple alerts and deduplicating per stock per day.
    """
    cfg = load_telegram_config()
    if not cfg.get("enabled") or not cfg.get("alert_on_breakout"):
        return 0

    if not cfg.get("bot_token") or not cfg.get("chat_id"):
        return 0

    # 1. Market Hours & Weekend Guard
    if not force and not is_market_hours():
        # Do not send breakout alerts on weekends or outside trading hours
        return 0

    # 2. Filter genuine high-conviction triggers
    candidate_stocks = []
    for s in stocks_list:
        is_triggered = (
            bool(s.get('is_breakout_done_today')) or 
            (s.get('swing_signal') == 'BREAKOUT BUY' and float(s.get('vol_surge_ratio', 1.0)) >= 1.25)
        )
        vol_surge = float(s.get('vol_surge_ratio', s.get('volume_surge_multiple', 1.0)))
        tech_score = float(s.get('technical_score', 0))
        comp_score = float(s.get('composite_score', 0))
        price = float(s.get('current_price', 0))

        # Quality filters:
        # - Genuine breakout trigger
        # - Healthy volume surge >= 1.25x
        # - Decent score (Tech or Comp >= 50)
        # - Non-penny stock (Price >= Rs. 20)
        if (is_triggered and vol_surge >= 1.25 and (tech_score >= 50 or comp_score >= 50) and price >= 20) or force:
            sym = s.get('symbol')
            if force or should_alert(sym, "breakout", cooldown_hours=8):
                candidate_stocks.append(s)

    if not candidate_stocks:
        return 0

    # Sort candidates by volume surge & composite score descending
    candidate_stocks.sort(key=lambda x: (x.get('vol_surge_ratio', 1.0), x.get('composite_score', 0)), reverse=True)

    sent_count = 0

    # 3. Anti-Spam Dispatching:
    # If 1 or 2 stocks triggered: send individual cards.
    # If 3 or more stocks triggered: combine into 1 consolidated digest (top 6 setups max).
    if len(candidate_stocks) <= 2:
        for s in candidate_stocks:
            msg = format_single_breakout_alert(s)
            res = send_telegram_message(msg)
            if res.get("status") == "success":
                sent_count += 1
                time.sleep(1)
            else:
                print(f"Telegram alert error for {s.get('symbol')}: {res.get('message')}")
    else:
        # Batch digest for multiple stocks to prevent chat spam
        top_stocks = candidate_stocks[:6]
        msg = format_batch_breakout_alert(top_stocks)
        res = send_telegram_message(msg)
        if res.get("status") == "success":
            sent_count += len(top_stocks)
        else:
            print(f"Telegram batch alert error: {res.get('message')}")

    return sent_count

def send_test_alert(bot_token=None, chat_id=None):
    """Send an immediate test alert to verify Telegram credentials (manual UI test)."""
    test_msg = (
        f"🔔 <b>[TEST] Indian Stock Analyzer Bot Connected!</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"✅ Telegram bot alerts are active and verified.\n"
        f"⚡ <b>Live Trigger Alerts:</b> Sent ONLY during NSE/BSE market hours (9:15 AM – 3:30 PM IST, Mon–Fri).\n"
        f"🌅 <b>Pre-Market Summary:</b> Sent once per day at 8:30 AM IST (Mon–Fri).\n"
        f"🚫 <b>Weekend Policy:</b> No alerts on Saturdays & Sundays.\n"
        f"🛡️ <b>Anti-Spam Filter:</b> High-conviction setups only, deduplicated daily.\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"⏰ <i>Timestamp: {datetime.datetime.now().strftime('%d %b %Y, %I:%M:%S %p')} IST</i>"
    )
    return send_telegram_message(test_msg, bot_token=bot_token, chat_id=chat_id, is_test=True)
