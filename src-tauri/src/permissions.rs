use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::{Runtime, Webview};

use crate::window::{POPUP_PREFIX, WHATSAPP_URL};

/// Janelas de chamada abertas pelo WhatsApp começam em `about:blank` e
/// herdam a origem de quem as abriu.
fn is_whatsapp<R: Runtime>(webview: &Webview<R>) -> bool {
    let Ok(url) = webview.url() else {
        return false;
    };
    url.as_str().starts_with(WHATSAPP_URL)
        || (webview.label().starts_with(POPUP_PREFIX) && url.as_str() == "about:blank")
}

/// Libera microfone, câmera e compartilhamento de tela só para o WhatsApp Web.
/// Notificações nativas do WebKit são negadas porque o script injetado já as
/// encaminha ao Rust.
pub fn on_permission_request<R: Runtime>(
    webview: Webview<R>,
    kind: PermissionKind,
) -> PermissionResponse {
    let allowed = match kind {
        PermissionKind::Microphone | PermissionKind::Camera => is_whatsapp(&webview),
        PermissionKind::DisplayCapture => return PermissionResponse::Default,
        _ => false,
    };
    log::info!(
        "permissão {kind:?} em {}: {}",
        webview.label(),
        if allowed { "concedida" } else { "negada" }
    );
    if allowed {
        PermissionResponse::Allow
    } else {
        PermissionResponse::Deny
    }
}
