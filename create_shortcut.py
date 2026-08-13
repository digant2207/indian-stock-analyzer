import os
import subprocess

desktop_dir = os.path.expanduser("~/Desktop")
project_dir = os.path.dirname(os.path.abspath(__file__))
bat_path = os.path.join(project_dir, "Start_Stock_Analyzer.bat")
shortcut_path = os.path.join(desktop_dir, "Indian Stock Screener.lnk")

vbs_content = f'''
Set WshShell = CreateObject("WScript.Shell")
Set shortcut = WshShell.CreateShortcut("{shortcut_path}")
shortcut.TargetPath = "{bat_path}"
shortcut.WorkingDirectory = "{project_dir}"
shortcut.Description = "Launch Indian Stock Screener & AI Analyst"
shortcut.Save
'''

vbs_file = os.path.join(project_dir, "make_shortcut.vbs")
with open(vbs_file, "w") as f:
    f.write(vbs_content)

subprocess.run(["cscript", "//Nologo", vbs_file])

if os.path.exists(vbs_file):
    os.remove(vbs_file)

print(f"Created Desktop Shortcut: {shortcut_path}")
