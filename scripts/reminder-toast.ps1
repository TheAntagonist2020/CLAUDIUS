# CLAUDIUS Movie Reminder - Windows Toast Notification
# This script fetches today's pick from the CLAUDIUS API and shows a Windows notification

$apiUrl = "http://localhost:3001/api/reminder/daily"
$claudiusUrl = "http://localhost:5173/tonight"

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Get -TimeoutSec 5

    if ($response -and $response.title) {
        $title = $response.title
        $year = $response.year
        $genres = $response.genres
        $rationale = $response.rationale
        $runtime = $response.runtime
        $pickType = if ($response.pick_type -eq "rewatch") { "Revisit" } else { "Discover" }

        $headerText = "CLAUDIUS - Tonight's $pickType"
        $bodyText = "$title ($year)"
        if ($runtime) { $bodyText += " - ${runtime}min" }
        if ($rationale) { $bodyText += "`n$rationale" }

        # Use Windows Toast Notification via .NET
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

        $template = @"
<toast activationType="protocol" launch="$claudiusUrl">
    <visual>
        <binding template="ToastGeneric">
            <text>$headerText</text>
            <text>$bodyText</text>
        </binding>
    </visual>
    <actions>
        <action content="Open CLAUDIUS" activationType="protocol" arguments="$claudiusUrl" />
        <action content="Dismiss" activationType="system" arguments="dismiss" />
    </actions>
    <audio src="ms-winsoundevent:Notification.Default" />
</toast>
"@

        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($template)

        $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
        $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
    }
}
catch {
    # If the server isn't running, try a simpler fallback notification
    Add-Type -AssemblyName System.Windows.Forms
    $notification = New-Object System.Windows.Forms.NotifyIcon
    $notification.Icon = [System.Drawing.SystemIcons]::Information
    $notification.BalloonTipTitle = "CLAUDIUS"
    $notification.BalloonTipText = "Time to watch a movie! Open CLAUDIUS to get tonight's pick."
    $notification.Visible = $true
    $notification.ShowBalloonTip(10000)
    Start-Sleep -Seconds 12
    $notification.Dispose()
}
