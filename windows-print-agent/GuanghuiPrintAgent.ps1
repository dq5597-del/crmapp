param(
  [Parameter(Mandatory=$true)][string]$PrinterId,
  [string]$PrinterToken,
  [string]$PrinterTokenFile,
  [string]$BaseUrl = 'https://crmapp-topaz.vercel.app',
  [int]$PollSeconds = 4
)

$ErrorActionPreference = 'Stop'

if (-not $PrinterToken -and $PrinterTokenFile) {
  $PrinterToken = (Get-Content -LiteralPath $PrinterTokenFile -Raw).Trim()
}
if (-not $PrinterToken) { throw '缺少印表機連線憑證。' }

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

if (-not ('Guanghui.RawPrinter' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace Guanghui {
  public static class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOC_INFO_1 {
      [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
      [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
      [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool OpenPrinter(string printerName, out IntPtr printerHandle, IntPtr defaults);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr printerHandle);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern int StartDocPrinter(IntPtr printerHandle, int level, ref DOC_INFO_1 docInfo);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr printerHandle);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr printerHandle);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr printerHandle);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr printerHandle, byte[] buffer, int count, out int written);
  }
}
'@
}

function Invoke-AgentApi([string]$Path, [hashtable]$Body = @{}) {
  $headers = @{ 'X-Printer-Id' = $PrinterId; 'X-Printer-Token' = $PrinterToken }
  $webResponse = Invoke-WebRequest -UseBasicParsing -Method Post -Uri ($BaseUrl.TrimEnd('/') + $Path) -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ($Body | ConvertTo-Json -Depth 8 -Compress)
  $responseBytes = $webResponse.RawContentStream.ToArray()
  $responseText = [System.Text.Encoding]::UTF8.GetString($responseBytes)
  if ([string]::IsNullOrWhiteSpace($responseText)) { return $null }
  return $responseText | ConvertFrom-Json
}

function New-UnicodeText([int[]]$CodePoints) {
  return -join ($CodePoints | ForEach-Object { [char]$_ })
}

function Send-RawPrinterBytes([string]$PrinterName, [byte[]]$Bytes, [string]$DocumentName) {
  $printerHandle = [IntPtr]::Zero
  if (-not [Guanghui.RawPrinter]::OpenPrinter($PrinterName, [ref]$printerHandle, [IntPtr]::Zero)) {
    throw "Unable to open printer '$PrinterName' (Win32 $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
  }

  $docStarted = $false
  $pageStarted = $false
  try {
    $docInfo = New-Object Guanghui.RawPrinter+DOC_INFO_1
    $docInfo.pDocName = $DocumentName
    $docInfo.pOutputFile = $null
    $docInfo.pDataType = 'RAW'
    if ([Guanghui.RawPrinter]::StartDocPrinter($printerHandle, 1, [ref]$docInfo) -le 0) {
      throw "Unable to start RAW print job (Win32 $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
    }
    $docStarted = $true
    if (-not [Guanghui.RawPrinter]::StartPagePrinter($printerHandle)) {
      throw "Unable to start RAW print page (Win32 $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
    }
    $pageStarted = $true
    $written = 0
    if (-not [Guanghui.RawPrinter]::WritePrinter($printerHandle, $Bytes, $Bytes.Length, [ref]$written) -or $written -ne $Bytes.Length) {
      throw "Incomplete RAW print write ($written of $($Bytes.Length) bytes)."
    }
  } finally {
    if ($pageStarted) { [void][Guanghui.RawPrinter]::EndPagePrinter($printerHandle) }
    if ($docStarted) { [void][Guanghui.RawPrinter]::EndDocPrinter($printerHandle) }
    [void][Guanghui.RawPrinter]::ClosePrinter($printerHandle)
  }
}

function Convert-BitmapToTsplBytes([System.Drawing.Bitmap]$Bitmap) {
  $widthBytes = [int][Math]::Ceiling($Bitmap.Width / 8.0)
  $result = New-Object byte[] ($widthBytes * $Bitmap.Height)
  $rect = New-Object System.Drawing.Rectangle(0, 0, $Bitmap.Width, $Bitmap.Height)
  $bitmapData = $Bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  try {
    $sourceStride = [Math]::Abs($bitmapData.Stride)
    $sourceRow = New-Object byte[] $sourceStride
    for ($y = 0; $y -lt $Bitmap.Height; $y++) {
      $rowAddress = [IntPtr]::Add($bitmapData.Scan0, $y * $bitmapData.Stride)
      [Runtime.InteropServices.Marshal]::Copy($rowAddress, $sourceRow, 0, $sourceStride)
      for ($x = 0; $x -lt $Bitmap.Width; $x++) {
        $sourceOffset = $x * 3
        $blue = [int]$sourceRow[$sourceOffset]
        $green = [int]$sourceRow[$sourceOffset + 1]
        $red = [int]$sourceRow[$sourceOffset + 2]
        $luminance = (299 * $red + 587 * $green + 114 * $blue) / 1000
        if ($luminance -lt 180) {
          $targetOffset = ($y * $widthBytes) + [Math]::Floor($x / 8)
          $result[$targetOffset] = $result[$targetOffset] -bor (0x80 -shr ($x % 8))
        }
      }
    }
  } finally {
    $Bitmap.UnlockBits($bitmapData)
  }
  return ,$result
}

