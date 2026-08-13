import os
import subprocess

py_exe = os.path.abspath(".venv/Scripts/python.exe")
project_dir = os.path.abspath(".")
runner_py = os.path.join(project_dir, "fast_runner.py")

ps_script = f'''
$action = New-ScheduledTaskAction -Execute "{py_exe}" -Argument "{runner_py}" -WorkingDirectory "{project_dir}"
$trigger = New-ScheduledTaskTrigger -Daily -At 3:00AM
Register-ScheduledTask -TaskName "IndianStockAnalyzer_3AM_Task" -Action $action -Trigger $trigger -Description "Daily 3 AM Automated Stock Screener & Email Digest Scan" -Force
'''

ps_file = os.path.join(project_dir, "register_task.ps1")
with open(ps_file, "w", encoding='utf-8') as f:
    f.write(ps_script)

res = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-File", ps_file], capture_output=True, text=True)
print("Task Registration Output:\n", res.stdout, res.stderr)

if os.path.exists(ps_file):
    os.remove(ps_file)
