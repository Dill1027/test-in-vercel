$ErrorActionPreference = "Stop"

$pythonPath = Join-Path `
    $PSScriptRoot `
    "..\..\.venv-dyscalculia\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw @"
The Dyscalculia Python environment was not found.
Run these commands from $PSScriptRoot first:

py -3.10 -m venv ..\..\.venv-dyscalculia
..\..\.venv-dyscalculia\Scripts\python.exe -m pip install -r requirements.txt
"@
}

& $pythonPath (Join-Path $PSScriptRoot "app.py")
exit $LASTEXITCODE
