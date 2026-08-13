import os
import json
import smtplib
import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "email_config.json")

def load_email_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "enabled": False,
        "sender_email": "",
        "app_password": "",
        "recipient_email": "",
        "smtp_server": "smtp.gmail.com",
        "smtp_port": 587
    }

def save_email_config(cfg):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2)

def generate_email_html(analysis_data, nifty_data):
    all_stocks = (analysis_data.get('all_stocks') or []) + (nifty_data.get('all_stocks') or [])
    
    # Deduplicate
    unique_map = {}
    for s in all_stocks:
        if s.get('symbol'):
            unique_map[s['symbol']] = s
    stocks_list = list(unique_map.values())
    stocks_list.sort(key=lambda x: x.get('composite_score', 0), reverse=True)

    today_str = datetime.datetime.now().strftime("%d %b %Y")

    # Filter Today's Breakout Setups (Max 15)
    breakout_stocks = [
        s for s in stocks_list 
        if s.get('is_breakout_done_today') or s.get('is_20d_high_breakout') or (s.get('swing_signal') == 'BREAKOUT BUY')
    ][:15]

    # Filter Corporate Events
    events_list = []
    for s in stocks_list:
        for e in s.get('events', []):
            if e.get('date_tag') in ['Today', 'Tomorrow']:
                events_list.append({**e, "symbol": s.get('clean_symbol', s.get('symbol')), "name": s.get('name')})

    # Render HTML Rows for Breakouts
    breakout_rows = ""
    if breakout_stocks:
        for idx, s in enumerate(breakout_stocks, 1):
            clean_sym = s.get('clean_symbol', s.get('symbol', '')).replace('.NS', '').replace('.BO', '')
            price = f"₹{s.get('current_price', 0):,.2f}"
            trigger = f"₹{s.get('buy_trigger_level', 0):,.2f}"
            target = f"₹{s.get('swing_target_1', 0):,.2f}"
            sl = f"₹{s.get('swing_stoploss', 0):,.2f}"
            status = "🔥 BREAKOUT DONE TODAY" if s.get('is_breakout_done_today') else "Near Breakout Level"
            
            breakout_rows += f"""
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px;"><strong>#{idx} {s.get('name', clean_sym)}</strong> ({clean_sym})</td>
                <td style="padding:10px; font-weight:bold;">{price}</td>
                <td style="padding:10px; color:#059669; font-weight:bold;">{trigger}</td>
                <td style="padding:10px;">{target}</td>
                <td style="padding:10px; color:#dc2626;">{sl}</td>
                <td style="padding:10px;"><span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:12px; font-size:12px; font-weight:bold;">{status}</span></td>
            </tr>
            """
    else:
        breakout_rows = '<tr><td colspan="6" style="padding:12px; color:#64748b;">No high-volume breakouts triggered today. Market in consolidation.</td></tr>'

    # Render HTML Rows for Events
    event_rows = ""
    if events_list:
        for e in events_list[:10]:
            event_rows += f"""
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px;"><strong>{e.get('name', e.get('symbol'))}</strong></td>
                <td style="padding:10px;"><span style="background:#e0f2fe; color:#0369a1; padding:3px 8px; border-radius:12px; font-size:12px; font-weight:bold;">{e.get('date_tag')}</span></td>
                <td style="padding:10px; font-weight:bold; color:#0f172a;">{e.get('type')}</td>
                <td style="padding:10px; color:#334155;">{e.get('title')}</td>
            </tr>
            """
    else:
        event_rows = '<tr><td colspan="4" style="padding:12px; color:#64748b;">No major corporate events announced for today or tomorrow.</td></tr>'

    # Top 5 Overall Stocks
    top5_rows = ""
    for idx, s in enumerate(stocks_list[:5], 1):
        clean_sym = s.get('clean_symbol', s.get('symbol', '')).replace('.NS', '').replace('.BO', '')
        top5_rows += f"""
        <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px;"><strong>#{idx} {s.get('name', clean_sym)}</strong></td>
            <td style="padding:8px; font-weight:bold;">₹{s.get('current_price', 0):,.2f}</td>
            <td style="padding:8px; color:#059669; font-weight:bold;">{s.get('composite_score', 0):.1f} / 100</td>
            <td style="padding:8px;">{s.get('long_term_signal', 'BUY')}</td>
        </tr>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }}
            .container {{ max-width: 700px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }}
            .header {{ background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 24px; text-align: center; }}
            .header h1 {{ margin: 0; font-size: 22px; color: #38bdf8; }}
            .header p {{ margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; }}
            .content {{ padding: 24px; }}
            .section-title {{ font-size: 16px; font-weight: 700; color: #0f172a; border-left: 4px solid #0284c7; padding-left: 10px; margin: 24px 0 12px 0; }}
            table {{ width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px; }}
            th {{ background: #f1f5f9; color: #475569; text-align: left; padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }}
            .footer {{ background: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }}
            .btn {{ display: inline-block; background: #0284c7; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; font-size: 13px; margin-top: 10px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📈 Indian Stock Market Daily Intelligence</h1>
                <p>Morning Digest & Catalyst Report • {today_str}</p>
            </div>
            <div class="content">
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 16px; margin-bottom:20px; font-size:13px; color:#166534;">
                    <strong>Automated 3:00 AM Scan Summary:</strong> Scanned {len(stocks_list)} stocks across NSE/BSE. 
                    Found {len(breakout_stocks)} high-momentum breakout setups & {len(events_list)} major corporate events.
                </div>

                <div class="section-title">🎯 Today's Top Breakout Setups</div>
                <table>
                    <thead>
                        <tr>
                            <th>Stock Name</th>
                            <th>Price</th>
                            <th>Buy Trigger</th>
                            <th>Target 1</th>
                            <th>Stop Loss</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {breakout_rows}
                    </tbody>
                </table>

                <div class="section-title">📰 Major Corporate Events (Today & Tomorrow)</div>
                <table>
                    <thead>
                        <tr>
                            <th>Stock</th>
                            <th>Timeline</th>
                            <th>Event Category</th>
                            <th>Announcement Title</th>
                        </tr>
                    </thead>
                    <tbody>
                        {event_rows}
                    </tbody>
                </table>

                <div class="section-title">🔥 Top 5 High-Score Quality Stocks</div>
                <table>
                    <thead>
                        <tr>
                            <th>Stock</th>
                            <th>Price</th>
                            <th>Score</th>
                            <th>Long Term Signal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {top5_rows}
                    </tbody>
                </table>

                <div style="text-align:center; margin-top:24px;">
                    <a href="http://192.168.1.104:8080" class="btn">🚀 Open Full Screener Dashboard</a>
                </div>
            </div>
            <div class="footer">
                Automated Indian Stock Screener & AI Analyst • Powered by Daily 3 AM Automated Market Intelligence
            </div>
        </div>
    </body>
    </html>
    """
    return html

