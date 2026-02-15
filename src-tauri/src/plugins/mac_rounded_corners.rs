
use tauri::{AppHandle, Runtime, WebviewWindow};

#[cfg(target_os = "macos")]
use objc2::runtime::AnyObject;
#[cfg(target_os = "macos")]
use objc2::encode::{Encode, Encoding, RefEncode};

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Copy, Clone)]
struct NSPoint { x: f64, y: f64 }

#[cfg(target_os = "macos")]
unsafe impl Encode for NSPoint {
    const ENCODING: Encoding = Encoding::Struct("CGPoint", &[Encoding::Double, Encoding::Double]);
}
#[cfg(target_os = "macos")]
unsafe impl RefEncode for NSPoint {
    const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Copy, Clone)]
struct NSSize { width: f64, height: f64 }

#[cfg(target_os = "macos")]
unsafe impl Encode for NSSize {
    const ENCODING: Encoding = Encoding::Struct("CGSize", &[Encoding::Double, Encoding::Double]);
}
#[cfg(target_os = "macos")]
unsafe impl RefEncode for NSSize {
    const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Copy, Clone)]
struct NSRect { origin: NSPoint, size: NSSize }

#[cfg(target_os = "macos")]
unsafe impl Encode for NSRect {
    const ENCODING: Encoding = Encoding::Struct("CGRect", &[NSPoint::ENCODING, NSSize::ENCODING]);
}
#[cfg(target_os = "macos")]
unsafe impl RefEncode for NSRect {
    const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

/// Configuration for Traffic Lights positioning
#[allow(dead_code)]
pub struct TrafficLightsConfig {
    /// Offset in pixels from default position (positive = right, negative = left)
    pub offset_x: f64,
    /// Offset in pixels from default position (positive = down, negative = up)
    pub offset_y: f64,
}

impl Default for TrafficLightsConfig {
    fn default() -> Self {
        Self {
            offset_x: 0.0,
            offset_y: 0.0,
        }
    }
}

/// Enables rounded corners for the window (macOS only)
/// Uses only public APIs - App Store compatible
#[tauri::command]
pub fn enable_rounded_corners<R: Runtime>(
    _app: AppHandle<R>,
    _window: WebviewWindow<R>,
    _offset_x: Option<f64>,
    _offset_y: Option<f64>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let config = TrafficLightsConfig {
            offset_x: _offset_x.unwrap_or(0.0),
            offset_y: _offset_y.unwrap_or(0.0),
        };

        _window
            .with_webview(move |webview| {
                #[cfg(target_os = "macos")]
                unsafe {
                    let ns_window: *mut AnyObject = webview.ns_window().cast();

                    let style_mask: u64 = objc2::msg_send![ns_window, styleMask];
                    // NSFullSizeContentViewWindowMask | NSTitledWindowMask | NSClosable | NSMiniaturizable | NSResizable
                    let new_mask = style_mask | (1 << 15) | (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);
                    let _: () = objc2::msg_send![ns_window, setStyleMask: new_mask];
                    let _: () = objc2::msg_send![ns_window, setTitlebarAppearsTransparent: true];

                    let content_view: *mut AnyObject = objc2::msg_send![ns_window, contentView];
                    let _: () = objc2::msg_send![content_view, setWantsLayer: true];

                    position_traffic_lights(ns_window, config.offset_x, config.offset_y);
                }
            })
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

/// Enables modern window style with rounded corners and shadow
#[tauri::command]
pub fn enable_modern_window_style<R: Runtime>(
    _app: AppHandle<R>,
    _window: WebviewWindow<R>,
    _corner_radius: Option<f64>,
    _offset_x: Option<f64>,
    _offset_y: Option<f64>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let config = TrafficLightsConfig {
            offset_x: _offset_x.unwrap_or(0.0),
            offset_y: _offset_y.unwrap_or(0.0),
        };
        let radius = _corner_radius.unwrap_or(12.0);

        _window
            .with_webview(move |webview| {
                #[cfg(target_os = "macos")]
                unsafe {
                    let ns_window: *mut AnyObject = webview.ns_window().cast();

                    let style_mask: u64 = objc2::msg_send![ns_window, styleMask];
                    let new_mask = style_mask | (1 << 15) | (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);
                    let _: () = objc2::msg_send![ns_window, setStyleMask: new_mask];
                    let _: () = objc2::msg_send![ns_window, setTitlebarAppearsTransparent: true];
                    // NSWindowTitleHidden = 1
                    let _: () = objc2::msg_send![ns_window, setTitleVisibility: 1_i64];
                    let _: () = objc2::msg_send![ns_window, setHasShadow: true];
                    let _: () = objc2::msg_send![ns_window, setOpaque: false];

                    let content_view: *mut AnyObject = objc2::msg_send![ns_window, contentView];
                    let _: () = objc2::msg_send![content_view, setWantsLayer: true];

                    let layer: *mut AnyObject = objc2::msg_send![content_view, layer];
                    if !layer.is_null() {
                        let _: () = objc2::msg_send![layer, setCornerRadius: radius];
                        let _: () = objc2::msg_send![layer, setMasksToBounds: true];
                    }

                    position_traffic_lights(ns_window, config.offset_x, config.offset_y);
                }
            })
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

/// Repositions Traffic Lights only (useful after fullscreen toggle)
#[tauri::command]
pub fn reposition_traffic_lights<R: Runtime>(
    _app: AppHandle<R>,
    _window: WebviewWindow<R>,
    _offset_x: Option<f64>,
    _offset_y: Option<f64>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let config = TrafficLightsConfig {
            offset_x: _offset_x.unwrap_or(0.0),
            offset_y: _offset_y.unwrap_or(0.0),
        };

        _window
            .with_webview(move |webview| {
                #[cfg(target_os = "macos")]
                unsafe {
                    let ns_window: *mut AnyObject = webview.ns_window().cast();
                    position_traffic_lights(ns_window, config.offset_x, config.offset_y);
                }
            })
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

#[cfg(target_os = "macos")]
unsafe fn position_traffic_lights(ns_window: *mut AnyObject, offset_x: f64, offset_y: f64) {
    let default_x = 20.0;
    let default_y = 0.0;

    let close_button: *mut AnyObject = objc2::msg_send![ns_window, standardWindowButton: 0_i64];
    let miniaturize_button: *mut AnyObject = objc2::msg_send![ns_window, standardWindowButton: 1_i64];
    let zoom_button: *mut AnyObject = objc2::msg_send![ns_window, standardWindowButton: 2_i64];

    let new_x = default_x + offset_x;
    let new_y = default_y - offset_y;

    if !close_button.is_null() {
        let frame: NSRect = objc2::msg_send![close_button, frame];
        let new_frame = NSRect {
            origin: NSPoint { x: new_x, y: new_y },
            size: frame.size,
        };
        let _: () = objc2::msg_send![close_button, setFrame: new_frame];
    }

    if !miniaturize_button.is_null() {
        let frame: NSRect = objc2::msg_send![miniaturize_button, frame];
        let new_frame = NSRect {
            origin: NSPoint { x: new_x + 20.0, y: new_y },
            size: frame.size,
        };
        let _: () = objc2::msg_send![miniaturize_button, setFrame: new_frame];
    }

    if !zoom_button.is_null() {
        let frame: NSRect = objc2::msg_send![zoom_button, frame];
        let new_frame = NSRect {
            origin: NSPoint { x: new_x + 40.0, y: new_y },
            size: frame.size,
        };
        let _: () = objc2::msg_send![zoom_button, setFrame: new_frame];
    }
}
