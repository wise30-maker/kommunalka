param([string]$Path, [string]$Out)
$ErrorActionPreference = "Stop"
$Path = $Path -replace '/', '\'
if (-not (Test-Path -LiteralPath $Path)) { Write-Output "NO_FILE: $Path"; exit 1 }
Write-Output ("FILE_OK: " + (Get-Item -LiteralPath $Path).Length + " bytes")

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null

$langs = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages
Write-Output ("OCR_LANGS=" + (($langs | ForEach-Object { $_.LanguageTag }) -join ','))

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) {
  foreach ($tag in @('ru-RU', 'ru', 'en-US')) {
    $lang = New-Object Windows.Globalization.Language $tag
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
    if ($engine) { break }
  }
}
if (-not $engine) { Write-Output "OCR_ENGINE_UNAVAILABLE"; exit 2 }
Write-Output ("ENGINE_LANG=" + $engine.RecognizerLanguage.LanguageTag)

try {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  Write-Output ("IMG=" + $bitmap.PixelWidth + "x" + $bitmap.PixelHeight)
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($line in $result.Lines) { $lines.Add($line.Text) }
  if ($Out) {
    [System.IO.File]::WriteAllLines(($Out -replace '/', '\'), $lines, [System.Text.UTF8Encoding]::new($false))
    Write-Output ("WROTE: " + $lines.Count + " lines")
  } else {
    Write-Output "----TEXT----"
    $lines | ForEach-Object { Write-Output $_ }
  }
} catch {
  Write-Output ("ERR: " + $_.Exception.Message)
  if ($_.Exception.InnerException) { Write-Output ("INNER: " + $_.Exception.InnerException.Message) }
  exit 3
}
