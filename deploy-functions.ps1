#Requires -Version 5.1
<#
    Despliega las Edge Functions que importan supabase/functions/_shared/cors.ts.

    Por qué: el fix de CORS (permitir cualquier puerto loopback y devolver headers
    CORS también en el 403) vive en _shared/cors.ts, que se COMPILA dentro de cada
    función. Cambiar ese archivo no afecta a nada hasta redesplegar, por eso van 14.
    La única que se salta es 'custom-recovery' (no importa cors.ts).

    Uso:  .\deploy-functions.ps1
    Requisito:  supabase login  (una vez)

    Para desplegar solo una:
      supabase functions deploy send-email --project-ref yswizaskeftxpcphixiy
#>

$ErrorActionPreference = 'Stop'

$projectRef = 'yswizaskeftxpcphixiy'

# Las que NO se despliegan: 'custom-recovery' (no tiene index.ts / no usa cors.ts)
$functions = @(
    'send-email'                # <- la que fallaba: credenciales de preinscripción
    'prereg-notify'             # <- acuse de recibo de preinscripción (pública)
    'create-student-with-parent'
    'generate-invoice'
    'generate-payroll-invoice'
    'auto-payment-cycle'
    'payment-reminders'
    'process-event'
    'send-push'
    'resize-image'
    'get-posts'
    'backup-to-sheets'
    'admin-reset-password'
    'run-migration'
)

Write-Host "Proyecto: $projectRef" -ForegroundColor Cyan
Write-Host "Funciones a desplegar: $($functions.Count)`n" -ForegroundColor Cyan

$fail = @()

foreach ($fn in $functions) {
    Write-Host "==> $fn" -ForegroundColor Yellow
    & supabase functions deploy $fn --project-ref $projectRef
    if ($LASTEXITCODE -ne 0) {
        $fail += $fn
        Write-Host "   FALLO: $fn" -ForegroundColor Red
    } else {
        Write-Host "   OK: $fn" -ForegroundColor Green
    }
}

Write-Host ''
if ($fail.Count -eq 0) {
    Write-Host 'Despliegue completo. Reinicia Live Server y prueba de nuevo el envio.' -ForegroundColor Green
} else {
    Write-Host "Fallaron: $($fail -join ', ')" -ForegroundColor Red
}
