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
        use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
        use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

        const V_KEY: u16 = 0x09;

        let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)
            .map_err(|_| anyhow::anyhow!("Failed to create CGEventSource"))?;

        let key_down = CGEvent::new_keyboard_event(source.clone(), V_KEY, true)
            .map_err(|_| anyhow::anyhow!("Failed to create key down event"))?;
        key_down.set_flags(CGEventFlags::CGEventFlagCommand);
        key_down.post(CGEventTapLocation::HID);

        let key_up = CGEvent::new_keyboard_event(source, V_KEY, false)
            .map_err(|_| anyhow::anyhow!("Failed to create key up event"))?;
        key_up.set_flags(CGEventFlags::CGEventFlagCommand);
        key_up.post(CGEventTapLocation::HID);
    }

    Ok(())
}
