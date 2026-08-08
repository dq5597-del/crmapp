# 光輝 Windows 雲端列印服務

1. 在系統管理的印表機頁建立印表機，取得一次性 `PrinterId` 與 `PrinterToken`。
2. 確認 Windows 已安裝 TSC 驅動，印表機名稱與系統設定完全相同。
3. 以系統管理員 PowerShell 執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\GuanghuiPrintAgent.ps1 -PrinterId "..." -PrinterToken "..."
```

服務啟動後，平板與手機可在銷貨單的「保固貼紙」視窗選擇印表機並按「遠端列印」。
