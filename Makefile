.PHONY: help dev clean-dev build run build-mas pkg run-mas check check-mas check-ts check-all release
.DEFAULT_GOAL := help

help:
	@echo "Usage: make <command>"
	@echo ""
	@echo "Development:"
	@echo "  dev          Dev with hot reload"
	@echo "  clean-dev    Reset state + dev"
	@echo "  build        Production build (direct)"
	@echo "  run          Build + run (resets permissions)"
	@echo ""
	@echo "Mac App Store:"
	@echo "  build-mas    MAS build (aarch64)"
	@echo "  pkg          Build + sign + package for App Store"
	@echo "  run-mas      Build + run MAS variant"
	@echo ""
	@echo "Checks:"
	@echo "  check        Rust check (direct)"
	@echo "  check-mas    Rust check (MAS)"
	@echo "  check-ts     TypeScript check"
	@echo "  check-all    All checks"
	@echo ""
	@echo "Release:"
	@echo "  release x.y.z   Bump version, amend commit, force push, tag"

dev:
	pnpm tauri dev

clean-dev:
	-pkill -f AudioShift
	-tccutil reset Microphone io.audioshift.app
	-tccutil reset Accessibility io.audioshift.app
	-rm -f "$(HOME)/Library/Application Support/io.audioshift.app/settings.json"
	-rm -f "$(HOME)/Library/Application Support/io.audioshift.app/history.json"
	-rm -rf "$(HOME)/Documents/AudioShift"
	pnpm tauri dev

build:
	pnpm tauri build

run: build
	-tccutil reset Microphone
	-tccutil reset Accessibility
	-rm -f "$(HOME)/Library/Application Support/io.audioshift.app/settings.json"
	-rm -f "$(HOME)/Library/Application Support/io.audioshift.app/history.json"
	-rm -rf "$(HOME)/Documents/AudioShift"
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
	cargo check --manifest-path src-tauri/Cargo.toml

check-mas:
	cargo check --manifest-path src-tauri/Cargo.toml --no-default-features --features mas

check-ts:
	npx tsc --noEmit

check-all: check-mas check check-ts

# Release: make release 1.0.3 (bumps version, amends last commit, force pushes, tags)
release:
	$(eval V := $(filter-out $@,$(MAKECMDGOALS)))
	@if [ -z "$(V)" ]; then echo "Usage: make release x.y.z"; exit 1; fi
	sed -i '' 's/"version": "[^"]*"/"version": "$(V)"/' package.json
	sed -i '' 's/"version": "[^"]*"/"version": "$(V)"/' src-tauri/tauri.conf.json
	sed -i '' 's/^version = "[^"]*"/version = "$(V)"/' src-tauri/Cargo.toml
	cargo update --manifest-path src-tauri/Cargo.toml --workspace
	sed -i '' 's/AudioShift v[0-9][0-9.]*/AudioShift v$(V)/' src/components/Settings.tsx
	sed -i '' 's/v[0-9][0-9.]*/v$(V)/' src/components/settings/AboutPage.tsx
	git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock src/components/Settings.tsx src/components/settings/AboutPage.tsx
	git commit -m "v$(V)"
	git push
	git tag v$(V)
	git push origin v$(V)
	@echo "Released v$(V) — workflow triggered"

%:
	@:
