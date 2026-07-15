param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputDir
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

  try {
    $text = (Get-ShapeText $Shape).Trim()
    if (-not $text) { return }
    [void]$Entries.Add([pscustomobject]@{
      text = $text
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

function Get-ClipboardImageWithRetry {
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
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

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.ScreenUpdating = $false

  $workbook = $excel.Workbooks.Open($InputPath, 0, $true)
  $index = 0

  foreach ($sheet in $workbook.Worksheets) {
    $sheetName = [string]$sheet.Name
    if ($sheetName.Trim() -eq ">>") { continue }
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
    $textEntries = @()
    if (@($navyEntries | Where-Object { -not $_.text }).Count -gt 0) {
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

    $sheet.Activate() | Out-Null
    [System.Windows.Forms.Clipboard]::Clear() | Out-Null
    $sheet.Shapes.SelectAll() | Out-Null
    $excel.Selection.CopyPicture(1, 2) | Out-Null

    $image = Get-ClipboardImageWithRetry
    if ($image -eq $null) {
      throw "Excel did not place an image on the clipboard for sheet '$sheetName'."
    }

    $index += 1
    $fileName = "sheet-$index.png"
    $outputPath = Join-Path $OutputDir $fileName
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
      searchTargets = $searchTargets
    }

    $flattened.Dispose()
    $image.Dispose()
  }

  $items | ConvertTo-Json -Depth 4 -Compress
} finally {
  if ($workbook) { $workbook.Close($false) | Out-Null }
  if ($excel) {
    $excel.Quit() | Out-Null
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
