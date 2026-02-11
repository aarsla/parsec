fn main() {
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/screen_helper.m")
            .compile("screen_helper");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
    }

    tauri_build::build();
}
