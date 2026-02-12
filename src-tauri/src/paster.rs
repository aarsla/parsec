use anyhow::Result;

/// Copy text to clipboard only.
pub fn copy_to_clipboard(text: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let mut child = Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()?;
        if let Some(ref mut stdin) = child.stdin {
            use std::io::Write;
            stdin.write_all(text.as_bytes())?;
        }
        child.wait()?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        // TODO: implement for Windows/Linux
        eprintln!("Clipboard: {}", text);
    }

    Ok(())
}

/// Copy text to clipboard and simulate paste keystroke.
pub fn paste_text(text: &str) -> Result<()> {
    copy_to_clipboard(text)?;

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("osascript")
            .args([
                "-e",
                "tell application \"System Events\" to keystroke \"v\" using command down",
            ])
            .output()?;
    }

    Ok(())
}
