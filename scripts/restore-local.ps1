# Verifies a backup and restores it ONLY to a new local Wrangler state directory.
# An existing target must be moved aside manually after stopping all processes.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BackupDirectory,
    [Parameter(Mandatory = $true)][string]$TargetStateDirectory,
    [switch]$ConfirmStopped
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmStopped) { throw 'Stop all Vite/Wrangler/test processes and supply -ConfirmStopped.' }

function FullLocalPath([string]$Value) {
    if (-not [IO.Path]::IsPathRooted($Value)) { throw 'Use absolute paths for backup and target.' }
    $full = [IO.Path]::GetFullPath($Value).TrimEnd([char]'\', [char]'/')
    if ($full.StartsWith('\\')) { throw 'Network/UNC paths are not supported.' }
    return $full
}

$backup = FullLocalPath $BackupDirectory
$target = FullLocalPath $TargetStateDirectory
$suffix = '\.wrangler\state\v3'
if (-not $target.EndsWith($suffix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Target must be an explicit local .wrangler\state\v3 path.'
}
if ($target.Equals($backup, [StringComparison]::OrdinalIgnoreCase) -or
    $target.StartsWith($backup + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $backup.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Backup and destination must not overlap.'
}
if (Test-Path -LiteralPath $target) { throw 'Target already exists; overwrite is forbidden.' }
$targetParent = Split-Path -Parent $target
if (-not (Test-Path -LiteralPath $targetParent -PathType Container)) {
    throw 'Create the target parent (.wrangler\state) explicitly before restore.'
}
$state = Join-Path $backup 'state'
$manifestPath = Join-Path $backup 'manifest.json'
if (-not (Test-Path -LiteralPath $state -PathType Container) -or
    -not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'The backup is incomplete: state and manifest.json are both required.'
}
$allBackup = @(Get-Item -LiteralPath $state, $manifestPath) +
    @(Get-ChildItem -LiteralPath $state -Recurse -Force)
if (@($allBackup | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) {
    throw 'Backup includes links/junctions; refusing potentially unsafe paths.'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.format -cne 'rolescout-local-state-v1') { throw 'Unrecognized backup format.' }
$records = @($manifest.files)
if (-not $records.Count) { throw 'Empty backup manifest.' }

$files = @(Get-ChildItem -LiteralPath $state -Recurse -Force -File | Sort-Object FullName)
if ($files.Count -ne $records.Count) { throw 'Backup file list differs from manifest.' }
for ($index = 0; $index -lt $records.Count; $index++) {
    $record = $records[$index]
    $relative = [string]$record.path
    $segments = @($relative.Split('/'))
    if (-not $relative -or $relative.Contains('\') -or $relative.Contains(':') -or
        @($segments | Where-Object { $_ -eq '' -or $_ -eq '.' -or $_ -eq '..' }).Count) {
        throw 'Manifest contains an unsafe relative path.'
    }
    $actualRelative = $files[$index].FullName.Substring($state.Length + 1).Replace('\', '/')
    $hash = (Get-FileHash -LiteralPath $files[$index].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualRelative -cne $relative -or $files[$index].Length -ne $record.bytes -or
        $hash -cne $record.sha256) {
        throw 'Backup integrity verification failed; no restore was attempted.'
    }
}
if (-not @(Get-ChildItem -LiteralPath (Join-Path $state 'd1') -Recurse -Force -File -ErrorAction SilentlyContinue).Count -or
    -not @(Get-ChildItem -LiteralPath (Join-Path $state 'r2') -Recurse -Force -File -ErrorAction SilentlyContinue).Count) {
    throw 'Backup must include both D1 and R2 state.'
}

# Copy only after *all* integrity checks pass; never delete or replace a live state.
Copy-Item -LiteralPath $state -Destination $target -Recurse -Force -ErrorAction Stop
$restored = @(Get-ChildItem -LiteralPath $target -Recurse -Force -File | Sort-Object FullName)
if ($restored.Count -ne $records.Count) { throw 'Restore file count differs; do not use target.' }
for ($index = 0; $index -lt $records.Count; $index++) {
    $relative = $restored[$index].FullName.Substring($target.Length + 1).Replace('\', '/')
    $hash = (Get-FileHash -LiteralPath $restored[$index].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($relative -cne $records[$index].path -or $restored[$index].Length -ne $records[$index].bytes -or
        $hash -cne $records[$index].sha256) {
        throw 'Restored file verification failed; do not use target.'
    }
}
Write-Output "Verified offline local-state restore: $target ($($records.Count) files)."
