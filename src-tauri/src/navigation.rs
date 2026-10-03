use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;
use url::Url;

/// Domínios que podem ser carregados dentro da janela principal.
const ALLOWED_DOMAINS: &[&str] = &[
    "whatsapp.com",
    "whatsapp.net",
    "facebook.com",
    "fbcdn.net",
    "fbsbx.com",
];

/// Esquemas internos do WebKit/Tauri que nunca devem ser bloqueados.
const INTERNAL_SCHEMES: &[&str] = &["about", "blob", "data", "tauri", "ipc"];

/// Esquemas que podem ser repassados ao sistema operacional.
const EXTERNAL_SCHEMES: &[&str] = &["http", "https", "mailto", "tel"];

fn host_matches(host: &str, domain: &str) -> bool {
    host == domain || host.ends_with(&format!(".{domain}"))
}

pub fn is_allowed_in_app(url: &Url) -> bool {
    if INTERNAL_SCHEMES.contains(&url.scheme()) {
        return true;
    }
    if url.scheme() != "https" {
        return false;
    }
    url.host_str()
        .is_some_and(|host| ALLOWED_DOMAINS.iter().any(|d| host_matches(host, d)))
}

/// Janelas que o próprio WhatsApp Web abre (ex.: chamadas) e devem ficar no app.
pub fn is_popup_allowed(url: &Url) -> bool {
    match url.scheme() {
        "about" => url.path() == "blank",
        "https" => url.host_str() == Some("web.whatsapp.com"),
        _ => false,
    }
}

pub fn is_external_candidate(url: &Url) -> bool {
    EXTERNAL_SCHEMES.contains(&url.scheme()) && !is_allowed_in_app(url)
}

/// Bloqueia navegações para fora do WhatsApp sem abrir nada: o handler também
/// dispara para iframes, e abrir o navegador automaticamente seria intrusivo.
/// Links clicados pelo usuário chegam via `on_new_window` (target="_blank").
pub fn on_navigation<R: Runtime>(_app: &AppHandle<R>, url: &Url) -> bool {
    let allowed = is_allowed_in_app(url);
    if !allowed {
        log::info!("navegação bloqueada na janela principal: {url}");
    }
    allowed
}

pub fn open_external<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    if !is_external_candidate(url) {
        log::info!("nova janela ignorada: {url}");
        return;
    }
    if let Err(err) = app.opener().open_url(url.as_str(), None::<&str>) {
        log::warn!("falha ao abrir {url} no navegador: {err}");
    }
}

pub fn open_whatsapp_in_browser<R: Runtime>(app: &AppHandle<R>) {
    log::info!("abrindo o WhatsApp Web no navegador padrão");
    if let Err(err) = app
        .opener()
        .open_url(crate::window::WHATSAPP_URL, None::<&str>)
    {
        log::warn!("falha ao abrir o WhatsApp Web no navegador: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn whatsapp_domains_stay_in_app() {
        assert!(is_allowed_in_app(&url("https://web.whatsapp.com/")));
        assert!(is_allowed_in_app(&url(
            "https://mmg.whatsapp.net/v/t62/file"
        )));
        assert!(is_allowed_in_app(&url(
            "blob:https://web.whatsapp.com/1234"
        )));
        assert!(is_allowed_in_app(&url("about:blank")));
    }

    #[test]
    fn lookalike_and_insecure_domains_are_rejected() {
        assert!(!is_allowed_in_app(&url("https://evilwhatsapp.com/")));
        assert!(!is_allowed_in_app(&url("https://whatsapp.com.evil.io/")));
        assert!(!is_allowed_in_app(&url("http://web.whatsapp.com/")));
    }

    #[test]
    fn only_whatsapp_web_popups_stay_in_app() {
        assert!(is_popup_allowed(&url("about:blank")));
        assert!(is_popup_allowed(&url("https://web.whatsapp.com/call?id=1")));
        assert!(!is_popup_allowed(&url("https://faq.whatsapp.com/")));
        assert!(!is_popup_allowed(&url("https://example.com/")));
        assert!(!is_popup_allowed(&url("blob:https://web.whatsapp.com/1")));
        assert!(!is_popup_allowed(&url("about:srcdoc")));
    }

    #[test]
    fn external_links_are_opened_outside() {
        assert!(is_external_candidate(&url("https://example.com/page")));
        assert!(is_external_candidate(&url("mailto:alguem@example.com")));
        assert!(!is_external_candidate(&url("https://web.whatsapp.com/")));
        assert!(!is_external_candidate(&url("file:///etc/passwd")));
        assert!(!is_external_candidate(&url("javascript:alert(1)")));
    }
}
