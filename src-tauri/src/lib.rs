/// Starts the native shell around the existing web emulator.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Atari Forever");
}
