# fix-encoding.ps1 — Corrige mojibake UTF-8 en archivos JS

function Fix-Mojibake {
    param([string]$filePath)

    $content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)

    $pairs = @(
        @('â€"', '–'),   # en dash
        @('â€™', "'"),   # right single quote
        @('â€˜', "'"),   # left single quote
        @('â€œ', '"'),   # left double quote
        @('â€', '"'),    # right double quote
        @('Â·', '·'),    # middle dot
        @('Ãƒ³', 'ó'), @('Ã³', 'ó'),
        @('Ãƒ©', 'é'), @('Ã©', 'é'),
        @('Ãƒ¡', 'á'), @('Ã¡', 'á'),
        @('Ãƒ ', 'à'), @('Ã ', 'à'),
        @('Ãƒº', 'ú'), @('Ãº', 'ú'),
        @('Ãƒ­', 'í'), @('Ã­', 'í'),
        @('Ãƒ±', 'ñ'), @('Ã±', 'ñ'),
        @('Ãƒ¼', 'ü'), @('Ã¼', 'ü'),
        @('Ã—', '×'),
        @('Â¡', '¡'),
        @('Â¿', '¿'),
        @('Â°', '°'),
        @('Âº', 'º'),
        @('Âª', 'ª'),
        @('âœ"', '✓'),
        @('ðŸ–ï¸', '🖐️'),
        @('ðŸ"‹', '📋'),
        @('ðŸž', '🍞'),
        @('ðŸ§¼', '🧼'),
        @('ðŸŽ¨', '🎨'),
        @('ðŸŒ³', '🌳'),
        @('ðŸŽ', '🍎'),
        @('ðŸ"¬', '🔬'),
        @('ðŸ½ï¸', '🍽️'),
        @('ðŸª¥', '🪥'),
        @('ðŸ˜´', '😴'),
        @('ðŸ˜Š', '😊'),
        @('ðŸŽ®', '🎮'),
        @('ðŸ'‹', '👋'),
        @('ðŸ'©', '💩'),
        @('ðŸ'§', '💧'),
        @('ðŸš½', '🚽'),
        @('ðŸ§»', '🧻'),
        @('ðŸŒ¡ï¸', '🌡️'),
        @('ðŸ'Š', '💊'),
        @('ðŸ¤•', '🤕'),
        @('ðŸ¤®', '🤮'),
        @('ðŸ˜·', '😷'),
        @('ðŸ¼', '🍼'),
        @('ðŸ"', '📝'),
        @('ðŸ¤'', '🤒'),
        @('ðŸ©¹', '🩹'),
        @('ðŸ"ž', '📞'),
        @('ðŸ"Œ', '📌'),
        @('ðŸ—"ï¸', '🗓️'),
        @('ðŸ§¸', '🧸'),
        @('ðŸ§·', '🧷'),
        @('ðŸ"š', '📚'),
        @('âœï¸', '✏️'),
        @('ðŸ"–', '📖'),
        @('ðŸŽ­', '🎭'),
        @('ðŸ˜', '😐'),
        @('ðŸ˜¢', '😢'),
        @('ðŸ˜­', '😭'),
        @('ðŸ˜¡', '😡'),
        @('ðŸ§Š', '🧊'),
        @('â™¨ï¸', '♨️'),
        @('ðŸ"¥', '🔥'),
        @('ðŸ™‚', '🙂'),
        @('ðŸŽ', '🎁'),
        @('ðŸ™', '🙁'),
        @('ðŸ"‡', '📇'),
        @('ðŸ"…', '📅'),
        @('ðŸ"„', '📄'),
        @('ðŸ"ˆ', '📈'),
        @('ðŸ"‰', '📉'),
        @('ðŸ""', '🔔'),
        @('ðŸ"•', '🔕'),
        @('ðŸ"'', '🔑'),
        @('ðŸ"'', '🔒'),
        @('ðŸ"�', '🔓'),
        @('ðŸ"Š', '🔊'),
        @('ðŸ"‡', '📇')
    )

    $fixed = $content
    foreach ($pair in $pairs) {
        $fixed = $fixed.Replace($pair[0], $pair[1])
    }

    # Guardar SIN BOM para evitar problemas
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($filePath, $fixed, $utf8NoBom)
    
    # Contar mojibake restante
    $remaining = ([regex]::Matches($fixed, 'Ã|â€|Â·|ð[Ÿ]')).Count
    Write-Host "  [$filePath] guardado. Mojibake restante aprox: $remaining"
}

$root = "c:\Users\digitacionlab\Documents\SISTEMA\sistema-de-estancia2-main"

Fix-Mojibake "$root\js\maestra\modules\weekly-schedule.js"
Fix-Mojibake "$root\js\maestra\modules\routine.js.bak"

Write-Host "Listo."
