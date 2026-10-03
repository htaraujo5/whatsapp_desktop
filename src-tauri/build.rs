fn main() {
    // O ícone da janela é embutido pelo generate_context!, que não avisa o Cargo de mudanças.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_settings",
            "save_settings",
            "app_info",
            "notify",
            "test_notification",
            "open_settings",
            "toast_items",
            "dismiss_toast",
            "resize_toast",
            "send_reply",
            "reply_result",
            "open_chat",
            "open_in_browser",
        ]),
    ))
    .expect("falha ao executar o tauri-build");
}
