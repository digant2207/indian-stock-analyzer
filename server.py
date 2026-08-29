import os
import sys
import json
import csv
import time
import datetime
import threading
import subprocess
import requests
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import email_notifier

PORT = 8080
LOCK = threading.Lock()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATUS_FILE = os.path.join(BASE_DIR, "scan_status.json")

def update_scan_status(is_running, pct=0, msg="Idle"):
    try:
        utc_now = datetime.datetime.now(datetime.timezone.utc)
        ist_now = utc_now + datetime.timedelta(hours=5, minutes=30)
        with open(STATUS_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                "is_running": is_running,
                "progress_pct": pct,
                "status_message": msg,
                "last_updated": ist_now.strftime("%Y-%m-%d %I:%M %p IST"),
                "timestamp": int(time.time())
            }, f, indent=2)
    except Exception as e:
        print(f"Error updating scan status: {e}")

def get_python_exe():
    venv_py = os.path.join(BASE_DIR, ".venv", "Scripts", "python.exe")
    if os.path.exists(venv_py):
        return venv_py
    return sys.executable

def run_analysis_tasks():
    with LOCK:
        print(f"[{datetime.datetime.now()}] Triggering Live Stock Re-analysis & Google Sheet Sync...")
        update_scan_status(True, 1, "Initializing live market scanner & syncing Google Sheet...")
        py_exe = get_python_exe()
        try:
            runner_script = os.path.join(BASE_DIR, "fast_runner.py")
            if os.path.exists(runner_script):
                subprocess.run([py_exe, runner_script], check=True, cwd=BASE_DIR)
            else:
                analyzer_script = os.path.join(BASE_DIR, "analyzer.py")
                subprocess.run([py_exe, analyzer_script], check=True, cwd=BASE_DIR)

            print(f"[{datetime.datetime.now()}] Analysis completed successfully!")
            update_scan_status(False, 100, "Scan Complete! All stocks updated.")
            
            # Send Morning Email Digest if configured
            try:
                a_json = os.path.join(BASE_DIR, "analysis_data.json")
                n_json = os.path.join(BASE_DIR, "nifty250_data.json")
                if os.path.exists(a_json) and os.path.exists(n_json):
                    with open(a_json, 'r', encoding='utf-8') as f:
                        a_data = json.load(f)
                    with open(n_json, 'r', encoding='utf-8') as f:
                        n_data = json.load(f)
                    email_notifier.send_morning_digest(a_data, n_data)
            except Exception as em_err:
                print(f"Email digest notice: {em_err}")

            return True, "Analysis updated successfully!"
        except Exception as e:
            err_msg = f"Analysis error: {e}"
            print(f"[{datetime.datetime.now()}] {err_msg}")
            update_scan_status(False, 0, f"Scan failed: {e}")
            return False, err_msg

def get_next_run_target(now):
    weekday = now.weekday()
    candidates = []
    # 1. Daily 8:00 AM IST
    t_8am = now.replace(hour=8, minute=0, second=0, microsecond=0)
    if t_8am > now:
        candidates.append((t_8am, "Daily 8:00 AM Morning Scan"))
    else:
        candidates.append((t_8am + datetime.timedelta(days=1), "Daily 8:00 AM Morning Scan"))

    # 2. Weekdays Market Hours (Mon-Fri 9:15 AM to 3:30 PM IST)
    if weekday <= 4:
        for hour, minute in [
            (9, 15), (9, 30), (10, 0), (10, 30), (11, 0), (11, 30),
            (12, 0), (12, 30), (13, 0), (13, 30), (14, 0), (14, 30),
            (15, 0), (15, 30)
        ]:
            t_slot = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if t_slot > now:
                candidates.append((t_slot, f"Live Market {hour:02d}:{minute:02d} Scan"))

    candidates.sort(key=lambda x: x[0])
    return candidates[0]

def automated_market_scheduler_thread():
    print("Automated 8:00 AM & 30-Min Market Hours Scheduler Thread Active.")
    while True:
        now = datetime.datetime.now()
        next_time, next_reason = get_next_run_target(now)
        seconds_to_wait = max(5, (next_time - now).total_seconds())
        mins = round(seconds_to_wait / 60, 1)
        print(f"Next automated run: {next_time.strftime('%Y-%m-%d %I:%M %p')} ({next_reason}) [in {mins} mins]")
        time.sleep(seconds_to_wait)
        run_analysis_tasks()

