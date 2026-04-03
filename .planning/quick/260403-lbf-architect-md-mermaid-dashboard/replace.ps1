param(
    [string]$FilePath,
    [string]$ReplacePath
)

$content = [System.IO.File]::ReadAllText($FilePath, [System.Text.UTF8Encoding]::new($false))
$replaceText = [System.IO.File]::ReadAllText($ReplacePath, [System.Text.UTF8Encoding]::new($false))

$startMarker = "### 3. 凭证流转闭环 (Mermaid)"
$startIdx = $content.IndexOf($startMarker)
Write-Host "Start at: $startIdx"

if ($startIdx -ge 0) {
    $searchFrom = $startIdx + $startMarker.Length
    $codeFenceCount = 0
    $endIdx = -1
    for ($i = $searchFrom; $i -lt $content.Length - 2; $i++) {
        if ($content.Substring($i, 3) -eq "```") {
            $codeFenceCount++
            if ($codeFenceCount -eq 2) {
                $endIdx = $i + 3
                break
            }
        }
    }
    Write-Host "End at: $endIdx"

    if ($endIdx -gt $startIdx) {
        $before = $content.Substring(0, $startIdx)
        $after = $content.Substring($endIdx)
        $finalContent = $before + $replaceText + $after

        [System.IO.File]::WriteAllText($FilePath, $finalContent, [System.Text.UTF8Encoding]::new($false))
        Write-Host "SUCCESS"
        Write-Host "New size: $((Get-Item $FilePath).Length)"
    } else {
        Write-Host "FAILED: no end"
    }
} else {
    Write-Host "FAILED: no start"
}
