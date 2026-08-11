import time
import datetime
import os
import subprocess

def run_daily_job():
    print(f"[{datetime.datetime.now()}] Triggering Daily 3 AM Stock Screening & Backtest...")
    python_exe = os.path.join(os.path.dirname(__file__), ".venv", "Scripts", "python.exe")
    if not os.path.exists(python_exe):
        python_exe = "python"
        
    try:
        print("Running analyzer.py...")
        subprocess.run([python_exe, "analyzer.py"], check=True)
        print("Running backtester.py...")
        subprocess.run([python_exe, "backtester.py"], check=True)
        print(f"[{datetime.datetime.now()}] Daily job completed successfully!")
    except Exception as e:
        print(f"[{datetime.datetime.now()}] Error running daily job: {e}")

def start_scheduler():
    print("=====================================================")
    print("   Indian Stock Market Daily 3 AM Scheduler Active   ")
    print("=====================================================")
    print("System will execute analysis automatically every day at 03:00 AM.")
    
    # Run once on initial startup
    run_daily_job()
    
    while True:
        now = datetime.datetime.now()
        target = now.replace(hour=3, minute=0, second=0, microsecond=0)
        if now >= target:
            target += datetime.timedelta(days=1)
            
        seconds_to_wait = (target - now).total_seconds()
        print(f"Next execution scheduled at: {target.strftime('%Y-%m-%d %H:%M:%S')} (in {round(seconds_to_wait/3600, 2)} hours)")
        time.sleep(seconds_to_wait)
        run_daily_job()

if __name__ == "__main__":
    start_scheduler()
