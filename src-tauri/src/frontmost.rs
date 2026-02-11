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

#[cfg(target_os = "macos")]
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
