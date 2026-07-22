git pull origin main
npm run build
npm run cap:ios
npm run cap:android
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
npm run preview