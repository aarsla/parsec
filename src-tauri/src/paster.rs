use anyhow::Result;

/// Write text to clipboard and simulate paste keystroke.
pub fn paste_text(text: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        paste_macos(text)?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Fallback: just copy to clipboard
        copy_to_clipboard(text)?;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn paste_macos(text: &str) -> Result<()> {
    use std::process::Command;

    // Copy to clipboard via pbcopy
    let mut child = Command::new("pbcopy")
        .stdin(std::process::Stdio::piped())
        .spawn()?;

    if let Some(ref mut stdin) = child.stdin {
        use std::io::Write;
        stdin.write_all(text.as_bytes())?;
    }
    child.wait()?;

    // Simulate Cmd+V via osascript
    Command::new("osascript")
        .args([
            "-e",
            "tell application \"System Events\" to keystroke \"v\" using command down",
        ])
        .output()?;

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn copy_to_clipboard(text: &str) -> Result<()> {
    // TODO: implement for Windows/Linux
    eprintln!("Clipboard: {}", text);
    Ok(())
}
