mod badge;
mod commands;
mod diagnostics;
mod downloads;
mod navigation;
mod notifications;
mod permissions;
mod settings;
mod state;
mod toast;
mod tray;
mod webkit;
mod window;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::StateFlags;

use crate::notifications::NotificationStore;
use crate::state::AppState;

/// Argumento usado pelo autostart para iniciar o app escondido na bandeja.
pub const MINIMIZED_ARG: &str = "--minimized";

pub fn run() {
    // No Wayland o GNOME não deixa a janela escolher a própria posição, e as
    // notificações do app precisam ficar no canto da tela. Terminais e IDEs
    // costumam exportar GDK_BACKEND=wayland, por isso o valor é sobrescrito;
    // WA_WAYLAND=1 mantém o Wayland nativo.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WA_WAYLAND").is_none() {
        std::env::set_var("GDK_BACKEND", "x11");
    }

    tauri::Builder::default()
        // Precisa ser o primeiro plugin registrado.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_main(app);
        }))
        // Padrão: terminal + arquivo em ~/.local/share/com.whatsapp.linux.native/logs.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    StateFlags::all() & !StateFlags::VISIBLE & !StateFlags::DECORATIONS,
                )
                .with_denylist(&[window::SETTINGS, toast::TOAST])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_ARG]),
        ))
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::app_info,
            commands::notify,
            commands::test_notification,
            commands::open_settings,
            commands::toast_items,
            commands::dismiss_toast,
            commands::resize_toast,
            commands::send_reply,
            commands::reply_result,
            commands::open_chat,
            commands::open_in_browser,
        ])
        .setup(|app| {
            let handle = app.handle();
            let settings = settings::load(handle);
            let start_hidden =
                settings.start_minimized || std::env::args().any(|arg| arg == MINIMIZED_ARG);

            app.manage(AppState::new(settings.clone()));
            app.manage(NotificationStore::default());
            tray::create(handle)?;
            window::create_main(handle, &settings, start_hidden)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != window::MAIN {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if state.close_to_tray() && !state.is_quitting() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o WhatsApp Desktop")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                app.state::<AppState>().mark_quitting();
            }
        });
}
