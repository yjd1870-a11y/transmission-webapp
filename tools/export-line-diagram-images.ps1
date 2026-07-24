param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputDir,
  [ValidateSet("PNG", "PDF")][string]$OutputFormat = "PNG",
  [switch]$IndexOnly,
  [string]$JsonOutputPath = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$excel = $null
$workbook = $null
$items = @()

function Get-ShapeText {
  param($Shape)
  try {
    if ($Shape.TextFrame2.HasText -ne 0) {
      return [string]$Shape.TextFrame2.TextRange.Text
    }
  } catch {}
  try {
    if ($Shape.TextFrame.HasText -ne 0) {
      return [string]$Shape.TextFrame.Characters().Text
    }
  } catch {}
  return ""
}

function Get-ShapeRgbParts {
  param($Shape)
  try {
    if ($Shape.Fill.Visible -eq 0) { return $null }
    $rgb = [int]$Shape.Fill.ForeColor.RGB
    return @{
      red = ($rgb -band 255)
      green = (($rgb -shr 8) -band 255)
      blue = (($rgb -shr 16) -band 255)
    }
  } catch {
    return $null
  }
}

function Get-ShapeTextFontRgb {
  param($Shape)
  try {
    return [int64]$Shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB
  } catch {}
  try {
    return [int64]$Shape.TextFrame.Characters().Font.Color
  } catch {}
  return $null
}

function Test-SearchNavyFill {
  param($Shape)
  $parts = Get-ShapeRgbParts $Shape
  if ($parts -eq $null) { return $false }
  $red = [double]$parts["red"]
  $green = [double]$parts["green"]
  $blue = [double]$parts["blue"]
  $luminance = (($red * 299) + ($green * 587) + ($blue * 114)) / 1000
  return $luminance -lt 115 `
    -and $red -le 80 `
    -and $green -le 110 `
    -and $blue -ge 60 `
    -and $blue -ge ($red + 25) `
    -and $blue -ge ($green + 15)
}

function Test-SearchableShapeType {
  param($Shape)
  try {
    $shapeType = [int]$Shape.Type
    # AutoShape, Freeform and TextBox can contain the searchable CELL/B2C
    # labels. Lines, connectors and pictures account for most diagram objects
    # and can be skipped before making expensive Fill/TextFrame COM calls.
    return $shapeType -eq 1 -or $shapeType -eq 5 -or $shapeType -eq 17
  } catch {
    return $false
  }
}

function Add-NavyShapeEntry {
  param(
    $Shape,
    [System.Collections.ArrayList]$Entries
  )

  try {
    if ($Shape.Visible -eq 0) { return }
  } catch {
    return
  }

  try {
    # Group shapes do not reliably expose their children's fill or text through
    # the parent. Index the real leaf shapes so grouped CELL/B2C labels are kept.
    if ($Shape.Type -eq 6 -and $Shape.GroupItems.Count -gt 0) {
      for ($itemIndex = 1; $itemIndex -le $Shape.GroupItems.Count; $itemIndex += 1) {
        Add-NavyShapeEntry -Shape $Shape.GroupItems.Item($itemIndex) -Entries $Entries
      }
      return
    }
  } catch {}

  if (-not (Test-SearchableShapeType $Shape)) { return }

  try {
    # TextFrame COM calls are expensive on large drawings. Read text only after
    # confirming that the leaf is one of the searchable navy shapes.
    if (-not (Test-SearchNavyFill $Shape)) { return }
    $left = [double]$Shape.Left
    $top = [double]$Shape.Top
    $width = [double]$Shape.Width
    $height = [double]$Shape.Height
    if ($width -le 0 -or $height -le 0) { return }
    [void]$Entries.Add([pscustomobject]@{
      text = (Get-ShapeText $Shape).Trim()
      left = $left
      top = $top
      width = $width
      height = $height
    })
  } catch {}
}

function Add-TextShapeEntry {
  param(
    $Shape,
    [System.Collections.ArrayList]$Entries
  )

  try {
    if ($Shape.Visible -eq 0) { return }
    if ($Shape.Type -eq 6 -and $Shape.GroupItems.Count -gt 0) {
      for ($itemIndex = 1; $itemIndex -le $Shape.GroupItems.Count; $itemIndex += 1) {
        Add-TextShapeEntry -Shape $Shape.GroupItems.Item($itemIndex) -Entries $Entries
      }
      return
    }
  } catch {
    return
  }

  if (-not (Test-SearchableShapeType $Shape)) { return }

  try {
    $text = (Get-ShapeText $Shape).Trim()
    if (-not $text) { return }
    [void]$Entries.Add([pscustomobject]@{
      text = $text
      navy = Test-SearchNavyFill $Shape
      fontRgb = Get-ShapeTextFontRgb $Shape
      left = [double]$Shape.Left
      top = [double]$Shape.Top
      width = [double]$Shape.Width
      height = [double]$Shape.Height
    })
  } catch {}
}

function Test-TextCenterInsideShape {
  param($TextEntry, $ShapeEntry)
  $centerX = $TextEntry.left + ($TextEntry.width / 2)
  $centerY = $TextEntry.top + ($TextEntry.height / 2)
  $tolerance = [Math]::Max(0.5, [Math]::Min($ShapeEntry.width, $ShapeEntry.height) * 0.08)
  return $centerX -ge ($ShapeEntry.left - $tolerance) `
    -and $centerX -le ($ShapeEntry.left + $ShapeEntry.width + $tolerance) `
    -and $centerY -ge ($ShapeEntry.top - $tolerance) `
    -and $centerY -le ($ShapeEntry.top + $ShapeEntry.height + $tolerance)
}

