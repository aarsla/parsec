// MAS: Login Item management via SMAppService (macOS 13+)
#[cfg(feature = "mas")]
extern "C" {
    fn login_item_status() -> i32;
    fn login_item_enable() -> i32;
    fn login_item_disable() -> i32;
}

#[cfg(feature = "mas")]
#[tauri::command]
pub fn mas_login_item_is_enabled() -> bool {
    unsafe { login_item_status() == 1 } // 1 = enabled
}

#[cfg(feature = "mas")]
#[tauri::command]
pub fn mas_login_item_enable() -> Result<(), String> {
    let ret = unsafe { login_item_enable() };
    if ret == 0 { Ok(()) } else { Err("Failed to enable login item".into()) }
}

#[cfg(feature = "mas")]
#[tauri::command]
pub fn mas_login_item_disable() -> Result<(), String> {
    let ret = unsafe { login_item_disable() };
    if ret == 0 { Ok(()) } else { Err("Failed to disable login item".into()) }
}

#[cfg(not(feature = "mas"))]
#[tauri::command]
pub fn mas_login_item_is_enabled() -> bool { false }

#[cfg(not(feature = "mas"))]
#[tauri::command]
pub fn mas_login_item_enable() -> Result<(), String> { Ok(()) }

#[cfg(not(feature = "mas"))]
#[tauri::command]
pub fn mas_login_item_disable() -> Result<(), String> { Ok(()) }
