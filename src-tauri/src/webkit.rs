//! Ajustes específicos do WebKitGTK que o Tauri não expõe diretamente.

use tauri::{Runtime, WebviewWindow};

use crate::settings::Settings;

#[cfg(target_os = "linux")]
const OFFLINE_HTML: &str = include_str!("../assets/offline.html");

#[cfg(target_os = "linux")]
pub fn configure<R: Runtime>(window: &WebviewWindow<R>, settings: &Settings) {
    use webkit2gtk::{NetworkError, SettingsExt, WebViewExt};

    let languages = settings.spellcheck_languages.clone();
    let user_agent = settings.custom_user_agent().map(str::to_string);
    let result = window.with_webview(move |platform| {
        let webview = platform.inner();

        if let Some(ws) = WebViewExt::settings(&webview) {
            ws.set_enable_media_stream(true);
            ws.set_enable_mediasource(true);
            ws.set_enable_webrtc(true);
            ws.set_enable_developer_extras(cfg!(debug_assertions));
            apply_user_agent(&ws, user_agent.as_deref());
            // A primeira requisição já saiu com os quirks ligados.
            if user_agent.is_some() {
                webview.reload();
            }
        }

        spellcheck(&webview, &languages);

        // Sem rede, mostra uma página local; `content_uri` mantém a URL original
        // para que "Tentar novamente" (location.reload) recarregue o WhatsApp.
        webview.connect_load_failed(|webview, _event, failing_uri, error| {
            let network_failure = error
                .kind::<NetworkError>()
                .is_some_and(|kind| kind != NetworkError::Cancelled);
            if !network_failure || !failing_uri.starts_with(crate::window::WHATSAPP_URL) {
                return false;
            }
            webview.load_alternate_html(OFFLINE_HTML, failing_uri, None);
            true
        });
    });

    if let Err(err) = result {
        log::warn!("falha ao configurar o WebKitGTK: {err}");
    }
}

#[cfg(target_os = "linux")]
fn spellcheck(webview: &webkit2gtk::WebView, languages: &[String]) {
    use webkit2gtk::{WebContextExt, WebViewExt};

    let Some(context) = webview.context() else {
        return;
    };
    let languages: Vec<&str> = languages.iter().map(String::as_str).collect();
    context.set_spell_checking_enabled(!languages.is_empty());
    if !languages.is_empty() {
        context.set_spell_checking_languages(&languages);
    }
}

#[cfg(target_os = "linux")]
pub fn apply_spellcheck<R: Runtime>(window: &WebviewWindow<R>, languages: &[String]) {
    let languages = languages.to_vec();
    let _ = window.with_webview(move |platform| spellcheck(&platform.inner(), &languages));
}

/// Os "quirks" do WebKitGTK forçam um User-Agent de Safari no WhatsApp Web;
/// ficam ativos só quando não há User-Agent personalizado.
#[cfg(target_os = "linux")]
fn apply_user_agent(ws: &webkit2gtk::Settings, user_agent: Option<&str>) {
    use webkit2gtk::SettingsExt;

    ws.set_enable_site_specific_quirks(user_agent.is_none());
    ws.set_user_agent(user_agent);
}

#[cfg(target_os = "linux")]
pub fn set_user_agent<R: Runtime>(window: &WebviewWindow<R>, user_agent: Option<&str>) {
    use webkit2gtk::WebViewExt;

    let user_agent = user_agent.map(str::to_string);
    let _ = window.with_webview(move |platform| {
        let webview = platform.inner();
        if let Some(ws) = WebViewExt::settings(&webview) {
            apply_user_agent(&ws, user_agent.as_deref());
        }
        webview.reload();
    });
}

/// O wry destrói só a WebView quando a página chama `window.close()`; aqui a
/// janela inteira é fechada junto, para não sobrar uma janela vazia.
#[cfg(target_os = "linux")]
pub fn close_window_on_script_close<R: Runtime>(window: &WebviewWindow<R>) {
    use webkit2gtk::WebViewExt;

    let handle = window.clone();
    let _ = window.with_webview(move |platform| {
        platform.inner().connect_close(move |_| {
            let _ = handle.destroy();
        });
    });
}

#[cfg(not(target_os = "linux"))]
pub fn close_window_on_script_close<R: Runtime>(_window: &WebviewWindow<R>) {}

#[cfg(not(target_os = "linux"))]
pub fn configure<R: Runtime>(_window: &WebviewWindow<R>, _settings: &Settings) {}

#[cfg(not(target_os = "linux"))]
pub fn apply_spellcheck<R: Runtime>(_window: &WebviewWindow<R>, _languages: &[String]) {}

#[cfg(not(target_os = "linux"))]
pub fn set_user_agent<R: Runtime>(window: &WebviewWindow<R>, _user_agent: Option<&str>) {
    let _ = window.reload();
}
