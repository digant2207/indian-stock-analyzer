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

def get_python_exe():
    venv_py = os.path.join(os.path.dirname(__file__), ".venv", "Scripts", "python.exe")
    if os.path.exists(venv_py):
        return venv_py
    return sys.executable

def run_analysis_tasks():
    with LOCK:
        print(f"[{datetime.datetime.now()}] Triggering Live Stock Re-analysis & Google Sheet Sync...")
        py_exe = get_python_exe()
        try:
            runner_script = os.path.join(os.path.dirname(__file__), "fast_runner.py")
            if os.path.exists(runner_script):
                subprocess.run([py_exe, runner_script], check=True)
            else:
                analyzer_script = os.path.join(os.path.dirname(__file__), "analyzer.py")
                subprocess.run([py_exe, analyzer_script], check=True)

            print(f"[{datetime.datetime.now()}] Analysis completed successfully!")
            
            # Send Morning Email Digest if configured
            try:
                a_json = os.path.join(os.path.dirname(__file__), "analysis_data.json")
                n_json = os.path.join(os.path.dirname(__file__), "nifty250_data.json")
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
            return False, err_msg

def daily_3am_scheduler_thread():
    print("Daily 3:00 AM Auto-Scheduler Thread Active.")
    while True:
        now = datetime.datetime.now()
        target = now.replace(hour=3, minute=0, second=0, microsecond=0)
        if now >= target:
            target += datetime.timedelta(days=1)
            
        seconds_to_wait = (target - now).total_seconds()
        print(f"Next automated 3 AM run scheduled at: {target.strftime('%Y-%m-%d %H:%M:%S')} (in {round(seconds_to_wait/3600, 2)} hours)")
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
    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        query = parse_qs(parsed_url.query)

        if path == '/api/refresh' or path == '/api/run_analysis':
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

    def handle_scan_status(self):
        status_file = os.path.join(os.path.dirname(__file__), "scan_status.json")
        status_payload = {"is_running": False, "progress_pct": 100, "status_message": "Idle"}
        if os.path.exists(status_file):
            try:
                with open(status_file, 'r', encoding='utf-8') as f:
                    status_payload = json.load(f)
            except Exception:
                pass
        res = json.dumps(status_payload).encode('utf-8')
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(res)

    def handle_refresh(self):
        threading.Thread(target=run_analysis_tasks, daemon=True).start()
        payload = json.dumps({"status": "success", "message": "Re-analysis started in background!"}).encode('utf-8')
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
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
    
    t = threading.Thread(target=daily_3am_scheduler_thread, daemon=True)
    t.start()

    server_address = ('', PORT)
    httpd = HTTPServer(server_address, CustomRequestHandler)
    print("=========================================================================")
    print(f"   Indian Stock Screener Server Active on Port {PORT}                  ")
    print(f"   Local PC Access:   http://localhost:{PORT}                         ")
    print(f"   Mobile Wi-Fi Link: http://192.168.1.104:{PORT}                     ")
    print("   Daily 3 AM Windows Scheduler: ACTIVE                               ")
    print("=========================================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")

if __name__ == "__main__":
    run_server()
