param(
  [Parameter(Mandatory=$true)][string]$PrinterId,
  [Parameter(Mandatory=$true)][string]$PrinterToken,
  [string]$BaseUrl = 'https://crmapp-topaz.vercel.app',
  [int]$PollSeconds = 4
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

function Invoke-AgentApi([string]$Path, [hashtable]$Body = @{}) {
  $headers = @{ 'X-Printer-Id' = $PrinterId; 'X-Printer-Token' = $PrinterToken }
  Invoke-RestMethod -Method Post -Uri ($BaseUrl.TrimEnd('/') + $Path) -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ($Body | ConvertTo-Json -Depth 8 -Compress)
}

function Print-WarrantyLabel($PrinterName, $Payload, $Label) {
  $copies = [Math]::Max(1, [Math]::Min(100, [int]$Label.copies))
  for ($copy = 0; $copy -lt $copies; $copy++) {
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $PrinterName
    if (-not $doc.PrinterSettings.IsValid) { throw "找不到 Windows 印表機：$PrinterName" }
    $width = [int]([double]$Payload.label_width_mm / 25.4 * 100)
    $height = [int]([double]$Payload.label_height_mm / 25.4 * 100)
    $doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('GH 80x40mm', $width, $height)
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(8, 8, 6, 6)
    $product = [string]$Label.product_name; $model = [string]$Label.model
    $purchaseDate = [string]$Payload.purchase_date; $orderNo = [string]$Payload.order_no; $client = [string]$Payload.client_name
    $handler = [System.Drawing.Printing.PrintPageEventHandler]{
      param($sender, $e)
      $g = $e.Graphics
      $black = [System.Drawing.Brushes]::Black; $teal = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(17,124,126))
      $titleFont = New-Object System.Drawing.Font('Microsoft JhengHei', 10, [System.Drawing.FontStyle]::Bold)
      $smallBold = New-Object System.Drawing.Font('Microsoft JhengHei', 7.5, [System.Drawing.FontStyle]::Bold)
      $productFont = New-Object System.Drawing.Font('Microsoft JhengHei', 11, [System.Drawing.FontStyle]::Bold)
      $small = New-Object System.Drawing.Font('Microsoft JhengHei', 7.2)
      $x = $e.MarginBounds.Left; $y = $e.MarginBounds.Top; $w = $e.MarginBounds.Width
      $g.DrawString('GH 光輝影音科技', $titleFont, $teal, $x, $y)
      $g.DrawString('產品保固貼紙', $smallBold, $teal, $x + $w - 90, $y + 3)
      $g.DrawLine((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(31,157,159), 1.5)), $x, $y + 20, $x + $w, $y + 20)
      $productBox = [System.Drawing.RectangleF]::new([single]$x, [single]($y + 24), [single]$w, [single]35)
      $g.DrawString($product, $productFont, $black, $productBox)
      if ($model) { $g.DrawString("型號：$model", $small, $black, $x, $y + 58) }
      $g.DrawString("購買日期：$purchaseDate", $small, $black, $x, $y + 74)
      $g.DrawString("銷貨單號：$orderNo", $small, $black, $x + 135, $y + 74)
      if ($client) { $g.DrawString("客戶：$client", $small, $black, $x, $y + 90) }
      $g.DrawLine([System.Drawing.Pens]::Gray, $x, $y + 108, $x + $w, $y + 108)
      $g.DrawString('保固服務：03-8321087　請保留本貼紙', $small, $black, $x + 28, $y + 111)
      $e.HasMorePages = $false
    }
    $doc.add_PrintPage($handler)
    try { $doc.Print() } finally { $doc.remove_PrintPage($handler); $doc.Dispose() }
  }
}

Write-Host "光輝列印服務已啟動（印表機 ID：$PrinterId）"
while ($true) {
  try {
    $response = Invoke-AgentApi '/api/print/agent/claim'
    if ($null -ne $response.job) {
      try {
        foreach ($label in $response.job.payload.labels) { Print-WarrantyLabel $response.printer.windows_printer_name $response.job.payload $label }
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
