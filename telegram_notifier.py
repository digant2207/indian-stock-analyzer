import os
import json
import time
import datetime
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "telegram_config.json")
TRACKER_FILE = os.path.join(BASE_DIR, "last_telegram_alerts.json")

def load_telegram_config():
    """Load configuration from file or environment variables."""
    cfg = {
        "enabled": True,
        "bot_token": os.environ.get("TELEGRAM_BOT_TOKEN", "").strip(),
        "chat_id": os.environ.get("TELEGRAM_CHAT_ID", "").strip(),
        "alert_on_breakout": True,
        "alert_on_spring": True,
        "alert_morning_briefing": True
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
                cfg.update(saved)
        except Exception:
            pass
    # Env vars take precedence if defined
    if os.environ.get("TELEGRAM_BOT_TOKEN"):
        cfg["bot_token"] = os.environ.get("TELEGRAM_BOT_TOKEN").strip()
    if os.environ.get("TELEGRAM_CHAT_ID"):
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
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_alert_tracker(tracker):
    """Save the deduplication tracker."""
    with open(TRACKER_FILE, 'w', encoding='utf-8') as f:
        json.dump(tracker, f, indent=2)

def send_telegram_message(message_html, bot_token=None, chat_id=None):
    """Send an HTML-formatted message via Telegram Bot API."""
    cfg = load_telegram_config()
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

def should_alert(symbol, alert_type="breakout", cooldown_hours=4):
    """Check if we already alerted for this stock within cooldown window today."""
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

def format_breakout_alert(stock):
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
        f"🚀 <b>[NSE BREAKOUT ALERT] {name} ({clean_sym})</b>",
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
        f"📊 <b>Scores:</b> Tech {stock.get('technical_score', 0)}/100 • Fund {stock.get('fundamental_score', 0)}/100",
        f"━━━━━━━━━━━━━━━━━━━━",
        f"⏰ <i>{datetime.datetime.now().strftime('%d %b %Y, %I:%M %p')} IST • Automated Cloud Bot</i>"
    ])

    return "\n".join(lines)

def send_breakout_notifications(stocks_list, force=False):
    """Scan and dispatch alerts for stocks breaking out today."""
    cfg = load_telegram_config()
    if not cfg.get("enabled") or not cfg.get("alert_on_breakout"):
        return 0

    if not cfg.get("bot_token") or not cfg.get("chat_id"):
        return 0

    sent_count = 0
    for s in stocks_list:
        is_triggered = (
            s.get('is_breakout_done_today') or 
            s.get('is_20d_high_breakout') or 
            s.get('wyckoff_breakout') or
            s.get('swing_signal') == 'BREAKOUT BUY'
        )
        vol_surge = s.get('vol_surge_ratio', s.get('volume_surge_multiple', 1.0))

        # Only alert if triggered and volume is healthy (or force)
        if is_triggered:
            sym = s.get('symbol')
            if force or should_alert(sym, "breakout", cooldown_hours=4):
                msg = format_breakout_alert(s)
                res = send_telegram_message(msg)
                if res.get("status") == "success":
                    sent_count += 1
                    time.sleep(1) # Respect Telegram rate limit (1 msg/sec)
                else:
                    print(f"Telegram alert error for {sym}: {res.get('message')}")

    return sent_count

def send_test_alert(bot_token=None, chat_id=None):
    """Send an immediate test alert to verify Telegram credentials."""
    test_msg = (
        f"🔔 <b>[TEST] Indian Stock Analyzer Bot Connected!</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"✅ Telegram bot alerts are configured and active.\n"
        f"⚡ You will receive instant notifications whenever a stock triggers a volume breakout during NSE/BSE market hours (9:15 AM – 3:30 PM IST).\n"
        f"🌅 Pre-market AI analyst briefing will be delivered at 8:30 AM.\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"⏰ <i>Timestamp: {datetime.datetime.now().strftime('%d %b %Y, %I:%M:%S %p')} IST</i>"
    )
    return send_telegram_message(test_msg, bot_token=bot_token, chat_id=chat_id)