def resolve_yahoo_symbol(query):
    query = query.strip()
    if not query:
        return None

    upper_q = query.upper().replace(" ", "")
    candidates = []
    if upper_q.endswith(".NS") or upper_q.endswith(".BO"):
        candidates.append(upper_q)
    else:
        candidates.append(upper_q + ".NS")
        candidates.append(upper_q + ".BO")

    try:
        url = f"https://query1.finance.yahoo.com/1/finance/search?q={requests.utils.quote(query)}&quotesCount=10&newsCount=0"
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            quotes = data.get('quotes', [])
            for q in quotes:
                sym = q.get('symbol', '')
                if sym.endswith('.NS') or sym.endswith('.BO'):
                    candidates.insert(0, sym)
                    break
    except Exception as e:
        print(f"Yahoo Search API warning: {e}")

    import fast_runner
    for sym in candidates:
        try:
            res = fast_runner.fetch_stock_data({"symbol": sym, "name": query.upper(), "sector": "NSE/BSE Search"})
            if res:
                return res
        except Exception:
            continue

    return None

class CustomRequestHandler(SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        query = parse_qs(parsed_url.query)

        if path == '/api/health':
            self.handle_health()
        elif path == '/api/refresh' or path == '/api/run_analysis':
            self.handle_refresh()
        elif path == '/api/scan_status':
            self.handle_scan_status()
        elif path == '/api/search_stock':
            symbol = query.get('symbol', [''])[0].strip()
            self.handle_search_stock(symbol)
        elif path == '/api/get_email_config':
            cfg = email_notifier.load_email_config()
            cfg['app_password'] = '********' if cfg.get('app_password') else ''
            payload = json.dumps(cfg).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(payload)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/refresh' or self.path == '/api/run_analysis':
            self.handle_refresh()
        elif self.path == '/api/save_gsheet':
            self.handle_save_gsheet()
        elif self.path == '/api/add_stock':
            self.handle_add_stock()
        elif self.path == '/api/save_email_config':
            self.handle_save_email_config()
        elif self.path == '/api/test_email':
            self.handle_test_email()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_health(self):
        payload = json.dumps({"status": "ok", "mode": "local_server", "version": "2.0"}).encode('utf-8')
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def handle_scan_status(self):
        status_payload = {"is_running": False, "progress_pct": 100, "status_message": "Idle"}
        if os.path.exists(STATUS_FILE):
            try:
                with open(STATUS_FILE, 'r', encoding='utf-8') as f:
                    status_payload = json.load(f)
            except Exception:
                pass
        res = json.dumps(status_payload).encode('utf-8')
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(res)))
        self.end_headers()
        self.wfile.write(res)

    def handle_refresh(self):
        update_scan_status(True, 1, "Starting live market scanner in background...")
        threading.Thread(target=run_analysis_tasks, daemon=True).start()
        payload = json.dumps({"status": "success", "message": "Re-analysis started in background!"}).encode('utf-8')
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def handle_save_email_config(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        try:
            body = json.loads(post_data.decode('utf-8'))
            cfg = email_notifier.load_email_config()
            
            cfg['enabled'] = bool(body.get('enabled', True))
            cfg['recipient_email'] = body.get('recipient_email', '').strip()
            cfg['sender_email'] = body.get('sender_email', '').strip()
            
            pwd = body.get('app_password', '').strip()
            if pwd and pwd != '********':
                cfg['app_password'] = pwd
                
            email_notifier.save_email_config(cfg)
            res = json.dumps({"status": "success", "message": "✅ Email settings saved!"}).encode('utf-8')
        except Exception as e:
            res = json.dumps({"status": "error", "message": str(e)}).encode('utf-8')

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(res)

    def handle_test_email(self):
        try:
            a_json = os.path.join(os.path.dirname(__file__), "analysis_data.json")
            n_json = os.path.join(os.path.dirname(__file__), "nifty250_data.json")
            
            a_data, n_data = {}, {}
            if os.path.exists(a_json):
                with open(a_json, 'r', encoding='utf-8') as f: a_data = json.load(f)
            if os.path.exists(n_json):
                with open(n_json, 'r', encoding='utf-8') as f: n_data = json.load(f)
                
            success, msg = email_notifier.send_morning_digest(a_data, n_data)
            res = json.dumps({"status": "success" if success else "error", "message": msg}).encode('utf-8')
        except Exception as e:
            res = json.dumps({"status": "error", "message": str(e)}).encode('utf-8')

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(res)

    def handle_search_stock(self, symbol):
        if not symbol:
            res = json.dumps({"status": "error", "message": "Symbol is required"}).encode('utf-8')
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(res)
            return

        try:
            stock_data = resolve_yahoo_symbol(symbol)
            if stock_data:
                res = json.dumps({"status": "success", "stock": stock_data}).encode('utf-8')
            else:
                res = json.dumps({"status": "error", "message": f"Could not find valid NSE/BSE stock data for '{symbol}'."}).encode('utf-8')
        except Exception as e:
            res = json.dumps({"status": "error", "message": str(e)}).encode('utf-8')

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(res)

    def handle_add_stock(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            body = json.loads(post_data.decode('utf-8'))
            symbol = body.get('symbol', '').strip().upper()
            name = body.get('name', symbol).strip()
            sector = body.get('sector', 'User Added').strip()

            if not symbol:
                res = json.dumps({"status": "error", "message": "Symbol is required"}).encode('utf-8')
            else:
                clean_sym = symbol if (symbol.endswith('.NS') or symbol.endswith('.BO')) else symbol + '.NS'
                stocks_csv = os.path.join(os.path.dirname(__file__), "stocks.csv")
                
                existing = []
                already_exists = False
                if os.path.exists(stocks_csv):
                    with open(stocks_csv, 'r', encoding='utf-8') as f:
                        reader = csv.DictReader(f)
                        for r in reader:
                            existing.append(r)
                            if r.get('symbol', '').upper() == clean_sym:
                                already_exists = True

                if not already_exists:
                    with open(stocks_csv, 'a', encoding='utf-8', newline='') as f:
                        writer = csv.writer(f)
                        writer.writerow([clean_sym, name, sector, 'Equity', 'Added by User from Strength Screener'])
                    
                    threading.Thread(target=run_analysis_tasks, daemon=True).start()
                    res = json.dumps({"status": "success", "message": f"✅ {clean_sym.replace('.NS','')} added to Spark Stock List & daily 3 AM scan!"}).encode('utf-8')
                else:
                    res = json.dumps({"status": "info", "message": f"{clean_sym.replace('.NS','')} is already in your Spark Stock List!"}).encode('utf-8')

        except Exception as e:
            res = json.dumps({"status": "error", "message": str(e)}).encode('utf-8')

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(res)

    def handle_save_gsheet(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            body = json.loads(post_data.decode('utf-8'))
            gsheet_url = body.get('google_sheet_url', '').strip()
            
            if gsheet_url:
                config_path = os.path.join(os.path.dirname(__file__), "google_sheet_config.json")
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump({"google_sheet_url": gsheet_url}, f, indent=2)
                    
                threading.Thread(target=run_analysis_tasks, daemon=True).start()
                res = json.dumps({"status": "success", "message": "Google Sheet saved and synced!"}).encode('utf-8')
            else:
                res = json.dumps({"status": "error", "message": "Invalid Google Sheet URL"}).encode('utf-8')
        except Exception as e:
            res = json.dumps({"status": "error", "message": str(e)}).encode('utf-8')

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(res)

def run_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    t = threading.Thread(target=automated_market_scheduler_thread, daemon=True)
    t.start()

    server_address = ('', PORT)
    httpd = HTTPServer(server_address, CustomRequestHandler)
    print("=========================================================================")
    print(f"   Indian Stock Screener Server Active on Port {PORT}                  ")
    print(f"   Local PC Access:   http://localhost:{PORT}                         ")
    print(f"   Mobile Wi-Fi Link: http://192.168.1.104:{PORT}                     ")
    print("   Automated 8 AM & 30-Min Market Hours Scheduler: ACTIVE              ")
    print("=========================================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")

if __name__ == "__main__":
    run_server()
