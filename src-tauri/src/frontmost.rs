/// Returns (app_name, window_title) of the frontmost application.
pub fn get_frontmost_app() -> (Option<String>, Option<String>) {
    #[cfg(target_os = "macos")]
    {
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
            (app_name, None)
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        (None, None)
    }
}
