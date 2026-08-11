@echo off
echo =========================================================
echo    Running Indian Stock Market Screener & Backtest
echo =========================================================

.venv\Scripts\python.exe analyzer.py
.venv\Scripts\python.exe backtester.py

echo.
echo Analysis complete! Open index.html in your browser or run a local HTTP server.
pause
