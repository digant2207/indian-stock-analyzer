@echo off
title Indian Stock Screener & AI Analyst
cd /d "%~dp0"
echo Starting Indian Stock Screener server on http://localhost:8080 ...
start http://localhost:8080
.venv\Scripts\python.exe launcher.py
pause
