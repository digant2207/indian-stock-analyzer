import os
import sys
import json
import time
import datetime
import threading
import subprocess
from http.server import HTTPServer, SimpleHTTPRequestHandler

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
            # 1. Run fast_runner.py (scans Google Sheet + Nifty 250)
            runner_script = os.path.join(os.path.dirname(__file__), "fast_runner.py")
            if os.path.exists(runner_script):
                subprocess.run([py_exe, runner_script], check=True)
            else:
                analyzer_script = os.path.join(os.path.dirname(__file__), "analyzer.py")
                subprocess.run([py_exe, analyzer_script], check=True)

            # 2. Run backtester.py
            backtester_script = os.path.join(os.path.dirname(__file__), "backtester.py")
            if os.path.exists(backtester_script):
                subprocess.run([py_exe, backtester_script], check=True)

            print(f"[{datetime.datetime.now()}] Analysis & Backtest completed successfully!")
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
        if self.path == '/api/refresh' or self.path == '/api/run_analysis':
            self.handle_refresh()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/refresh' or self.path == '/api/run_analysis':
            self.handle_refresh()
        elif self.path == '/api/save_gsheet':
            self.handle_save_gsheet()
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
                    
                # Run sync immediately
                success, msg = run_analysis_tasks()
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
    
    # Start 3 AM Scheduler Thread
    t = threading.Thread(target=daily_3am_scheduler_thread, daemon=True)
    t.start()

    server_address = ('', PORT)
    httpd = HTTPServer(server_address, CustomRequestHandler)
    print("=========================================================================")
    print(f"   Indian Stock Screener Server Active on Port {PORT}                  ")
    print(f"   Local Access:   http://localhost:{PORT}                            ")
    print(f"   Live Refresh:   http://localhost:{PORT}/api/refresh                ")
    print("   Daily 3 AM Scheduler: ACTIVE                                       ")
    print("=========================================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")

if __name__ == "__main__":
    run_server()
