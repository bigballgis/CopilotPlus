param(
  [Parameter(Mandatory = $true)]
  [string]$Workspace,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs = @('build', 'run', '.copilotPlus/ci/example-build-config.json')
)

$ErrorActionPreference = 'Stop'

function Find-VSCodeExe {
  $candidates = @(
    (Get-Command code -ErrorAction SilentlyContinue)?.Source,
    "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd",
    "$env:ProgramFiles\Microsoft VS Code\bin\code.cmd"
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($candidates.Count -eq 0) {
    throw 'VS Code CLI (code) not found in PATH or default install locations.'
  }
  return $candidates[0]
}

$code = Find-VSCodeExe
$folderUri = ([Uri](Resolve-Path $Workspace)).AbsoluteUri

Write-Host "Workspace: $folderUri"
Write-Host "Command: copilotPlus.cli $($CliArgs -join ' ')"

# Requires Copilot Plus extension installed (or --extensionDevelopmentPath for local dev).
& $code `
  --folder-uri $folderUri `
  --disable-workspace-trust `
  --command copilotPlus.cli `
  -- @CliArgs

exit $LASTEXITCODE
