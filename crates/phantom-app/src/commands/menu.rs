//! Tauri commands for menu management.

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

use crate::state::AppState;

/// Rebuild the native menu bar (e.g., after preset CRUD).
#[tauri::command]
pub async fn rebuild_menu(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let handle = &app;

    let app_menu = SubmenuBuilder::new(handle, "Phantom")
        .about(None)
        .separator()
        .quit()
        .build()
        .map_err(|e| format!("menu error: {e}"))?;

    let new_terminal = MenuItemBuilder::with_id("new-terminal", "New Terminal")
        .accelerator("CmdOrCtrl+T")
        .build(handle)
        .map_err(|e| format!("menu error: {e}"))?;

    let close_tab = PredefinedMenuItem::close_window(handle, Some("Close Tab"))
        .map_err(|e| format!("menu error: {e}"))?;

    let mut file_menu = SubmenuBuilder::new(handle, "File")
        .item(&new_terminal);

    if let Ok(db) = state.db.lock() {
        if let Ok(presets) = phantom_db::presets::list_cli_presets(&db) {
            if !presets.is_empty() {
                let mut new_submenu = SubmenuBuilder::new(handle, "New");
                for preset in &presets {
                    let id = format!("preset:{}", preset.id);
                    let item = MenuItemBuilder::with_id(id, &preset.name)
                        .build(handle)
                        .map_err(|e| format!("menu error: {e}"))?;
                    new_submenu = new_submenu.item(&item);
                }
                let new_sub = new_submenu.build()
                    .map_err(|e| format!("menu error: {e}"))?;
                file_menu = file_menu.item(&new_sub);
            }
        }
    }

    file_menu = file_menu
        .separator()
        .item(&close_tab);

    let file_built = file_menu.build()
        .map_err(|e| format!("menu error: {e}"))?;

    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()
        .map_err(|e| format!("menu error: {e}"))?;

    let window_menu = SubmenuBuilder::new(handle, "Window")
        .minimize()
        .build()
        .map_err(|e| format!("menu error: {e}"))?;

    let menu = MenuBuilder::new(handle)
        .item(&app_menu)
        .item(&file_built)
        .item(&edit_menu)
        .item(&window_menu)
        .build()
        .map_err(|e| format!("menu error: {e}"))?;

    app.set_menu(menu).map_err(|e| format!("menu error: {e}"))?;

    Ok(())
}
