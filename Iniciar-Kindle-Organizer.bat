@echo off
chcp 65001 >nul
title Kindle Notes Organizer - Lanzador Seguro
cd /d "%~dp0"

echo ========================================================
echo   KINDLE NOTES ORGANIZER (Modo Seguro 100%% Local)
echo ========================================================
echo.

REM 1. Detectar automaticamente si hay un Kindle conectado por USB (Unidades D: a Z:)
set "KINDLE_FOUND="
for %%D in (D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
    if exist "%%D:\documents\My Clippings.txt" (
        set "KINDLE_FOUND=%%D:"
        echo [OK] Kindle detectado automaticamente en la unidad %%D:\
        copy /Y "%%D:\documents\My Clippings.txt" "%~dp0My Clippings.txt" >nul
        echo [OK] Archivo "My Clippings.txt" sincronizado desde el Kindle.
    )
)

if not defined KINDLE_FOUND (
    echo [INFO] No se detecto unidad USB clasica de Kindle conectada en este instante.
    echo        Se abrira con el ultimo My Clippings.txt o podras seleccionarlo en pantalla.
)

REM 2. Si Python esta disponible, abrir en servidor local 127.0.0.1 (seguro y privado)
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Abriendo Kindle Notes Organizer en tu navegador...
    start "" "http://127.0.0.1:8765/index.html"
    echo.
    echo Servidor local seguro activo en http://127.0.0.1:8765 ^(Solo accesible desde tu PC^).
    echo Cierra esta ventana cuando termines de exportar tus notas.
    python -m http.server 8765 --bind 127.0.0.1
) else (
    echo [OK] Abriendo version Portable directamente en tu navegador ^(Sin instalacion^)...
    start "" "%~dp0KindleNotesOrganizer-Portable.html"
)
