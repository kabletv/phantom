// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod io_thread;
mod ipc;
mod render_pump;
mod state;

use state::AppState;

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::terminal::create_terminal,
            commands::terminal::write_input,
            commands::terminal::resize_terminal,
            commands::terminal::close_terminal,
        ])
        // Devtools can be opened with right-click > Inspect Element in debug builds.
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
