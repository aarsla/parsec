.PHONY: dev build build-mas check check-mas check-ts check-all

dev:
	pnpm tauri dev

build:
	pnpm tauri build

build-mas:
	pnpm tauri build \
		-b app \
		-t aarch64-apple-darwin \
		-c src-tauri/tauri.mas.conf.json \
		-- --no-default-features --features mas

check:
	TAURI_CONFIG='{"app":{"macOSPrivateApi":true}}' cargo check --manifest-path src-tauri/Cargo.toml

check-mas:
	TAURI_CONFIG='{"app":{"macOSPrivateApi":true},"plugins":{}}' cargo check --manifest-path src-tauri/Cargo.toml --no-default-features --features mas

check-ts:
	npx tsc --noEmit

check-all: check check-mas check-ts
