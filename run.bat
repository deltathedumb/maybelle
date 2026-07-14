@echo off
setlocal
echo === Maybelle Wiki Host ===
set /p HOST=Host/IP [127.0.0.1]: 
if "%HOST%"=="" set HOST=127.0.0.1
set /p PORT=Port [80]: 
if "%PORT%"=="" set PORT=80
set /p NAME=Display name [Maybelle Wiki Host]: 
if "%NAME%"=="" set NAME=Maybelle Wiki Host
set /p ADMIN=Admin password [blank disabled]: 
set /p FORUMPASS=Threads password [blank none]: 
set /p BACKUP=Backup interval [10]: 
if "%BACKUP%"=="" set BACKUP=10
set /p PULLPASS=Read/Pull pass [blank none]:
set /p PUSHPASS=Write/Push pass [blank mirrors read]:
set /p DISABLE=Disable threads? y/N: 
set EXTRA=
if /I "%DISABLE%"=="y" set EXTRA=--disable-forum
if not "%ADMIN%"=="" set EXTRA=%EXTRA% --admin-pass "%ADMIN%"
if not "%FORUMPASS%"=="" set EXTRA=%EXTRA% --forum-password "%FORUMPASS%"
if not "%PULLPASS%"=="" set EXTRA=%EXTRA% --pull-pass "%PULLPASS%"
if not "%PUSHPASS%"=="" set EXTRA=%EXTRA% --push-pass "%PUSHPASS%"
python "%~dp0host.py" --name "%NAME%" --host "%HOST%" --port %PORT% --backup-interval %BACKUP% %EXTRA%
pause
