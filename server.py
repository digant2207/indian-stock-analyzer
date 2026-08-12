import os
import sys
import json
import csv
import time
import datetime
import threading
import subprocess
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

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

class CustomRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        query = parse_qs(parsed_url.query)

        if path == '/api/refresh' or path == '/api/run_analysis':
            self.handle_refresh()
        elif path == '/api/search_stock':
            symbol = query.get('symbol', [''])[0].strip()
            self.handle_search_stock(symbol)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/refresh' or self.path == '/api/run_analysis':
            self.handle_refresh()
        elif self.path == '/api/save_gsheet':
            self.handle_save_gsheet()
        elif self.path == '/api/add_stock':
            self.handle_add_stock()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_refresh(self):
        success, msg = run_analysis_tasks()
        status_code = 200 if success else 500
        payload = json.dumps({"status": "success" if success else "error", "message": msg}).encode('utf-8')
        
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def handle_search_stock(self, symbol):
        if not symbol:
            res = json.dumps({"status": "error", "message": "Symbol is required"}).encode('utf-8')
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(res)
            return

        try:
            import fast_runner
            clean_sym = fast_runner.clean_symbol(symbol)
            stock_data = fast_runner.fetch_stock_data({"symbol": clean_sym, "name": symbol.upper(), "sector": "NSE/BSE Search"})
            
            if stock_data:
                res = json.dumps({"status": "success", "stock": stock_data}).encode('utf-8')
            else:
                res = json.dumps({"status": "error", "message": f"Could not fetch data for symbol: {symbol}"}).encode('utf-8')
        except Exception as e:
            res = json.dumps({"status": "error", "message": str(e)}).encode('utf-8')

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(res)))
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
                    
                    # Run fast runner background update
                    threading.Thread(target=run_analysis_tasks, daemon=True).start()
                    res = json.dumps({"status": "success", "message": f"✅ {clean_sym.replace('.NS','')} added to your Spark Stock List!"}).encode('utf-8')
                else:
                    res = json.dumps({"status": "info", "message": f"{clean_sym.replace('.NS','')} is already in your Spark Stock List!"}).encode('utf-8')

        except Exception as e:
            res = json.dumps({"status": "error", "message": str(e)}).encode('utf-8')

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(res)))
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
        self.send_header("Content-Length", str(len(res)))
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
    print(f"   Local Access:   http://localhost:{PORT}                            ")
    print(f"   Live Refresh:   http://localhost:{PORT}/api/refresh                ")
    print(f"   Live Search:    http://localhost:{PORT}/api/search_stock           ")
    print("   Daily 3 AM Scheduler: ACTIVE                                       ")
    print("=========================================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")

if __name__ == "__main__":
    run_server()