function Test-MapyeongExternalSearchText {
  param([string]$Text)
  $value = ([string]$Text).Trim()
  if (-not $value) { return $false }
  $compact = $value -replace '[^\p{L}\p{N}#]', ''
  if ($compact.Length -lt 6) { return $false }
  $distanceToken = -join ([char]0xAC70, [char]0xB9AC)
  $specToken = -join ([char]0xADDC, [char]0xACA9)
  $codeToken = -join ([char]0xCF54, [char]0xB4DC)
  $manholeToken = -join ([char]0xB9E8, [char]0xD640)
  $poleToken = -join ([char]0xC804, [char]0xC8FC)
  $cellNameToken = -join ([char]0xC140, [char]0xBA85)
  $lineNumberToken = -join ([char]0xC120, [char]0xBC88)
  $dedicatedToken = -join ([char]0xC804, [char]0xC6A9)
  $excludedPrefixPattern = '^\s*(' + [regex]::Escape($distanceToken) + '|' + [regex]::Escape($specToken) + '|' + [regex]::Escape($codeToken) + '|' + [regex]::Escape($manholeToken) + '|' + [regex]::Escape($poleToken) + ')\s*:'
  if ($value -match $excludedPrefixPattern) { return $false }
  if ($compact -match '^[0-9]+$') { return $false }
  $servicePattern = '(' + [regex]::Escape($cellNameToken) + '|' + [regex]::Escape($lineNumberToken) + '|' + [regex]::Escape($dedicatedToken) + '|B2C|#)'
  $hangulStart = [char]0xAC00
  $hangulEnd = [char]0xD7A3
  $hangulPattern = '[' + $hangulStart + '-' + $hangulEnd + ']{4,}'
  return $value -match $servicePattern -or $compact -match $hangulPattern
}

function Test-MapyeongSearchTextShape {
  param($TextEntry)
  if (-not (Test-MapyeongExternalSearchText $TextEntry.text)) { return $false }
  $fontRgb = $TextEntry.fontRgb
  $blackRgb = [int64]0
  $purpleRgb = [int64]10498160
  $mixedRgb = [int64]-2147483648
  $cellNameToken = -join ([char]0xC140, [char]0xBA85)
  $cellPattern = '(' + [regex]::Escape($cellNameToken) + '|#G[0-9A-Z]{4,})'

  # Mapyeong CELL labels are black. Limit black text to explicit cell labels/codes
  # so ordinary pole numbers and infrastructure annotations are not indexed.
  if ($fontRgb -eq $blackRgb) {
    return ([string]$TextEntry.text) -match $cellPattern
  }

  # Mapyeong B2C labels use Excel purple (#7030A0). Some labels include a red
  # line-number run, which Excel reports as the mixed-color sentinel.
  return $fontRgb -eq $purpleRgb -or $fontRgb -eq $mixedRgb
}

function Get-ClipboardImageWithRetry {
  param([int]$Attempts = 80)
  for ($attempt = 0; $attempt -lt $Attempts; $attempt += 1) {
    try {
      $image = [System.Windows.Forms.Clipboard]::GetImage()
      if ($image -ne $null) { return $image }
    } catch {
      Start-Sleep -Milliseconds 150
    }
    Start-Sleep -Milliseconds 150
  }
  return $null
}

