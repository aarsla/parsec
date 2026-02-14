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
        use arboard::Clipboard;
        let mut clipboard = Clipboard::new()
            .map_err(|e| anyhow::anyhow!("Failed to access clipboard: {}", e))?;
        clipboard
            .set_text(text)
            .map_err(|e| anyhow::anyhow!("Failed to copy to clipboard: {}", e))?;
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

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
            KEYEVENTF_KEYUP, VIRTUAL_KEY,
        };

        const VK_CONTROL: VIRTUAL_KEY = VIRTUAL_KEY(0x11);
        const VK_V: VIRTUAL_KEY = VIRTUAL_KEY(0x56);

        // Small delay to let clipboard propagate
        std::thread::sleep(std::time::Duration::from_millis(50));

        let mut inputs: [INPUT; 4] = unsafe { std::mem::zeroed() };

        // Ctrl down
        inputs[0].r#type = INPUT_KEYBOARD;
        inputs[0].Anonymous = INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VK_CONTROL,
                dwFlags: KEYBD_EVENT_FLAGS(0),
                ..Default::default()
            },
        };
        // V down
        inputs[1].r#type = INPUT_KEYBOARD;
        inputs[1].Anonymous = INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VK_V,
                dwFlags: KEYBD_EVENT_FLAGS(0),
                ..Default::default()
            },
        };
        // V up
        inputs[2].r#type = INPUT_KEYBOARD;
        inputs[2].Anonymous = INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VK_V,
                dwFlags: KEYEVENTF_KEYUP,
                ..Default::default()
            },
        };
        // Ctrl up
        inputs[3].r#type = INPUT_KEYBOARD;
        inputs[3].Anonymous = INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VK_CONTROL,
                dwFlags: KEYEVENTF_KEYUP,
                ..Default::default()
            },
        };

        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent != 4 {
            return Err(anyhow::anyhow!("SendInput failed, only sent {} of 4 events", sent));
        }
    }

    Ok(())
}
