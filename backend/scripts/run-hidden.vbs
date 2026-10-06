Set shell = CreateObject("WScript.Shell")

If WScript.Arguments.Count = 0 Then
  WScript.Quit 1
End If

cmd = ""
For i = 0 To WScript.Arguments.Count - 1
  arg = WScript.Arguments(i)
  If i > 0 Then
    cmd = cmd & " "
  End If
  cmd = cmd & """" & Replace(arg, """", """""") & """"
Next

shell.Run cmd, 0, False
WScript.Quit 0
