use std::sync::atomic::{AtomicU32, Ordering};

use tauri::image::Image;
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::window::Color;
use tauri::{AppHandle, Manager, Runtime, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use url::Url;

use crate::settings::Settings;
use crate::{badge, diagnostics, downloads, navigation, permissions, webkit};

pub const MAIN: &str = "main";
pub const SETTINGS: &str = "settings";
/// Prefixo das janelas abertas pelo próprio WhatsApp (ex.: janela de chamada).
pub const POPUP_PREFIX: &str = "popup-";

pub const WHATSAPP_URL: &str = "https://web.whatsapp.com/";

const INJECT_SCRIPT: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../dist-inject/inject.js"
));

const WINDOW_BACKGROUND: Color = Color(0x20, 0x20, 0x20, 0xff);

/// Ícone grande para a dock (o padrão do Tauri é o de 32 px, que fica borrado).
const WINDOW_ICON: &[u8] = include_bytes!("../icons/128x128@2x.png");

static POPUP_COUNTER: AtomicU32 = AtomicU32::new(1);

pub fn create_main<R: Runtime>(
    app: &AppHandle<R>,
    settings: &Settings,
    start_hidden: bool,
) -> tauri::Result<WebviewWindow<R>> {
    let nav_app = app.clone();
    let new_window_app = app.clone();

    let mut builder = WebviewWindowBuilder::new(
        app,
        MAIN,
        WebviewUrl::External(WHATSAPP_URL.parse().expect("URL do WhatsApp válida")),
    );
    if let Some(user_agent) = settings.custom_user_agent() {
        builder = builder.user_agent(user_agent);
    }

    let window = builder
        .title("WhatsApp")
        .icon(Image::from_bytes(WINDOW_ICON)?)?
        .inner_size(1024.0, 768.0)
        .min_inner_size(680.0, 500.0)
        // A barra de título é desenhada pelo script injetado (inject/titlebar.ts).
        .decorations(false)
        .visible(false)
        .theme(Some(Theme::Dark))
        .background_color(WINDOW_BACKGROUND)
        .initialization_script(INJECT_SCRIPT)
        // Sem isso o Tauri intercepta arquivos soltos na janela e o WhatsApp não os recebe.
        .disable_drag_drop_handler()
        .zoom_hotkeys_enabled(true)
        .on_navigation(move |url| navigation::on_navigation(&nav_app, url))
        .on_new_window(move |url, features| on_new_window(&new_window_app, url, features))
        .on_document_title_changed(|window, title| badge::on_title_changed(&window, &title))
        .on_page_load(diagnostics::on_page_load)
        .on_download(downloads::on_download)
        .on_permission_request(permissions::on_permission_request)
        .build()?;

    webkit::configure(&window, settings);

    if !start_hidden {
        window.show()?;
    }
    Ok(window)
}

/// Janelas do próprio WhatsApp (chamadas de voz/vídeo, por exemplo) abrem
/// como janelas nativas ligadas à mesma sessão; o resto vai para o navegador.
fn on_new_window<R: Runtime>(
    app: &AppHandle<R>,
    url: Url,
    features: NewWindowFeatures,
) -> NewWindowResponse<R> {
    if !navigation::is_popup_allowed(&url) {
        navigation::open_external(app, &url);
        return NewWindowResponse::Deny;
    }
    match create_popup(app, features) {
        Ok(window) => {
            log::info!("janela do WhatsApp aberta: {} ({url})", window.label());
            NewWindowResponse::Create { window }
        }
        Err(err) => {
            log::warn!("falha ao abrir janela do WhatsApp ({url}): {err}");
            NewWindowResponse::Deny
        }
    }
}

fn create_popup<R: Runtime>(
    app: &AppHandle<R>,
    features: NewWindowFeatures,
) -> tauri::Result<WebviewWindow<R>> {
    let label = format!(
        "{POPUP_PREFIX}{}",
        POPUP_COUNTER.fetch_add(1, Ordering::Relaxed)
    );
    let nav_app = app.clone();
    let new_window_app = app.clone();

    // `window_features` liga a nova WebView à que a abriu (mesma sessão,
    // processo, configurações e scripts injetados), como o WebKit exige para popups.
    let window = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::External("about:blank".parse().expect("about:blank válido")),
    )
    .window_features(features)
    .title("WhatsApp")
    .theme(Some(Theme::Dark))
    .background_color(WINDOW_BACKGROUND)
    .disable_drag_drop_handler()
    .on_navigation(move |url| navigation::on_navigation(&nav_app, url))
    .on_new_window(move |url, features| on_new_window(&new_window_app, url, features))
    .on_document_title_changed(|window, title| {
        let title = if title.trim().is_empty() {
            "WhatsApp"
        } else {
            title.as_str()
        };
        let _ = window.set_title(title);
    })
    .on_download(downloads::on_download)
    .on_permission_request(permissions::on_permission_request)
    .build()?;

    webkit::close_window_on_script_close(&window);
    Ok(window)
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn toggle_main<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    let minimized = window.is_minimized().unwrap_or(false);
    if visible && !minimized {
        let _ = window.hide();
    } else {
        show_main(app);
    }
}

pub fn open_settings<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS) {
        window.show()?;
        window.unminimize()?;
        return window.set_focus();
    }

    let mut builder =
        WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("index.html".into()))
            .title("Configurações — WhatsApp")
            .inner_size(600.0, 720.0)
            .min_inner_size(480.0, 520.0)
            .theme(Some(Theme::Dark))
            .background_color(WINDOW_BACKGROUND)
            .focused(true);

    if let Some(main) = app.get_webview_window(MAIN) {
        builder = builder.parent(&main)?;
    }
    builder.build()?;
    Ok(())
}
