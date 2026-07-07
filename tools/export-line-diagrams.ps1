param(
  [Parameter(Mandatory = $true)][string]$WorkbookPath,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [int]$MaxPixels = 8000,
  [ValidateSet("PNG", "SVG", "PDF")][string]$OutputFormat = "PNG",
  [int]$OnlyWorksheetIndex = 0
)

$ErrorActionPreference = "Stop"
$msoFalse = 0
$msoTrue = -1
$msoGroup = 6
$ppLayoutBlank = 12
$ppPasteEnhancedMetafile = 2

function Release-ComObject {
  param([object]$Value)
  if ($null -ne $Value -and [System.Runtime.InteropServices.Marshal]::IsComObject($Value)) {
    [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value)
  }
}

function Get-OfficeRgb {
  param([long]$Value)
  return @{
    red = [int]($Value -band 0xFF)
    green = [int](($Value -shr 8) -band 0xFF)
    blue = [int](($Value -shr 16) -band 0xFF)
  }
}

function Test-SearchNavy {
  param([object]$Shape)
  try {
    if ($Shape.Fill.Visible -eq 0) { return $false }
    $rgb = Get-OfficeRgb ([long]$Shape.Fill.ForeColor.RGB)
    $luminance = (($rgb.red * 299) + ($rgb.green * 587) + ($rgb.blue * 114)) / 1000
    return $luminance -lt 115 `
      -and $rgb.red -le 80 `
      -and $rgb.green -le 110 `
      -and $rgb.blue -ge 60 `
      -and $rgb.blue -ge ($rgb.red + 25) `
      -and $rgb.blue -ge ($rgb.green + 15)
  } catch {
    return $false
  }
}

function Get-ShapeText {
  param([object]$Shape)
  try {
    if ($Shape.TextFrame2.HasText -eq $msoTrue) {
      return [string]$Shape.TextFrame2.TextRange.Text
    }
  } catch {}
  try {
    if ($Shape.TextFrame.HasText -eq $msoTrue) {
      return [string]$Shape.TextFrame.Characters().Text
    }
  } catch {}
  return ""
}

function Add-SearchTarget {
  param(
    [object]$Shape,
    [double]$MinLeft,
    [double]$MinTop,
    [double]$TotalWidth,
    [double]$TotalHeight,
    [System.Collections.Generic.List[object]]$Targets
  )
  $text = (Get-ShapeText $Shape).Trim()
  $normalized = ($text -replace '[^\p{L}\p{N}]', '').ToUpperInvariant()
  if ($normalized.Length -lt 6 -or -not (Test-SearchNavy $Shape)) { return }
  try {
    $Targets.Add([ordered]@{
      text = $normalized
      label = $text
      left = (([double]$Shape.Left - $MinLeft) / $TotalWidth) * 100
      top = (([double]$Shape.Top - $MinTop) / $TotalHeight) * 100
      width = ([double]$Shape.Width / $TotalWidth) * 100
      height = ([double]$Shape.Height / $TotalHeight) * 100
    })
  } catch {}
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$OutputDirectory = (Resolve-Path -LiteralPath $OutputDirectory).Path
$excel = $null
$workbook = $null
$powerPoint = $null
$presentation = $null

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.ScreenUpdating = $false
  $workbook = $excel.Workbooks.Open($WorkbookPath, 0, $true)

  $powerPoint = New-Object -ComObject PowerPoint.Application
  $presentation = $powerPoint.Presentations.Add($msoFalse)

  $manifest = [ordered]@{
    version = 1
    sourceFile = [System.IO.Path]::GetFileName($WorkbookPath)
    linebookSheetName = [string]$workbook.Worksheets.Item(1).Name
    sheets = [System.Collections.Generic.List[object]]::new()
  }

  $outputIndex = 0
  for ($sheetIndex = 2; $sheetIndex -le $workbook.Worksheets.Count; $sheetIndex++) {
    if ($OnlyWorksheetIndex -gt 0 -and $sheetIndex -ne $OnlyWorksheetIndex) { continue }
    $sheet = $workbook.Worksheets.Item($sheetIndex)
    try {
      if ($sheet.Shapes.Count -eq 0) { continue }
      $outputIndex++
      $sheet.Activate()
      $sheet.Shapes.SelectAll()
      $shapeRange = $excel.Selection.ShapeRange

      $minLeft = [double]::PositiveInfinity
      $minTop = [double]::PositiveInfinity
      $maxRight = [double]::NegativeInfinity
      $maxBottom = [double]::NegativeInfinity
      for ($shapeIndex = 1; $shapeIndex -le $shapeRange.Count; $shapeIndex++) {
        $shape = $shapeRange.Item($shapeIndex)
        try {
          $left = [double]$shape.Left
          $top = [double]$shape.Top
          $right = $left + [double]$shape.Width
          $bottom = $top + [double]$shape.Height
          if ($left -lt $minLeft) { $minLeft = $left }
          if ($top -lt $minTop) { $minTop = $top }
          if ($right -gt $maxRight) { $maxRight = $right }
          if ($bottom -gt $maxBottom) { $maxBottom = $bottom }
        } finally {
          Release-ComObject $shape
        }
      }

      $totalWidth = [Math]::Max(1, $maxRight - $minLeft)
      $totalHeight = [Math]::Max(1, $maxBottom - $minTop)
      $searchTargets = [System.Collections.Generic.List[object]]::new()
      for ($shapeIndex = 1; $shapeIndex -le $shapeRange.Count; $shapeIndex++) {
        $shape = $shapeRange.Item($shapeIndex)
        try {
          Add-SearchTarget $shape $minLeft $minTop $totalWidth $totalHeight $searchTargets
          if ($shape.Type -eq $msoGroup) {
            for ($groupIndex = 1; $groupIndex -le $shape.GroupItems.Count; $groupIndex++) {
              $groupShape = $shape.GroupItems.Item($groupIndex)
              try {
                Add-SearchTarget $groupShape $minLeft $minTop $totalWidth $totalHeight $searchTargets
              } finally {
                Release-ComObject $groupShape
              }
            }
          }
        } finally {
          Release-ComObject $shape
        }
      }

      $excel.Selection.Copy()
      Start-Sleep -Milliseconds 250

      while ($presentation.Slides.Count -gt 0) {
        $presentation.Slides.Item(1).Delete()
      }
      $slide = $presentation.Slides.Add(1, $ppLayoutBlank)
      $maxSlidePoints = 4000.0
      if ($totalWidth -ge $totalHeight) {
        $slideWidth = $maxSlidePoints
        $slideHeight = [Math]::Max(72, $maxSlidePoints * ($totalHeight / $totalWidth))
      } else {
        $slideHeight = $maxSlidePoints
        $slideWidth = [Math]::Max(72, $maxSlidePoints * ($totalWidth / $totalHeight))
      }
      $presentation.PageSetup.SlideWidth = [single]$slideWidth
      $presentation.PageSetup.SlideHeight = [single]$slideHeight
      $pastedRange = $slide.Shapes.PasteSpecial($ppPasteEnhancedMetafile)
      $picture = $pastedRange.Item(1)
      $picture.LockAspectRatio = $msoFalse
      $picture.Left = 0
      $picture.Top = 0
      $picture.Width = [single]$slideWidth
      $picture.Height = [single]$slideHeight

      if ($totalWidth -ge $totalHeight) {
        $pixelWidth = $MaxPixels
        $pixelHeight = [Math]::Max(1, [Math]::Round($MaxPixels * ($totalHeight / $totalWidth)))
      } else {
        $pixelHeight = $MaxPixels
        $pixelWidth = [Math]::Max(1, [Math]::Round($MaxPixels * ($totalWidth / $totalHeight)))
      }
      $extension = $OutputFormat.ToLowerInvariant()
      $fileName = "sheet-{0:D2}.{1}" -f $outputIndex, $extension
      $filePath = Join-Path $OutputDirectory $fileName
      $resetPresentationAfterExport = $false
      if ($OutputFormat -eq "SVG") {
        $slide.Export($filePath, "SVG")
      } elseif ($OutputFormat -eq "PDF") {
        if (Test-Path -LiteralPath $filePath) {
          Remove-Item -LiteralPath $filePath -Force
        }
        $presentation.SaveAs($filePath, 32)
        $resetPresentationAfterExport = $true
      } else {
        $slide.Export($filePath, "PNG", $pixelWidth, $pixelHeight)
      }

      $manifest.sheets.Add([ordered]@{
        sheetName = [string]$sheet.Name
        file = $fileName
        width = $pixelWidth
        height = $pixelHeight
        imageFormat = $extension
        searchTargets = $searchTargets
      })
      Write-Output ("Exported {0}: {1}x{2}, {3} search targets" -f $sheet.Name, $pixelWidth, $pixelHeight, $searchTargets.Count)

      Release-ComObject $picture
      Release-ComObject $pastedRange
      Release-ComObject $slide
      Release-ComObject $shapeRange
      if ($resetPresentationAfterExport) {
        $presentation.Close()
        Release-ComObject $presentation
        $presentation = $powerPoint.Presentations.Add($msoFalse)
      }
    } finally {
      Release-ComObject $sheet
    }
  }

  $manifestPath = Join-Path $OutputDirectory "manifest.json"
  $manifestJson = $manifest | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($manifestPath, $manifestJson, [System.Text.UTF8Encoding]::new($false))
  $manifestScriptPath = Join-Path $OutputDirectory "manifest-data.js"
  $manifestScript = "window.__LINE_DIAGRAM_MANIFESTS__ = window.__LINE_DIAGRAM_MANIFESTS__ || {};`nwindow.__LINE_DIAGRAM_MANIFESTS__.anseong = $manifestJson;`n"
  [System.IO.File]::WriteAllText($manifestScriptPath, $manifestScript, [System.Text.UTF8Encoding]::new($false))
  Write-Output ("Manifest: {0}" -f $manifestPath)
} finally {
  if ($null -ne $presentation) {
    try { $presentation.Close() } catch {}
  }
  if ($null -ne $powerPoint) {
    try { $powerPoint.Quit() } catch {}
  }
  if ($null -ne $workbook) {
    try { $workbook.Close($false) } catch {}
  }
  if ($null -ne $excel) {
    try { $excel.Quit() } catch {}
  }
  Release-ComObject $presentation
  Release-ComObject $powerPoint
  Release-ComObject $workbook
  Release-ComObject $excel
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
