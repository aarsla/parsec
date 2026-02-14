.PHONY: dev clean-dev build run build-mas pkg run-mas check check-mas check-ts check-all

dev:
	pnpm tauri dev

clean-dev:
	-pkill -f AudioShift
	-tccutil reset Microphone com.aarsla.audioshift
	-tccutil reset Accessibility com.aarsla.audioshift
	-rm -f "$(HOME)/Library/Application Support/com.aarsla.audioshift/settings.json"
	pnpm tauri dev

build:
	pnpm tauri build

run: build
	-tccutil reset Microphone
	-tccutil reset Accessibility
	-rm -f "$(HOME)/Library/Application Support/com.aarsla.audioshift/settings.json"
	open src-tauri/target/release/bundle/macos/AudioShift.app

MAS_APP = src-tauri/target/aarch64-apple-darwin/release/bundle/macos/AudioShift.app

build-mas:
	pnpm tauri build \
		-b app \
		-t aarch64-apple-darwin \
		-c src-tauri/tauri.mas.conf.json \
		-- --no-default-features --features mas
	@# Compile asset catalog and inject into app bundle for App Store icon
	actool src-tauri/Assets.xcassets \
		--compile $(MAS_APP)/Contents/Resources \
		--platform macosx \
		--minimum-deployment-target 12.0 \
		--app-icon AppIcon \
		--output-partial-info-plist /dev/null

SIGN_APP = Apple Distribution: "OPTIMIZE" d.o.o. Sarajevo (47D5MB9TH5)
SIGN_PKG = 3rd Party Mac Developer Installer: "OPTIMIZE" d.o.o. Sarajevo (47D5MB9TH5)

pkg: build-mas
	@# Set CFBundleIconName so App Store uses the asset catalog icon
	/usr/libexec/PlistBuddy -c "Add :CFBundleIconName string AppIcon" $(MAS_APP)/Contents/Info.plist 2>/dev/null || \
		/usr/libexec/PlistBuddy -c "Set :CFBundleIconName AppIcon" $(MAS_APP)/Contents/Info.plist
	@# Strip quarantine attributes (from browser-downloaded files like provisioning profile)
	xattr -cr $(MAS_APP)
	@# Re-sign with Apple Distribution cert + entitlements (includes app-identifier)
	codesign --deep --force --sign '$(SIGN_APP)' \
		--entitlements src-tauri/Entitlements.mas.plist $(MAS_APP)
	@# Create signed installer pkg
	productbuild --component $(MAS_APP) /Applications \
		--sign '$(SIGN_PKG)' AudioShift.pkg

run-mas: build-mas
	-tccutil reset Microphone
	-tccutil reset Accessibility
	-rm -f "$(HOME)/Library/Application Support/io.audioshift.app/settings.json"
	open src-tauri/target/aarch64-apple-darwin/release/bundle/macos/AudioShift.app

check:
	TAURI_CONFIG='{"app":{"macOSPrivateApi":true}}' cargo check --manifest-path src-tauri/Cargo.toml

check-mas:
	TAURI_CONFIG='{"app":{"macOSPrivateApi":true},"plugins":{}}' cargo check --manifest-path src-tauri/Cargo.toml --no-default-features --features mas

check-ts:
	npx tsc --noEmit

check-all: check check-mas check-ts
