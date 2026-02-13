fn main() {
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/screen_helper.m")
            .compile("screen_helper");
        cc::Build::new()
            .file("src/permissions_helper.m")
            .compile("permissions_helper");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=AVFoundation");
    }

    // Generate capabilities file based on active features.
    // Updater and autostart permissions are only available in direct builds.
    #[allow(unused_mut)]
    let mut permissions = vec![
        "core:default",
        "core:event:default",
        "core:window:default",
        "core:window:allow-create",
        "core:window:allow-close",
        "core:window:allow-show",
        "core:window:allow-hide",
        "core:window:allow-set-focus",
        "core:window:allow-set-position",
        "core:window:allow-cursor-position",
        "core:window:allow-available-monitors",
        "opener:default",
        "global-shortcut:allow-register",
        "global-shortcut:allow-unregister",
        "store:default",
        "process:allow-restart",
        "core:window:allow-set-size",
        "core:window:allow-outer-position",
        "core:window:allow-outer-size",
        "core:window:allow-scale-factor",
    ];

    #[cfg(not(feature = "mas"))]
    {
        permissions.push("autostart:allow-enable");
        permissions.push("autostart:allow-disable");
        permissions.push("autostart:allow-is-enabled");
    }

    #[cfg(feature = "updater")]
    {
        permissions.push("updater:default");
    }

    let perms_json: Vec<String> = permissions.iter().map(|p| format!("    \"{}\"", p)).collect();
    let cap = format!(
        r#"{{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main", "overlay", "settings", "onboarding"],
  "permissions": [
{}
  ]
}}"#,
        perms_json.join(",\n")
    );

    std::fs::write("capabilities/default.json", cap).expect("failed to write capabilities");

    tauri_build::build();
}
