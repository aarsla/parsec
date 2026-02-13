use anyhow::Result;

/// Copy text to clipboard only.
pub fn copy_to_clipboard(text: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        extern "C" {
            fn copy_string_to_pasteboard(s: *const std::os::raw::c_char) -> bool;
        }
        let c_str = std::ffi::CString::new(text)?;
        let ok = unsafe { copy_string_to_pasteboard(c_str.as_ptr()) };
        if !ok {
            return Err(anyhow::anyhow!("Failed to copy to clipboard"));
        }
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

        // Small delay to let pasteboard IPC propagate
        std::thread::sleep(std::time::Duration::from_millis(50));

        const V_KEY: u16 = 0x09;

        let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
            .map_err(|_| anyhow::anyhow!("Failed to create CGEventSource"))?;

        let key_down = CGEvent::new_keyboard_event(source.clone(), V_KEY, true)
            .map_err(|_| anyhow::anyhow!("Failed to create key down event"))?;
        key_down.set_flags(CGEventFlags::CGEventFlagCommand);
        key_down.post(CGEventTapLocation::Session);

        let key_up = CGEvent::new_keyboard_event(source, V_KEY, false)
            .map_err(|_| anyhow::anyhow!("Failed to create key up event"))?;
        key_up.set_flags(CGEventFlags::CGEventFlagCommand);
        key_up.post(CGEventTapLocation::Session);
    }

    Ok(())
}
