.PHONY: dev build build-mas check check-mas check-ts check-all

dev:
	pnpm tauri dev

build:
	pnpm tauri build

build-mas:
	pnpm tauri build \
		--no-default-features --features mas \
		--bundles app \
		--target aarch64-apple-darwin \
		--config src-tauri/tauri.mas.conf.json

check:
	cargo check --manifest-path src-tauri/Cargo.toml

check-mas:
	cargo check --manifest-path src-tauri/Cargo.toml --no-default-features --features mas

check-ts:
	npx tsc --noEmit

check-all: check check-mas check-ts
