/// Returns (app_name, window_title) of the frontmost application.
pub fn get_frontmost_app() -> (Option<String>, Option<String>) {
    #[cfg(target_os = "macos")]
    {
        get_frontmost_macos()
    }

    #[cfg(not(target_os = "macos"))]
    {
        (None, None)
    }
}

/// MAS builds use NSWorkspace (no AppleScript/sandbox issues).
/// Direct builds keep the AppleScript approach which also captures window title.
#[cfg(all(target_os = "macos", feature = "mas"))]
fn get_frontmost_macos() -> (Option<String>, Option<String>) {
    use objc2_foundation::NSString;

    unsafe {
        let workspace: *mut objc2::runtime::AnyObject =
            objc2::msg_send![objc2::class!(NSWorkspace), sharedWorkspace];
        if workspace.is_null() {
            return (None, None);
        }
        let front_app: *mut objc2::runtime::AnyObject =
            objc2::msg_send![workspace, frontmostApplication];
        if front_app.is_null() {
            return (None, None);
        }
        let name_ns: *mut NSString = objc2::msg_send![front_app, localizedName];
        if name_ns.is_null() {
            return (None, None);
        }
        let name = (*name_ns).to_string();
        let app_name = if name.is_empty() { None } else { Some(name) };
        // NSWorkspace doesn't expose window titles; return None
        (app_name, None)
    }
}

#[cfg(all(target_os = "macos", not(feature = "mas")))]
fn get_frontmost_macos() -> (Option<String>, Option<String>) {
    use std::process::Command;

    let script = r#"
        tell application "System Events"
            set frontApp to first application process whose frontmost is true
            set appName to name of frontApp
            try
                set winTitle to name of front window of frontApp
            on error
                set winTitle to ""
            end try
            return appName & "|||" & winTitle
        end tell
    "#;

    let output = Command::new("osascript")
        .args(["-e", script])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let raw = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let parts: Vec<&str> = raw.splitn(2, "|||").collect();
            let app_name = parts.first().map(|s| s.to_string()).filter(|s| !s.is_empty());
            let window_title = parts.get(1).map(|s| s.to_string()).filter(|s| !s.is_empty());
            (app_name, window_title)
        }
        _ => (None, None),
    }
}
