import { exec } from "child_process";
import { platform } from "os";

export function playSound(text?: string): void {
  const os = platform();

  if (os === "win32") {
    try {
      const command = text
        ? `powershell -c "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${text}')"`
        : `powershell -c "(New-Object System.Media.SoundPlayer).PlaySync('C:\\Windows\\Media\\notify.wav')"`;

      exec(command, (error) => {
        if (error) {
          console.error("Error playing sound:", error);
        }
      });
    } catch (error) {
      console.error("Error executing sound command:", error);
    }
  } else if (os === "darwin") {
    try {
      const command = text
        ? `say "${text}"`
        : `afplay /System/Library/Sounds/Glass.aiff`;

      exec(command, (error) => {
        if (error) {
          console.error("Error playing sound:", error);
        }
      });
    } catch (error) {
      console.error("Error executing sound command:", error);
    }
  } else {
    console.log("Sound notifications are only supported on Windows and macOS");
  }
}
