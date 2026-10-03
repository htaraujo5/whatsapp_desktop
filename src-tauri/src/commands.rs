use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;

use crate::navigation;
use crate::notifications::{self, MessageNotification, NotificationStore, ReplyContext};
use crate::settings::{self, Settings};
use crate::state::AppState;
use crate::window::{self, MAIN};
use crate::{toast, webkit};

const MAX_TITLE_LEN: usize = 200;
const MAX_BODY_LEN: usize = 1000;
const MAX_REPLY_LEN: usize = 4096;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
pub fn save_settings<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    settings::save(&app, &settings)?;
    let previous = state.replace_settings(settings.clone());

    if previous.autostart != settings.autostart {
        let autolaunch = app.autolaunch();
        let result = if settings.autostart {
            autolaunch.enable()
        } else {
            autolaunch.disable()
        };
        result.map_err(|e| format!("não foi possível alterar o início automático: {e}"))?;
    }

    if let Some(main) = app.get_webview_window(MAIN) {
        if previous.spellcheck_languages != settings.spellcheck_languages {
            webkit::apply_spellcheck(&main, &settings.spellcheck_languages);
        }
        if previous.custom_user_agent() != settings.custom_user_agent() {
            webkit::set_user_agent(&main, settings.custom_user_agent());
        }
    }
    Ok(())
}

#[derive(Serialize)]
pub struct AppInfo {
    name: String,
    version: String,
    tauri: &'static str,
}

#[tauri::command]
pub fn app_info<R: Runtime>(app: AppHandle<R>) -> AppInfo {
    let info = app.package_info();
    AppInfo {
        name: info.name.clone(),
        version: info.version.to_string(),
        tauri: tauri::VERSION,
    }
}

fn truncate(text: &str, max: usize) -> String {
    match text.char_indices().nth(max) {
        Some((idx, _)) => format!("{}…", &text[..idx]),
        None => text.to_string(),
    }
}

/// Chamado pelo script injetado no WhatsApp Web quando a página cria uma `Notification`.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn notify<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
    id: u64,
    title: String,
    body: Option<String>,
    tag: Option<String>,
    silent: Option<bool>,
    icon: Option<String>,
) -> Result<(), String> {
    let settings = state.settings();
    if !settings.notifications_enabled {
        log::info!("notificação {id} ignorada: notificações desativadas");
        return Ok(());
    }

    let focused = window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false);
    if focused && !settings.notify_when_focused {
        log::info!("notificação {id} ignorada: janela do WhatsApp em foco");
        return Ok(());
    }
    log::info!("notificação {id} recebida do WhatsApp");

    let body = if settings.show_message_preview {
        truncate(body.as_deref().unwrap_or_default(), MAX_BODY_LEN)
    } else {
        "Nova mensagem".into()
    };

    deliver(
        &app,
        &settings,
        MessageNotification {
            id,
            title: truncate(&title, MAX_TITLE_LEN),
            body,
            tag: tag.unwrap_or_default(),
            silent: silent.unwrap_or(false),
            avatar: icon.filter(|_| settings.show_message_preview),
            test: false,
        },
    );
    Ok(())
}

/// Cartão do app (com resposta) ou, com "Não perturbe", a central do sistema.
fn deliver<R: Runtime>(app: &AppHandle<R>, settings: &Settings, message: MessageNotification) {
    if settings.in_app_notifications && toast::banners_enabled() {
        toast::show(app, message);
    } else {
        notifications::show_message(app, message);
    }
}

#[tauri::command]
pub fn test_notification<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) {
    deliver(
        &app,
        &state.settings(),
        MessageNotification {
            id: 0,
            title: "WhatsApp Desktop".into(),
            body: "As notificações estão funcionando. Toque em Responder para testar a resposta."
                .into(),
            tag: "test".into(),
            silent: false,
            avatar: None,
            test: true,
        },
    );
}

#[tauri::command]
pub fn open_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    window::open_settings(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toast_items(store: State<'_, NotificationStore>) -> Vec<ReplyContext> {
    store.toasts()
}

#[tauri::command]
pub fn dismiss_toast<R: Runtime>(app: AppHandle<R>, id: u64) {
    toast::dismiss(&app, id);
}

#[tauri::command]
pub fn resize_toast<R: Runtime>(app: AppHandle<R>, height: f64) {
    toast::resize(&app, height);
}

#[tauri::command]
pub async fn send_reply<R: Runtime>(
    app: AppHandle<R>,
    id: u64,
    text: String,
) -> Result<(), String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("A mensagem está vazia.".into());
    }
    let text = truncate(text, MAX_REPLY_LEN);
    let result = notifications::send_reply(&app, id, &text).await;
    match &result {
        Ok(()) => log::info!("resposta à notificação {id} enviada"),
        Err(err) => log::warn!("resposta à notificação {id} falhou: {err}"),
    }
    result
}

/// Resultado do envio, informado pelo script injetado no WhatsApp Web.
#[tauri::command]
pub fn reply_result(store: State<'_, NotificationStore>, id: u64, error: Option<String>) {
    store.finish_reply(id, error.map_or(Ok(()), Err));
}

#[tauri::command]
pub fn open_chat<R: Runtime>(app: AppHandle<R>, id: u64) {
    toast::dismiss(&app, id);
    notifications::open_chat(&app, id);
}

/// Chamadas de voz e vídeo não funcionam no WebKitGTK; seguem para o navegador padrão.
#[tauri::command]
pub fn open_in_browser<R: Runtime>(app: AppHandle<R>) {
    navigation::open_whatsapp_in_browser(&app);
}

#[cfg(test)]
mod tests {
    use super::truncate;

    #[test]
    fn truncate_respects_char_boundaries() {
        assert_eq!(truncate("olá", 10), "olá");
        assert_eq!(truncate("ação rápida", 4), "ação…");
    }
}
