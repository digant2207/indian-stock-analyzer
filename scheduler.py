import time
import datetime
import os
import subprocess

def run_job(reason="Scheduled Scan"):
    print(f"\n[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Triggering Stock Screening: {reason}...")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    python_exe = os.path.join(base_dir, ".venv", "Scripts", "python.exe")
    if not os.path.exists(python_exe):
        python_exe = "python"
        
    try:
        fast_runner = os.path.join(base_dir, "fast_runner.py")
        backtester = os.path.join(base_dir, "backtester.py")
        print("Running fast_runner.py...")
        subprocess.run([python_exe, fast_runner], check=True, cwd=base_dir)
        print("Running backtester.py...")
        subprocess.run([python_exe, backtester], check=True, cwd=base_dir)
        print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Job completed successfully!")
    except Exception as e:
        print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Error running job: {e}")

def get_next_run_time(now):
    # Determine next scheduled run:
    # 1. Daily 8:00 AM IST
    # 2. Weekday Market Hours (Mon-Fri 9:15 AM to 3:30 PM IST): every 30 minutes (9:30, 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30)
    weekday = now.weekday() # 0 = Monday, 4 = Friday, 5 = Saturday, 6 = Sunday
    candidates = []

    # Daily 8:00 AM
    t_8am = now.replace(hour=8, minute=0, second=0, microsecond=0)
    if t_8am > now:
        candidates.append((t_8am, "Daily 8:00 AM Morning Scan"))
    else:
        candidates.append((t_8am + datetime.timedelta(days=1), "Daily 8:00 AM Morning Scan"))

    # Market hour slots on weekdays
    if weekday <= 4:
        for hour, minute in [
            (9, 15), (9, 30), (10, 0), (10, 30), (11, 0), (11, 30),
            (12, 0), (12, 30), (13, 0), (13, 30), (14, 0), (14, 30),
            (15, 0), (15, 30)
        ]:
            t_slot = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if t_slot > now:
                candidates.append((t_slot, f"Live Market {hour:02d}:{minute:02d} Scan"))

    # Sort and pick nearest future candidate
    candidates.sort(key=lambda x: x[0])
    return candidates[0]

def start_scheduler():
    print("=========================================================================")
    print("   Indian Stock Market 8:00 AM & 30-Min Market Hours Scheduler Active   ")
    print("=========================================================================")
    print("1. Daily 8:00 AM IST Early Morning Intelligence")
    print("2. Weekdays (Mon-Fri) 9:15 AM to 3:30 PM: Every 30-minute Live Scans")
    print("=========================================================================")
    
    # Run once on initial startup
    run_job("Initial Startup Scan")
    
    while True:
        now = datetime.datetime.now()
        next_time, next_reason = get_next_run_time(now)
        seconds_to_wait = max(5, (next_time - now).total_seconds())
        
        mins = round(seconds_to_wait / 60, 1)
        print(f"\nNext run scheduled at: {next_time.strftime('%Y-%m-%d %I:%M %p')} ({next_reason}) [in {mins} mins]")
        time.sleep(seconds_to_wait)
        run_job(next_reason)

if __name__ == "__main__":
    start_scheduler()