function Print-WarrantyLabel($PrinterName, $Payload, $Label) {
  # TTP-345 is a 300 dpi (12 dots/mm) printer. The roll is 40 mm wide and advances 60 mm per label.
  $labelWidthDots = 480
  $labelLengthDots = 720
  $widthBytes = 60
  $copies = [Math]::Max(1, [Math]::Min(100, [int]$Label.copies))

  $bitmap = New-Object System.Drawing.Bitmap($labelWidthDots, $labelLengthDots, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $bitmap.SetResolution(300, 300)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $titleFont = New-Object System.Drawing.Font('Microsoft JhengHei', 9, [System.Drawing.FontStyle]::Bold)
  $badgeFont = New-Object System.Drawing.Font('Microsoft JhengHei', 6.5, [System.Drawing.FontStyle]::Bold)
  $productFont = New-Object System.Drawing.Font('Microsoft JhengHei', 11, [System.Drawing.FontStyle]::Bold)
  $detailFont = New-Object System.Drawing.Font('Microsoft JhengHei', 8)
  $footerFont = New-Object System.Drawing.Font('Microsoft JhengHei', 7.5)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 3)
  try {
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $brush = [System.Drawing.Brushes]::Black
    $margin = 20
    $contentWidth = $labelWidthDots - (2 * $margin)

    $brand = 'GH ' + (New-UnicodeText @(0x5149,0x8F1D,0x5F71,0x97F3,0x79D1,0x6280))
    $badge = New-UnicodeText @(0x4FDD,0x56FA,0x8CBC,0x7D19)
    $modelLabel = New-UnicodeText @(0x578B,0x865F,0xFF1A)
    $purchaseLabel = New-UnicodeText @(0x8CFC,0x8CB7,0xFF1A)
    $orderLabel = New-UnicodeText @(0x55AE,0x865F,0xFF1A)
    $clientLabel = New-UnicodeText @(0x5BA2,0x6236,0xFF1A)
    $serviceLabel = New-UnicodeText @(0x4FDD,0x56FA,0x670D,0x52D9)
    $keepLabel = New-UnicodeText @(0x8ACB,0x4FDD,0x7559,0x672C,0x8CBC,0x7D19)

    $graphics.DrawString($brand, $titleFont, $brush, 20, 16)
    $badgeBox = New-Object System.Drawing.RectangleF(345, 22, 115, 40)
    $badgeFormat = New-Object System.Drawing.StringFormat
    $badgeFormat.Alignment = [System.Drawing.StringAlignment]::Far
    $graphics.DrawString($badge, $badgeFont, $brush, $badgeBox, $badgeFormat)
    $badgeFormat.Dispose()
    $graphics.DrawLine($pen, $margin, 72, $labelWidthDots - $margin, 72)

    $productBox = New-Object System.Drawing.RectangleF($margin, 88, $contentWidth, 132)
    $graphics.DrawString([string]$Label.product_name, $productFont, $brush, $productBox)
    if ([string]$Label.model) { $graphics.DrawString($modelLabel + [string]$Label.model, $detailFont, $brush, $margin, 230) }
    $graphics.DrawString($purchaseLabel + [string]$Payload.purchase_date, $detailFont, $brush, $margin, 286)
    $graphics.DrawString($orderLabel + [string]$Payload.order_no, $detailFont, $brush, $margin, 342)
    if ([string]$Payload.client_name) { $graphics.DrawString($clientLabel + [string]$Payload.client_name, $detailFont, $brush, $margin, 398) }

    $graphics.DrawLine($pen, $margin, 476, $labelWidthDots - $margin, 476)
    $footer = $serviceLabel + " 03-8321087`n" + $keepLabel
    $footerBox = New-Object System.Drawing.RectangleF($margin, 500, $contentWidth, 120)
    $graphics.DrawString($footer, $footerFont, $brush, $footerBox)
  } finally {
    $pen.Dispose()
    $titleFont.Dispose()
    $badgeFont.Dispose()
    $productFont.Dispose()
    $detailFont.Dispose()
    $footerFont.Dispose()
    $graphics.Dispose()
  }

  try {
    $bitmapBytes = Convert-BitmapToTsplBytes $bitmap
  } finally {
    $bitmap.Dispose()
  }

  # GAPDETECT calibration stores the real gap size in the printer. Do not replace it with an assumed value here.
  $header = [Text.Encoding]::ASCII.GetBytes("SIZE 40 mm,60 mm`r`nDIRECTION 1`r`nREFERENCE 0,0`r`nCLS`r`nBITMAP 0,0,$widthBytes,$labelLengthDots,0,")
  $footer = [Text.Encoding]::ASCII.GetBytes("`r`nPRINT 1,$copies`r`n")
  $printBytes = New-Object byte[] ($header.Length + $bitmapBytes.Length + $footer.Length)
  [Buffer]::BlockCopy($header, 0, $printBytes, 0, $header.Length)
  [Buffer]::BlockCopy($bitmapBytes, 0, $printBytes, $header.Length, $bitmapBytes.Length)
  [Buffer]::BlockCopy($footer, 0, $printBytes, $header.Length + $bitmapBytes.Length, $footer.Length)
  Send-RawPrinterBytes $PrinterName $printBytes 'GH 40x60mm Warranty Label'
}

