$ErrorActionPreference = 'Stop'
$versionRepoRoot = Resolve-Path (Join-Path $PSScriptRoot '../..')
$versionContainerName = 'wod-version-test-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$versionContainerId = $null
$versionEnvNames = @('DATABASE_URL', 'DIRECT_URL', 'WOD_VERSION_TEST_DATABASE_URL')
$versionPreviousEnv = @{}
foreach ($versionEnvName in $versionEnvNames) {
    $versionPreviousEnv[$versionEnvName] = [Environment]::GetEnvironmentVariable($versionEnvName)
}

function Invoke-VersionTestSql([string] $path) {
    Get-Content -LiteralPath $path -Raw | docker exec -i $versionContainerId psql -v ON_ERROR_STOP=1 -U postgres -d wod_versions
    if ($LASTEXITCODE -ne 0) { throw "SQL failed: $path" }
}

# Requires the generated Prisma client. This runner never uses the app database.
Push-Location $versionRepoRoot
try {
    $versionContainerId = docker run --rm -d --name $versionContainerName -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=regression-only -e POSTGRES_DB=wod_versions postgres:16-alpine
    if ($LASTEXITCODE -ne 0) { $versionContainerId = $null; throw 'Cannot start test PostgreSQL' }
    for ($versionAttempt = 0; $versionAttempt -lt 30; $versionAttempt++) {
        docker exec $versionContainerId pg_isready -U postgres -d wod_versions | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 1
    }
    if ($LASTEXITCODE -ne 0) { throw 'Test PostgreSQL did not become ready' }
    $versionContainerInfo = docker inspect $versionContainerId | ConvertFrom-Json
    $versionPort = $versionContainerInfo[0].NetworkSettings.Ports.'5432/tcp'[0].HostPort
    $env:DATABASE_URL = "postgresql://postgres:regression-only@127.0.0.1:$versionPort/wod_versions"
    $env:DIRECT_URL = $env:DATABASE_URL
    $env:WOD_VERSION_TEST_DATABASE_URL = $env:DATABASE_URL

    $versionMigrations = Get-ChildItem -LiteralPath 'prisma/migrations' -Directory | Sort-Object Name
    foreach ($versionMigration in ($versionMigrations | Where-Object { $_.Name -lt '20261005120000_add_wod_versions' })) {
        Invoke-VersionTestSql (Join-Path $versionMigration.FullName 'migration.sql')
    }
    Invoke-VersionTestSql (Join-Path $PSScriptRoot 'fixtures/wod-versions-legacy.sql')
    foreach ($versionMigration in ($versionMigrations | Where-Object { $_.Name -ge '20261005120000_add_wod_versions' })) {
        Invoke-VersionTestSql (Join-Path $versionMigration.FullName 'migration.sql')
    }
    pnpm --filter '@wod-coach-ai/api' test -- tests/integration/wod-versions-postgres.test.ts
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL regression tests failed' }
    pnpm exec prisma migrate diff --from-url $env:DATABASE_URL --to-schema-datamodel prisma/schema.prisma --exit-code
    if ($LASTEXITCODE -ne 0) { throw 'Migrated database does not match the Prisma schema' }
} finally {
    if ($versionContainerId) { docker stop $versionContainerId | Out-Null }
    foreach ($versionEnvName in $versionEnvNames) {
        [Environment]::SetEnvironmentVariable($versionEnvName, $versionPreviousEnv[$versionEnvName])
    }
    Pop-Location
}
