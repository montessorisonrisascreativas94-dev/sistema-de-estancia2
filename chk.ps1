$b = "c:\Users\digitacionlab\Documents\SISTEMA\sistema-de-estancia2-main\"
$km = [System.IO.File]::ReadAllText($b+"css\karpus-modern.css")
$dl = [System.IO.File]::ReadAllText($b+"panel_directora.html")
$ml = [System.IO.File]::ReadAllText($b+"panel-maestra.html")
$al = [System.IO.File]::ReadAllText($b+"panel_asistente.html")
$lc = [System.IO.File]::ReadAllText($b+"css\layout.css")
$pd = [System.IO.File]::ReadAllText($b+"css\panel-padre.css")

$results = @(
  [bool]($km.Contains("display: flex !important"))
  [bool]($km.Contains("flex-shrink: 0"))
  [bool]($km.Contains("position: sticky !important"))
  [bool]($km.Contains("margin-left: 0 !important"))
  [bool]($km.Contains("translateX(-100%)"))
  [bool]($km.Contains("width: 80px !important"))
  [bool](-not $dl.Contains("fixed inset-y-0 left-0 z-50 w-72"))
  [bool](-not $ml.Contains("fixed inset-y-0 left-0 z-50"))
  [bool]($al.Contains("flex-shrink-0"))
  [bool](-not ($lc.Contains("margin-left: 288px") -or $lc.Contains("margin-left: 280px")))
  [bool]($pd.Contains("margin-left: 288px"))
  [bool]($pd.Contains("sidebar-collapsed #layoutShell"))
)

$names = @(
  "CSS flex !important"
  "CSS flex-shrink-0"
  "CSS position sticky"
  "CSS margin-left 0"
  "CSS mobile translateX"
  "CSS width 80px collapsed"
  "directora no fixed Tailwind"
  "maestra no fixed Tailwind"
  "asistente flex-shrink-0"
  "layout no bad margin"
  "panel-padre 288px"
  "panel-padre collapsed"
)

$p = 0; $f = 0
for ($i = 0; $i -lt $results.Count; $i++) {
  if ($results[$i]) { $p++; Write-Output "OK   $($names[$i])" }
  else              { $f++; Write-Output "FAIL $($names[$i])" }
}
Write-Output ""
Write-Output "$p passed, $f failed"
