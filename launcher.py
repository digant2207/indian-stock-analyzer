import os
import sys
import time
import webbrowser
import threading
import server

def open_browser():
    time.sleep(1.5)
    print("Opening web browser at http://localhost:8080 ...")
    webbrowser.open("http://localhost:8080")

def main():
    print("=========================================================================")
    print("   Indian Stock Screener & AI Analyst - Desktop Launcher                ")
    print("   Access Dashboard: http://localhost:8080                               ")
    print("=========================================================================")
    
    # Launch browser thread
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run live Python server
    server.run_server()

if __name__ == "__main__":
    main()
