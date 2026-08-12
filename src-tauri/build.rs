fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "open_document",
            "read_document",
            "stat_document",
            "save_document",
            "save_document_as",
            "close_document",
        ]),
    ))
    .expect("failed to run the Tauri build script")
}
