param([int]$Port = 8094, [string]$AnemoneJar = $env:ANEMONE_JAR)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = (Resolve-Path (Join-Path $appRoot '../..')).Path
$legacy = Join-Path $repoRoot 'method/implementation/SmartStock-Visualizer'
if ([string]::IsNullOrWhiteSpace($AnemoneJar)) { throw 'Definir ANEMONE_JAR avec le vrai JAR JLAMP24.' }
if (-not (Test-Path -LiteralPath $AnemoneJar -PathType Leaf)) { throw "JAR introuvable : $AnemoneJar" }
$AnemoneJar = (Resolve-Path -LiteralPath $AnemoneJar).Path
if (-not (Test-Path (Join-Path $appRoot 'web/js/scalajs/main.js'))) { throw 'Compiler le frontend : sbt fastLinkJS dans code/anemone-visualizer.' }
$classes = Join-Path $PSScriptRoot "build/$Port/classes"
New-Item -ItemType Directory -Force $classes | Out-Null
$sources = @(Get-ChildItem (Join-Path $legacy 'bridge/src/main/java') -Recurse -Filter *.java | ForEach-Object { $_.FullName })
& javac -encoding UTF-8 -source 8 -target 8 -cp $AnemoneJar -d $classes $sources
if ($LASTEXITCODE -ne 0) { throw 'Compilation bridge echouee' }
$classpath = $classes + [IO.Path]::PathSeparator + $AnemoneJar
& java '-Djava.awt.headless=true' "-Dsmartstock.root=$legacy" "-Dsmartstock.web=$appRoot/web" "-Dsmartstock.port=$Port" -cp $classpath smartstock.Main
if ($LASTEXITCODE -ne 0) { throw 'Bridge termine en erreur' }