def send_morning_digest(analysis_data, nifty_data):
    cfg = load_email_config()
    if not cfg.get('enabled') or not cfg.get('recipient_email') or not cfg.get('sender_email') or not cfg.get('app_password'):
        print("[Email Notifier] Email notifications disabled or credentials not configured.")
        return False, "Email notifications disabled or missing credentials."

    try:
        html_content = generate_email_html(analysis_data, nifty_data)
        today_str = datetime.datetime.now().strftime("%d %b %Y")
        subject = f"📈 Stock Market Morning Digest ({today_str}) - Breakouts & Corporate Events"

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"Stock Analyst <{cfg['sender_email']}>"
        msg["To"] = cfg["recipient_email"]

        part = MIMEText(html_content, "html")
        msg.attach(part)

        server = smtplib.SMTP(cfg.get("smtp_server", "smtp.gmail.com"), cfg.get("smtp_port", 587))
        server.starttls()
        server.login(cfg["sender_email"], cfg["app_password"])
        server.sendmail(cfg["sender_email"], [cfg["recipient_email"]], msg.as_string())
        server.quit()

        print(f"[{datetime.datetime.now()}] ✅ Morning Email Digest successfully sent to {cfg['recipient_email']}!")
        return True, f"Email digest sent to {cfg['recipient_email']}!"
    except Exception as e:
        err_msg = f"Failed to send email: {e}"
        print(f"[{datetime.datetime.now()}] ❌ {err_msg}")
        return False, err_msg
