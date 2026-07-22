use tauri_plugin_dialog::DialogExt;

/// Trigger the native webview's print dialog. macOS WKWebView does not support
/// JS `window.print()`, so the frontend invokes this command instead.
#[tauri::command]
fn print_page(window: tauri::WebviewWindow) -> Result<(), String> {
  window.print().map_err(|e| e.to_string())
}

/// Show a native "Save As" dialog and write the workbook bytes to the chosen
/// path. macOS/Windows/Linux web views have no `showSaveFilePicker`, so the
/// frontend invokes this instead. Returns the saved path, or `None` if the
/// dialog was cancelled.
#[tauri::command]
async fn save_workbook_as(
  app: tauri::AppHandle,
  default_name: String,
  bytes: Vec<u8>,
) -> Result<Option<String>, String> {
  let (tx, rx) = std::sync::mpsc::channel();
  app
    .dialog()
    .file()
    .set_file_name(&default_name)
    .add_filter("Spreadsheet", &["xlsx", "csv"])
    .save_file(move |path| {
      let _ = tx.send(path);
    });
  match rx.recv().map_err(|e| e.to_string())? {
    Some(file_path) => {
      let path = file_path.to_string();
      std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
      Ok(Some(path))
    }
    None => Ok(None),
  }
}

/// Write the workbook bytes straight to a known path (no dialog). Used for
/// "Save" (Cmd+S) once the file's location is known, so it saves in place
/// instead of prompting or downloading a copy.
#[tauri::command]
async fn save_workbook_to_path(path: String, bytes: Vec<u8>) -> Result<(), String> {
  std::fs::write(&path, &bytes).map_err(|e| e.to_string())
}

/// Show a native "Open" dialog and return the chosen file's path + bytes, or
/// `None` if cancelled. Web views have no `showOpenFilePicker`, and reading by
/// path lets us reopen the file fresh on the next launch.
#[tauri::command]
async fn open_workbook(app: tauri::AppHandle) -> Result<Option<(String, Vec<u8>)>, String> {
  let (tx, rx) = std::sync::mpsc::channel();
  app
    .dialog()
    .file()
    .add_filter("Spreadsheet", &["xlsx", "csv"])
    .pick_file(move |path| {
      let _ = tx.send(path);
    });
  match rx.recv().map_err(|e| e.to_string())? {
    Some(file_path) => {
      let path = file_path.to_string();
      let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
      Ok(Some((path, bytes)))
    }
    None => Ok(None),
  }
}

/// Read a file's bytes by path (used to reopen the last file fresh on launch,
/// so edits made in another editor are picked up).
#[tauri::command]
async fn read_file(path: String) -> Result<Vec<u8>, String> {
  std::fs::read(&path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      print_page,
      save_workbook_as,
      save_workbook_to_path,
      open_workbook,
      read_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
