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

    tauri_build::build();
}