function Print-SalesOrderA4($PrinterName, $Payload) {
  $work = Join-Path $env:TEMP ('gh-print-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work | Out-Null
  $htmlPath = Join-Path $work 'sales-order.html'
  $pdfPath = Join-Path $work 'sales-order.pdf'
  try {
    if ($Payload.html_base64) {
      $html = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]$Payload.html_base64))
    } else {
      $html = [string]$Payload.html
    }
    $html = $html -replace '<head>', '<head><base href="https://crmapp-topaz.vercel.app/">'
    [System.IO.File]::WriteAllText($htmlPath, $html, [System.Text.UTF8Encoding]::new($true))
    $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
    $acrobat = 'C:\Program Files\Adobe\Acrobat DC\Acrobat\Acrobat.exe'
    if (-not (Test-Path $chrome)) { throw 'Google Chrome is required on the print computer.' }
    if (-not (Test-Path $acrobat)) { throw 'Adobe Acrobat is required on the print computer.' }
    $uri = [uri]$htmlPath
    $p = Start-Process -FilePath $chrome -ArgumentList @('--headless','--disable-gpu','--no-pdf-header-footer',("--print-to-pdf=$pdfPath"),$uri.AbsoluteUri) -WindowStyle Hidden -Wait -PassThru
    if ($p.ExitCode -ne 0 -or -not (Test-Path $pdfPath)) { throw 'Failed to create the sales order PDF.' }
    $printerInfo = Get-Printer -Name $PrinterName -ErrorAction Stop
    $acrobatProcess = Start-Process -FilePath $acrobat -ArgumentList @('/n','/s','/o','/h','/t',("`"$pdfPath`""),("`"$PrinterName`""),("`"$($printerInfo.DriverName)`""),("`"$($printerInfo.PortName)`"")) -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 12
    # Acrobat /t may return a non-zero exit code after handing the job to the spooler.
  } finally {
    if (Test-Path $work) { Remove-Item -LiteralPath $work -Recurse -Force }
  }
}

Write-Host "光輝列印服務已啟動（印表機 ID：$PrinterId）"
while ($true) {
  try {
    $response = Invoke-AgentApi '/api/print/agent/claim'
    if ($null -ne $response.job) {
      try {
        if ($response.job.payload.kind -in @('sales_order_a4','office_document_a4')) {
          Print-SalesOrderA4 $response.printer.windows_printer_name $response.job.payload
        } else {
          foreach ($label in $response.job.payload.labels) { Print-WarrantyLabel $response.printer.windows_printer_name $response.job.payload $label }
        }
        Invoke-AgentApi '/api/print/agent/complete' @{ job_id = $response.job.id; ok = $true } | Out-Null
        Write-Host "[$(Get-Date -Format s)] 已列印：$($response.job.order_no)"
      } catch {
        Invoke-AgentApi '/api/print/agent/complete' @{ job_id = $response.job.id; ok = $false; error = $_.Exception.Message } | Out-Null
        Write-Warning $_.Exception.Message
      }
    }
  } catch { Write-Warning "連線失敗：$($_.Exception.Message)" }
  Start-Sleep -Seconds $PollSeconds
}
