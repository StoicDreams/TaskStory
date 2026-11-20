param(
    # Each site has its own default port, so several sites can run at once.
    [int]$Port = 8110,
    [switch]$clean,
    [switch]$PreBuildOnly,
    # Serve to other devices on the network too, such as a phone.
    [switch]$Network
)

Set-Location $PSScriptRoot
Set-Location ../

$ProjectName = (Get-Item .).Name

# Starting a site that already runs, here or from Websites/scripts/runlocals.ps1, stops the earlier copy first,
# because a second dev server can't use the port: browser-sync quietly moves to another, and trunk fails.
function Get-PortListeners([int]$Port) {
    if ($env:OS -eq 'Windows_NT') {
        return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique)
    }
    if (Get-Command lsof -ErrorAction SilentlyContinue) {
        return @(lsof -t "-iTCP:$Port" -sTCP:LISTEN 2>$null | ForEach-Object { [int]$_ } | Select-Object -Unique)
    }
    return @(ss -ltnpH "sport = :$Port" 2>$null | Select-String -Pattern 'pid=(\d+)' -AllMatches |
        ForEach-Object { $_.Matches } | ForEach-Object { [int]$_.Groups[1].Value } | Select-Object -Unique)
}

function Stop-EarlierRun([int]$Port) {
    $listeners = @(Get-PortListeners $Port)
    if (-not $listeners) { return }
    $all = @(Get-Process -ErrorAction SilentlyContinue)
    $stop = [System.Collections.Generic.List[int]]::new()
    foreach ($id in $listeners) {
        $process = $all | Where-Object Id -eq $id
        if (-not $process) { continue }
        # Stop the RunLocal.ps1 that started the server, so its runner ends too, or else the server alone when it
        # is a dev server. Any other program on the port is left alone.
        $runner = $null
        $current = $process
        while ($current -and $current.Id -ne $PID) {
            if ($current.ProcessName -match '^pwsh' -and $current.CommandLine -match 'RunLocal\.ps1') { $runner = $current }
            $current = $current.Parent
        }
        if ($runner) { $stop.Add($runner.Id) }
        elseif ($process.ProcessName -match '^(trunk|node|browser-sync)') { $stop.Add($process.Id) }
    }
    if (-not $stop.Count) {
        Write-Host "Port $Port is in use by another program, so this can't start." -ForegroundColor Yellow
        exit 1
    }
    # Children first, so nothing the earlier run started is left behind.
    $tree = [System.Collections.Generic.List[int]]::new()
    $queue = [System.Collections.Generic.Queue[int]]::new()
    $stop | ForEach-Object { $queue.Enqueue($_) }
    while ($queue.Count) {
        $id = $queue.Dequeue()
        if ($tree.Contains($id)) { continue }
        $tree.Add($id)
        $all | Where-Object { $_.Parent -and $_.Parent.Id -eq $id } | ForEach-Object { $queue.Enqueue($_.Id) }
    }
    Write-Host "Stopping the copy already running on port $Port" -ForegroundColor Yellow
    for ($i = $tree.Count - 1; $i -ge 0; $i--) {
        Stop-Process -Id $tree[$i] -Force -ErrorAction SilentlyContinue
    }
    $deadline = (Get-Date).AddSeconds(15)
    while (@(Get-PortListeners $Port).Count -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 200
    }
    if (@(Get-PortListeners $Port).Count) {
        Write-Host "Port $Port is still in use, so this can't start." -ForegroundColor Yellow
        exit 1
    }
}

function Get-NetworkAddresses {
    [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
        Where-Object { $_.OperationalStatus -eq 'Up' -and $_.NetworkInterfaceType -ne 'Loopback' } |
        ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
        Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and !$_.Address.ToString().StartsWith('169.254.') } |
        ForEach-Object { $_.Address.ToString() }
}
$OnWindows = $env:OS -eq 'Windows_NT'

# Keep Rust build output outside the repo: D:\CargoTargets on Windows when that drive exists, otherwise ~/CargoTargets.
if ($OnWindows -and (Test-Path 'D:\')) {
    $env:CARGO_TARGET_DIR = "D:\CargoTargets\$ProjectName"
}
else {
    $env:CARGO_TARGET_DIR = Join-Path (Join-Path $HOME 'CargoTargets') $ProjectName
}

# sccache speeds up rebuilds, but is optional: cargo install sccache
if (Get-Command sccache -ErrorAction SilentlyContinue) {
    $env:RUSTC_WRAPPER = "sccache"
}
else {
    Remove-Item Env:RUSTC_WRAPPER -ErrorAction SilentlyContinue
}

$missing = @()
if (!(Get-Command cargo -ErrorAction SilentlyContinue)) { $missing += "Rust: https://rustup.rs" }
elseif (!((rustup target list --installed) -contains 'wasm32-unknown-unknown')) { $missing += "rustup target add wasm32-unknown-unknown" }
if (!(Get-Command trunk -ErrorAction SilentlyContinue)) { $missing += "cargo install trunk" }
if (!(Get-Command wasm-pack -ErrorAction SilentlyContinue)) { $missing += "cargo install wasm-pack" }
if (!(Get-Command webapp_post_build -ErrorAction SilentlyContinue)) { $missing += "cargo install webapp_post_build --git https://github.com/StoicDreams/WebUI" }
if ($missing.Count -gt 0) {
    Write-Host "Install these first:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  $_" }
    exit 1
}

# Trunk 0.21 can crash its file watcher on Linux, and reads the watch ignore list in Trunk.toml differently.
$trunkVersion = [version]((trunk --version) -replace '^trunk\s+', '')
if ($trunkVersion -lt [version]'0.22.0') {
    Write-Host "Trunk $trunkVersion is too old. Update it with: cargo install trunk --locked" -ForegroundColor Yellow
    exit 1
}

if ($clean) {
    cargo clean
}
if (!(Test-Path "./target/wasm32-unknown-unknown")) {
    New-Item -ItemType Directory -Path "target/wasm32-unknown-unknown" | Out-Null
}
if ($PreBuildOnly) {
    cargo build --target wasm32-unknown-unknown
    return
}
Stop-EarlierRun $Port
Write-Host "Starting $ProjectName at http://localhost:$Port" -ForegroundColor Green
if ($Network) {
    # Other devices load Web UI through /webui-cdn/ on this server, which passes it on to the local MyFiCDN server.
    Get-NetworkAddresses | ForEach-Object { Write-Host "  and on the network at http://${_}:$Port" -ForegroundColor Green }
    trunk serve --config webapp/Trunk.toml --address 0.0.0.0 --port $Port --proxy-backend http://localhost:3180/ --proxy-rewrite /webui-cdn/
}
else {
    trunk serve --config webapp/Trunk.toml --port $Port
}
