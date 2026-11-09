param([int]$Port = 8094, [string]$AnemoneJar = $env:ANEMONE_JAR)
$ErrorActionPreference = 'Stop'
$appRoot = (Resolve-Path -LiteralPath (Split-Path $PSScriptRoot -Parent)).Path
if ([string]::IsNullOrWhiteSpace($AnemoneJar)) {
    $AnemoneJar = Join-Path (Split-Path $appRoot -Parent) 'Anémone/root-assembly-0.1.0-SNAPSHOT.jar'
}
if (-not (Test-Path -LiteralPath $AnemoneJar -PathType Leaf)) { throw "JAR Anemone introuvable : $AnemoneJar. Placer le vrai JAR JLAMP24 dans code/Anémone ou definir ANEMONE_JAR." }
$AnemoneJar = (Resolve-Path -LiteralPath $AnemoneJar).Path
if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'web/js/scalajs/main.js'))) { throw 'Compiler le frontend : sbt fastLinkJS dans code/anemone-visualizer.' }
$classes = Join-Path $PSScriptRoot "build/$Port/classes"
New-Item -ItemType Directory -Force -Path $classes | Out-Null
$sources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'src/main/java') -Recurse -Filter *.java | ForEach-Object { $_.FullName })
& javac -encoding UTF-8 -source 8 -target 8 -cp $AnemoneJar -d $classes $sources
if ($LASTEXITCODE -ne 0) { throw 'Compilation bridge echouee' }
$classpath = $classes + [IO.Path]::PathSeparator + $AnemoneJar
& java '-Djava.awt.headless=true' "-Dsmartstock.root=$appRoot" "-Dsmartstock.port=$Port" -cp $classpath smartstock.Main
if ($LASTEXITCODE -ne 0) { throw 'Bridge termine en erreur' }
