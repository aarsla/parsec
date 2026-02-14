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

    // macOS (non-MAS): true per-pixel transparency
    #[cfg(all(not(feature = "mas"), not(target_os = "windows")))]
    let builder = builder.transparent(true).background_color(Color(0, 0, 0, 0));

    // Windows: opaque background (WebView2 transparent bg unreliable)
    // CSS will override with var(--background) to match theme; this prevents flash
    #[cfg(all(not(feature = "mas"), target_os = "windows"))]
    let builder = builder.background_color(Color(32, 32, 32, 255));

    let win = builder.build()?;

    // MAS: apply CALayer corner radius + clear window bg (all public APIs)
    // WKWebView still draws opaque content, but the CALayer mask clips it to rounded rect,
    // and the clear window background lets the desktop show through the clipped corners.
    #[cfg(feature = "mas")]
    {
        let _ = win.with_webview(|webview| {
            #[cfg(target_os = "macos")]
            unsafe {
                use cocoa::appkit::{NSWindow, NSView};
                use cocoa::base::id;
                use objc::{class, msg_send, sel, sel_impl};
                let ns_window = webview.ns_window() as id;
                let clear: id = msg_send![class!(NSColor), clearColor];
                ns_window.setBackgroundColor_(clear);
                ns_window.setOpaque_(cocoa::base::NO);
                ns_window.setHasShadow_(cocoa::base::YES);
                let content_view = ns_window.contentView();
                content_view.setWantsLayer(cocoa::base::YES);
                let layer: id = msg_send![content_view, layer];
                if !layer.is_null() {
                    let _: () = msg_send![layer, setCornerRadius: 20.0_f64];
                    let _: () = msg_send![layer, setMasksToBounds: cocoa::base::YES];
                }
            }
        });
    }

    #[cfg(not(feature = "mas"))]
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
