use tauri::webview::DownloadEvent;
use tauri::{Manager, Runtime, Webview};

use crate::notifications;

/// O wry já escolhe `~/Downloads` e evita sobrescrever arquivos; aqui só
/// aceitamos o download e avisamos quando ele termina.
pub fn on_download<R: Runtime>(webview: Webview<R>, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { url, destination } => {
            log::info!("download iniciado: {url} -> {}", destination.display());
            true
        }
        DownloadEvent::Finished { path, success, .. } => {
            if success {
                notifications::download_finished(webview.app_handle(), path.as_deref());
            } else {
                log::warn!("download falhou: {path:?}");
            }
            true
        }
        _ => true,
    }
}
