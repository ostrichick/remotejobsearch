# Copies a STOPPED local Wrangler state (D1, R2 and its metadata) to a new directory.
# It never invokes Wrangler's remote API and never overwrites an existing backup.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SourceStateDirectory,
    [Parameter(Mandatory = $true)][string]$BackupDirectory,
    [switch]$ConfirmStopped
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmStopped) { throw 'Stop all Vite/Wrangler/test processes and supply -ConfirmStopped.' }

function FullLocalPath([string]$Value) {
    if (-not [IO.Path]::IsPathRooted($Value)) { throw 'Use an absolute path for source and destination.' }
    $full = [IO.Path]::GetFullPath($Value).TrimEnd([char]'\', [char]'/')
    if ($full.StartsWith('\\')) { throw 'Network/UNC paths are not supported.' }
    return $full
}

$source = FullLocalPath $SourceStateDirectory
$destination = FullLocalPath $BackupDirectory
$project = FullLocalPath (Join-Path $PSScriptRoot '..')
$suffix = '\.wrangler\state\v3'
if (-not $source.EndsWith($suffix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Source must be an explicit local .wrangler\state\v3 directory.'
}
if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw 'Source state directory does not exist.' }
foreach ($required in @('d1', 'r2')) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $required) -PathType Container)) {
        throw "Local state is missing $required; refuse incomplete backup."
    }
}
if ($destination.Equals($project, [StringComparison]::OrdinalIgnoreCase) -or
    $destination.StartsWith($project + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $destination.Equals($source, [StringComparison]::OrdinalIgnoreCase) -or
    $destination.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Choose a new backup directory outside the project and source state.'
}
if (Test-Path -LiteralPath $destination) { throw 'Backup destination already exists; no overwrite is permitted.' }
$parent = Split-Path -Parent $destination
if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    throw 'Create the backup parent directory explicitly before running this script.'
}

$allSource = @(Get-Item -LiteralPath $source) + @(Get-ChildItem -LiteralPath $source -Recurse -Force)
if (@($allSource | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) {
    throw 'Links/junctions in local state are unsupported; refuse to follow paths outside the source.'
}
$sourceFiles = @(Get-ChildItem -LiteralPath $source -Recurse -Force -File | Sort-Object FullName)
if (-not $sourceFiles.Count) { throw 'Source state has no files.' }
$records = @($sourceFiles | ForEach-Object {
    [PSCustomObject]@{
        path = $_.FullName.Substring($source.Length + 1).Replace('\', '/')
        bytes = $_.Length
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
})

# An interrupted run leaves a directory WITHOUT manifest.json, which restore refuses.
New-Item -ItemType Directory -Path $destination -ErrorAction Stop | Out-Null
$copy = Join-Path $destination 'state'
Copy-Item -LiteralPath $source -Destination $copy -Recurse -Force -ErrorAction Stop

$copiedFiles = @(Get-ChildItem -LiteralPath $copy -Recurse -Force -File | Sort-Object FullName)
if ($copiedFiles.Count -ne $records.Count) { throw 'Backup file count differs; no completion manifest was written.' }
for ($index = 0; $index -lt $records.Count; $index++) {
    $record = $records[$index]
    $originalFile = $sourceFiles[$index]
    $copiedFile = $copiedFiles[$index]
    $relative = $copiedFile.FullName.Substring($copy.Length + 1).Replace('\', '/')
    $copiedHash = (Get-FileHash -LiteralPath $copiedFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $sourceAfterHash = (Get-FileHash -LiteralPath $originalFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($relative -cne $record.path -or $copiedFile.Length -ne $record.bytes -or
        $copiedHash -ne $record.sha256 -or $sourceAfterHash -ne $record.sha256) {
        throw 'Source changed during backup or copied file differs; no completion manifest was written.'
    }
}
$sourceAfter = @(Get-ChildItem -LiteralPath $source -Recurse -Force -File)
if ($sourceAfter.Count -ne $sourceFiles.Count) {
    throw 'Source file count changed during backup; no completion manifest was written.'
}

$manifest = [ordered]@{
    format = 'rolescout-local-state-v1'
    capturedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    files = $records
}
$manifestPath = Join-Path $destination 'manifest.json'
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8 -ErrorAction Stop
Write-Output "Verified offline local-state backup: $destination ($($records.Count) files)."