function Copy-SheetPictureWithRetry {
  param(
    $Sheet,
    $Excel
  )
  for ($copyAttempt = 0; $copyAttempt -lt 4; $copyAttempt += 1) {
    try {
      $Sheet.Activate() | Out-Null
      [System.Windows.Forms.Clipboard]::Clear() | Out-Null
      $Sheet.Shapes.SelectAll() | Out-Null
      $Excel.Selection.CopyPicture(1, 2) | Out-Null
      $image = Get-ClipboardImageWithRetry -Attempts 80
      if ($image -ne $null) { return $image }
    } catch {}
    Start-Sleep -Milliseconds 700
  }
  return $null
}

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.ScreenUpdating = $false

  $workbook = $excel.Workbooks.Open($InputPath, 0, $true)
  $isMapyeongWorkbook = $false
  $mapyeongToken = -join ([char]0xB9C8, [char]0xD3C9)
  foreach ($workbookSheet in $workbook.Worksheets) {
    $workbookSheetName = [string]($workbookSheet.Name)
    if ($workbookSheetName.Contains($mapyeongToken)) {
      $isMapyeongWorkbook = $true
      break
    }
  }
  $index = 0
  $linebookToken = -join ([char]0xC120, [char]0xBC88, [char]0xC7A5)
  $linebookTableToken = -join ([char]0xC120, [char]0xBC88, [char]0xD45C)
  $circuitStatusToken = -join ([char]0xD68C, [char]0xC120, [char]0xD604, [char]0xD669)

  foreach ($sheet in $workbook.Worksheets) {
    $sheetName = [string]$sheet.Name
    if ($sheetName.Trim() -eq ">>") { continue }
    if ($sheetName.Contains($linebookToken) `
      -or $sheetName.Contains($linebookTableToken) `
      -or $sheetName.Contains($circuitStatusToken)) { continue }
    if ($sheet.Shapes.Count -lt 1) { continue }

    $minLeft = [double]::PositiveInfinity
    $minTop = [double]::PositiveInfinity
    $maxRight = 0.0
    $maxBottom = 0.0
    foreach ($shape in $sheet.Shapes) {
      if ($shape.Visible -eq 0) { continue }
      $left = [double]$shape.Left
      $top = [double]$shape.Top
      $right = $left + [double]$shape.Width
      $bottom = $top + [double]$shape.Height
      if ($left -lt $minLeft) { $minLeft = $left }
      if ($top -lt $minTop) { $minTop = $top }
      if ($right -gt $maxRight) { $maxRight = $right }
      if ($bottom -gt $maxBottom) { $maxBottom = $bottom }
    }
    if ([double]::IsInfinity($minLeft) -or $maxRight -le $minLeft -or $maxBottom -le $minTop) { continue }

    # Excel clips shapes outside the worksheet origin when CopyPicture renders
    # the selection. Use the same visible bounds for search coordinates.
    $exportLeft = [Math]::Max(0.0, $minLeft)
    $exportTop = [Math]::Max(0.0, $minTop)
    if ($maxRight -le $exportLeft -or $maxBottom -le $exportTop) { continue }
    $boundsWidth = $maxRight - $exportLeft
    $boundsHeight = $maxBottom - $exportTop
    $navyEntries = New-Object System.Collections.ArrayList
    foreach ($shape in $sheet.Shapes) {
      Add-NavyShapeEntry -Shape $shape -Entries $navyEntries
    }
    $blankNavyEntries = @($navyEntries | Where-Object { -not $_.text })
    $textEntries = @()
    if ($blankNavyEntries.Count -gt 0) {
      $allTextEntries = New-Object System.Collections.ArrayList
      foreach ($shape in $sheet.Shapes) {
        Add-TextShapeEntry -Shape $shape -Entries $allTextEntries
      }
      $textEntries = @($allTextEntries)
    }
    $searchTargets = @()
    foreach ($navyEntry in $navyEntries) {
      $targetTexts = New-Object System.Collections.ArrayList
      if ($navyEntry.text) {
        [void]$targetTexts.Add($navyEntry.text)
      } else {
        foreach ($textEntry in $textEntries) {
          if (Test-TextCenterInsideShape -TextEntry $textEntry -ShapeEntry $navyEntry) {
            [void]$targetTexts.Add($textEntry.text)
          }
        }
      }
      $text = (@($targetTexts | Where-Object { $_ } | Select-Object -Unique) -join "`n").Trim()
      if (-not $text) { continue }
      $visibleLeft = [Math]::Max($exportLeft, [double]$navyEntry.left)
      $visibleTop = [Math]::Max($exportTop, [double]$navyEntry.top)
      $visibleRight = [Math]::Min($maxRight, [double]$navyEntry.left + [double]$navyEntry.width)
      $visibleBottom = [Math]::Min($maxBottom, [double]$navyEntry.top + [double]$navyEntry.height)
      if ($visibleRight -le $visibleLeft -or $visibleBottom -le $visibleTop) { continue }
      $searchTargets += [pscustomobject]@{
        text = $text
        label = $text
        left = (($visibleLeft - $exportLeft) / $boundsWidth) * 100
        top = (($visibleTop - $exportTop) / $boundsHeight) * 100
        width = (($visibleRight - $visibleLeft) / $boundsWidth) * 100
        height = (($visibleBottom - $visibleTop) / $boundsHeight) * 100
      }
    }
    $needsMapyeongExternalTextEntries = $isMapyeongWorkbook -and $searchTargets.Count -eq 0
    if ($needsMapyeongExternalTextEntries -and $textEntries.Count -eq 0) {
      $allTextEntries = New-Object System.Collections.ArrayList
      foreach ($shape in $sheet.Shapes) {
        Add-TextShapeEntry -Shape $shape -Entries $allTextEntries
      }
      $textEntries = @($allTextEntries)
    }
    if ($needsMapyeongExternalTextEntries) {
      foreach ($textEntry in $textEntries) {
        if ($textEntry.navy -or -not (Test-MapyeongSearchTextShape $textEntry)) { continue }
        $visibleLeft = [Math]::Max($exportLeft, [double]$textEntry.left)
        $visibleTop = [Math]::Max($exportTop, [double]$textEntry.top)
        $visibleRight = [Math]::Min($maxRight, [double]$textEntry.left + [double]$textEntry.width)
        $visibleBottom = [Math]::Min($maxBottom, [double]$textEntry.top + [double]$textEntry.height)
        if ($visibleRight -le $visibleLeft -or $visibleBottom -le $visibleTop) { continue }
        $searchTargets += [pscustomobject]@{
          text = $textEntry.text
          label = $textEntry.text
          left = (($visibleLeft - $exportLeft) / $boundsWidth) * 100
          top = (($visibleTop - $exportTop) / $boundsHeight) * 100
          width = (($visibleRight - $visibleLeft) / $boundsWidth) * 100
          height = (($visibleBottom - $visibleTop) / $boundsHeight) * 100
          source = "mapyeong-external-text"
        }
      }
    }

    $index += 1
    $extension = $OutputFormat.ToLowerInvariant()
    $fileName = "sheet-$index.$extension"
    $outputPath = Join-Path $OutputDir $fileName
    if ($IndexOnly) {
      $items += [pscustomobject]@{
        sheetName = $sheetName
        fileName = $fileName
        widthPixels = [Math]::Round($boundsWidth)
        heightPixels = [Math]::Round($boundsHeight)
        imageFormat = $extension
        searchTargets = $searchTargets
      }
      continue
    }

    if ($OutputFormat -eq "PDF") {
      if (Test-Path -LiteralPath $outputPath) {
        Remove-Item -LiteralPath $outputPath -Force
      }
      $sheet.ExportAsFixedFormat(0, $outputPath)
      $items += [pscustomobject]@{
        sheetName = $sheetName
        fileName = $fileName
        widthPixels = [Math]::Round($boundsWidth)
        heightPixels = [Math]::Round($boundsHeight)
        imageFormat = "pdf"
        searchTargets = $searchTargets
      }
      continue
    }

    $image = Copy-SheetPictureWithRetry -Sheet $sheet -Excel $excel
    if ($image -eq $null) {
      throw "Excel did not place an image on the clipboard for sheet '$sheetName'."
    }

    $flattened = New-Object System.Drawing.Bitmap($image.Width, $image.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($flattened)
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.DrawImage($image, 0, 0, $image.Width, $image.Height)
    $graphics.Dispose()
    $flattened.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $items += [pscustomobject]@{
      sheetName = $sheetName
      fileName = $fileName
      widthPixels = $image.Width
      heightPixels = $image.Height
      imageFormat = "png"
      searchTargets = $searchTargets
    }

    $flattened.Dispose()
    $image.Dispose()
  }

  $json = @($items) | ConvertTo-Json -Depth 8 -Compress
  if ($JsonOutputPath) {
    [System.IO.File]::WriteAllText($JsonOutputPath, $json, [System.Text.UTF8Encoding]::new($false))
  } else {
    $json
  }
} finally {
  if ($workbook) { $workbook.Close($false) | Out-Null }
  if ($excel) {
    $excel.Quit() | Out-Null
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
