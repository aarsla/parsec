.PHONY: dev build run build-mas run-mas check check-mas check-ts check-all

dev:
	pnpm tauri dev

build:
	pnpm tauri build

run: build
	-tccutil reset Microphone
	-tccutil reset Accessibility
	-rm -f "$(HOME)/Library/Application Support/com.aarsla.audioshift/settings.json"
	open src-tauri/target/release/bundle/macos/AudioShift.app

build-mas:
	pnpm tauri build \
		-b app \
		-t aarch64-apple-darwin \
		-c src-tauri/tauri.mas.conf.json \
		-- --no-default-features --features mas

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
