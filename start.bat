@echo off
rem tt-kickball harness: serve project root and open browser test shell
set PY=C:\Users\4v\AppData\Local\Programs\Python\Python312\python.exe
start "" "http://127.0.0.1:8821/harness/index.html?sound=1"
"%PY%" -m http.server 8821 --bind 127.0.0.1 --directory "%~dp0"
