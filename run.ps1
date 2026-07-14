Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object Windows.Forms.Form
$form.Text = "Maybelle Wiki Host"
$form.Size = New-Object Drawing.Size(440, 500)
$form.StartPosition = "CenterScreen"
function Add-Label($text,$x,$y){$l=New-Object Windows.Forms.Label;$l.Text=$text;$l.Location=New-Object Drawing.Point($x,$y);$l.Size=New-Object Drawing.Size(145,22);$form.Controls.Add($l)}
function Add-Text($text,$x,$y){$b=New-Object Windows.Forms.TextBox;$b.Text=$text;$b.Location=New-Object Drawing.Point($x,$y);$b.Size=New-Object Drawing.Size(230,22);$form.Controls.Add($b);return $b}
Add-Label "Host/IP" 20 20; $hostBox=Add-Text "127.0.0.1" 165 20
Add-Label "Port" 20 55; $portBox=Add-Text "80" 165 55
Add-Label "Display name" 20 90; $nameBox=Add-Text "Maybelle Wiki Host" 165 90
Add-Label "Admin password" 20 125; $adminBox=Add-Text "" 165 125
Add-Label "Threads password" 20 160; $forumBox=Add-Text "" 165 160
Add-Label "Backup interval" 20 195; $backupBox=Add-Text "10" 165 195
Add-Label "Read/Pull pass" 20 230; $pullBox=Add-Text "" 165 230
Add-Label "Write/Push pass" 20 265; $pushBox=Add-Text "" 165 265
$disableCheck=New-Object Windows.Forms.CheckBox;$disableCheck.Text="Disable Threads";$disableCheck.Location=New-Object Drawing.Point(165,300);$disableCheck.Size=New-Object Drawing.Size(220,24);$form.Controls.Add($disableCheck)
$startButton=New-Object Windows.Forms.Button;$startButton.Text="Start Host";$startButton.Location=New-Object Drawing.Point(165,350);$startButton.Size=New-Object Drawing.Size(110,32);$form.Controls.Add($startButton)
$startButton.Add_Click({
    $argsList=@("`"$PSScriptRoot\host.py`"","--host",$hostBox.Text,"--port",$portBox.Text,"--name","`"$($nameBox.Text)`"","--backup-interval",$backupBox.Text)
    if($adminBox.Text.Trim() -ne ""){$argsList += @("--admin-pass","`"$($adminBox.Text)`"")}
    if($forumBox.Text.Trim() -ne ""){$argsList += @("--forum-password","`"$($forumBox.Text)`"")}
    if($pullBox.Text.Trim() -ne ""){$argsList += @("--pull-pass","`"$($pullBox.Text)`"")}
    if($pushBox.Text.Trim() -ne ""){$argsList += @("--push-pass","`"$($pushBox.Text)`"")}
    if($disableCheck.Checked){$argsList += "--disable-forum"}
    Start-Process powershell -ArgumentList "-NoExit","-Command","python $($argsList -join ' ')"
})
$form.ShowDialog()
