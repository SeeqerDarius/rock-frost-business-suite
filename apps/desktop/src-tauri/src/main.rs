// Prevents an additional console window from appearing on Windows in
// release builds. See https://v2.tauri.app/reference/config/#withglobaltauri
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rock_frost_desktop_lib::run();
}
