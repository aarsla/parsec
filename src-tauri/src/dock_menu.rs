//! macOS dock right-click menu with a "Settings" item.
//!
//! Uses the public `applicationDockMenu:` delegate method by dynamically
//! adding it to Tauri's existing NSApplicationDelegate class.

use objc2::runtime::{AnyObject, Bool, Sel};
use objc2::{msg_send, sel, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSApplication, NSMenu, NSMenuItem};
use objc2_foundation::NSString;
use std::sync::OnceLock;
use tauri::AppHandle;

// Raw pointer wrappers that are Send+Sync (the objects live for the app lifetime)
struct SendPtr(*mut AnyObject);
unsafe impl Send for SendPtr {}
unsafe impl Sync for SendPtr {}

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static DOCK_MENU: OnceLock<SendPtr> = OnceLock::new();

extern "C" {
    fn class_addMethod(
        cls: *mut AnyObject,
        name: Sel,
        imp: *const core::ffi::c_void,
        types: *const core::ffi::c_char,
    ) -> Bool;
}

/// `applicationDockMenu:` implementation — returns the pre-built menu.
extern "C" fn application_dock_menu(
    _this: *mut AnyObject,
    _cmd: Sel,
    _app: *mut AnyObject,
) -> *mut AnyObject {
    DOCK_MENU
        .get()
        .map(|p| p.0)
        .unwrap_or(std::ptr::null_mut())
}

/// Action handler for the "Settings..." menu item.
extern "C" fn open_settings(_this: *mut AnyObject, _cmd: Sel, _sender: *mut AnyObject) {
    if let Some(handle) = APP_HANDLE.get() {
        let _ = crate::windows::create_settings_window(handle);
    }
}

pub fn setup_dock_menu(handle: &AppHandle) {
    let _ = APP_HANDLE.set(handle.clone());

    let mtm = MainThreadMarker::new().expect("dock menu must be set up on main thread");

    // Build the menu
    let menu = NSMenu::new(mtm);
    let title = NSString::from_str("Settings...");
    let key = NSString::new();
    let settings_item = unsafe {
        NSMenuItem::initWithTitle_action_keyEquivalent(
            NSMenuItem::alloc(mtm),
            &title,
            Some(sel!(dockOpenSettings:)),
            &key,
        )
    };
    menu.addItem(&settings_item);

    // Store as raw pointer (leaked, lives for app lifetime)
    let menu_ptr = objc2::rc::Retained::into_raw(menu) as *mut AnyObject;
    let _ = DOCK_MENU.set(SendPtr(menu_ptr));

    // Get Tauri's existing delegate and add our methods to its class
    let app = NSApplication::sharedApplication(mtm);
    let delegate: *mut AnyObject = unsafe { msg_send![&app, delegate] };
    if delegate.is_null() {
        eprintln!("[audioshift] No NSApplication delegate found, cannot set dock menu");
        return;
    }

    let delegate_class: *mut AnyObject = unsafe { msg_send![delegate, class] };
    if delegate_class.is_null() {
        return;
    }

    unsafe {
        // Add applicationDockMenu: → returns NSMenu*
        // ObjC type encoding: "@@:@" (returns object, self, _cmd, sender object)
        class_addMethod(
            delegate_class,
            sel!(applicationDockMenu:),
            application_dock_menu as *const core::ffi::c_void,
            c"@@:@".as_ptr(),
        );

        // Add dockOpenSettings: action handler
        // ObjC type encoding: "v@:@" (returns void, self, _cmd, sender object)
        class_addMethod(
            delegate_class,
            sel!(dockOpenSettings:),
            open_settings as *const core::ffi::c_void,
            c"v@:@".as_ptr(),
        );

        // Set the delegate as the target for the menu item so the action resolves
        let _: () = msg_send![&*settings_item, setTarget: delegate];
    }
}
