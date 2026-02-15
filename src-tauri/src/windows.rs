use tauri::{utils::config::Color, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

pub fn create_overlay_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    let existing = app.get_webview_window("overlay");
    if existing.is_some() {
        return Ok(());
    }

    let builder = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("/overlay".into()))
        .title("AudioShift Recording")
        .inner_size(320.0, 96.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .visible(false)
        .focused(false)
        .skip_taskbar(true);

    // Windows: transparent + no shadow (shadow creates rectangular frame around rounded corners)
    #[cfg(target_os = "windows")]
    let builder = builder.transparent(true).shadow(false);

    let win = builder.build()?;

    // Windows 11+: round corners at OS compositor level via DWM.
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE};

        let hwnd = HWND(win.hwnd().unwrap().0);
        let preference: u32 = 2; // DWMWCP_ROUND
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &preference as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }

    // macOS: transparent borderless window with rounded corners (all public APIs).
    // Based on the standard AppKit approach:
    // 1. Borderless window (decorations: false) + isOpaque=NO + backgroundColor=clear
    // 2. Content view layer: backgroundColor=clear CGColor + cornerRadius + masksToBounds
    // 3. WKWebView: isOpaque=NO + underPageBackgroundColor=clear
    // CSS provides the visual background; CALayer mask clips to rounded corners.
    #[cfg(target_os = "macos")]
    {
        use objc2::runtime::AnyObject;

        let _ = win.with_webview(|webview| {
            unsafe {
                let ns_window: *mut AnyObject = webview.ns_window().cast();
                let clear: *mut AnyObject = objc2::msg_send![objc2::class!(NSColor), clearColor];

                // Step 1: transparent borderless window
                let _: () = objc2::msg_send![ns_window, setOpaque: false];
                let _: () = objc2::msg_send![ns_window, setBackgroundColor: clear];
                let _: () = objc2::msg_send![ns_window, setHasShadow: true];

                // Step 2: content view layer — clear background + rounded mask
                let content_view: *mut AnyObject = objc2::msg_send![ns_window, contentView];
                let _: () = objc2::msg_send![content_view, setWantsLayer: true];
                let layer: *mut AnyObject = objc2::msg_send![content_view, layer];
                if !layer.is_null() {
                    let clear_cg: *mut AnyObject = objc2::msg_send![clear, CGColor];
                    let _: () = objc2::msg_send![layer, setBackgroundColor: clear_cg];
                    let _: () = objc2::msg_send![layer, setCornerRadius: 22.0_f64];
                    let _: () = objc2::msg_send![layer, setMasksToBounds: true];
                }

                // Step 3: WKWebView transparency
                let wk_webview: *mut AnyObject = webview.inner().cast();
                let _: () = objc2::msg_send![wk_webview, setOpaque: false];
                let _: () = objc2::msg_send![wk_webview, setUnderPageBackgroundColor: clear];
            }
        });
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = win;

    Ok(())
}

pub fn create_settings_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("/settings".into()))
        .title("AudioShift")
        .min_inner_size(800.0, 720.0)
        .resizable(true)
        .background_color(Color(32, 32, 32, 255));

    // Restore saved geometry or center with defaults
    let store = app.store("settings.json").ok();
    let geom = store.as_ref().and_then(|s| {
        let x = s.get("settingsGeometry")?;
        let obj = x.as_object()?;
        Some((
            obj.get("x")?.as_f64()?,
            obj.get("y")?.as_f64()?,
            obj.get("w")?.as_f64()?,
            obj.get("h")?.as_f64()?,
        ))
    });

    if let Some((x, y, w, h)) = geom {
        builder = builder
            .inner_size(w, h)
            .position(x, y);
    } else {
        builder = builder
            .inner_size(800.0, 720.0)
            .center();
    }

    builder.build()?;
    Ok(())
}

pub fn create_onboarding_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("onboarding") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(app, "onboarding", WebviewUrl::App("/onboarding".into()))
        .title("AudioShift Setup")
        .inner_size(520.0, 480.0)
        .resizable(false)
        .center()
        .visible(true)
        .focused(true)
        .background_color(Color(32, 32, 32, 255))
        .build()?;

    // Ensure the window is visible and focused (tray-only apps may not auto-activate)
    let _ = win.show();
    let _ = win.set_focus();

    Ok(())
}
