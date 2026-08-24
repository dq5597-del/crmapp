param(
    [string]$PrinterName = 'TSC TTP-345',
    [ValidateSet('Calibrate', 'TestFeed')][string]$Mode = 'Calibrate'
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern int StartDocPrinter(IntPtr printer, int level, [In] DOCINFO docInfo);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr printer, byte[] bytes, int count, out int written);
}
'@

$handle = [IntPtr]::Zero
if (-not [RawPrinter]::OpenPrinter($PrinterName, [ref]$handle, [IntPtr]::Zero)) {
    throw "Cannot open printer: $PrinterName"
}

try {
    $doc = New-Object RawPrinter+DOCINFO
    $doc.pDocName = "TSC $Mode"
    $doc.pDataType = 'RAW'
    if ([RawPrinter]::StartDocPrinter($handle, 1, $doc) -le 0) { throw 'Cannot start calibration document' }
    try {
        if (-not [RawPrinter]::StartPagePrinter($handle)) { throw 'Cannot start calibration page' }
        try {
            if ($Mode -eq 'TestFeed') {
                $command = "SIZE 40 mm,60 mm`r`nGAP 3 mm,0 mm`r`nFORMFEED`r`n"
            } else {
                $command = "GAPDETECT`r`n"
            }
            $bytes = [Text.Encoding]::ASCII.GetBytes($command)
            $written = 0
            if (-not [RawPrinter]::WritePrinter($handle, $bytes, $bytes.Length, [ref]$written) -or $written -ne $bytes.Length) {
                throw 'Calibration command was not completely written'
            }
        } finally { [void][RawPrinter]::EndPagePrinter($handle) }
    } finally { [void][RawPrinter]::EndDocPrinter($handle) }
} finally { [void][RawPrinter]::ClosePrinter($handle) }

Write-Output "$Mode command sent."
