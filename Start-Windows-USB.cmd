@echo off
setlocal
cd /d "%~dp0"
set "RUNTIME=%LOCALAPPDATA%\Trace-Isle\venv\Scripts\python.exe"
set "EXISTING=%~dp0..\tracklab-compatibility\release\TrackLab-Local"
if not exist "%RUNTIME%" if exist "%EXISTING%\.venv\Scripts\python.exe" (
  set "RUNTIME=%EXISTING%\.venv\Scripts\python.exe"
)
if exist "%EXISTING%\runtime\pair-cache" set "TRACE_ISLE_PAIR_CACHE=%EXISTING%\runtime\pair-cache"
if not exist "%RUNTIME%" (
  py -3.12 -m venv "%LOCALAPPDATA%\Trace-Isle\venv"
  if errorlevel 1 goto :failed
)
"%RUNTIME%" -c "import usb_host" >nul 2>&1
if errorlevel 1 (
  "%RUNTIME%" -m pip install "pymobiledevice3==11.19.2" "wsproto>=1.2,<2"
  if errorlevel 1 goto :failed
)
"%RUNTIME%" usb_host.py --open
if errorlevel 1 goto :failed
exit /b 0
:failed
echo Install Python 3.12 and Apple Devices on Windows, then retry.
pause
exit /b 1
