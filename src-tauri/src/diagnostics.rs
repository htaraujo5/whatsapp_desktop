//! Modo de diagnóstico (`WA_DIAGNOSTICS=1`): testa WebRTC, microfone, câmera,
//! IPC e tema dentro da página do WhatsApp e grava o resultado no log.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{Runtime, WebviewWindow};

use crate::window::WHATSAPP_URL;

const ENV_VAR: &str = "WA_DIAGNOSTICS";
const POLL_ATTEMPTS: u32 = 90;

static STARTED: AtomicBool = AtomicBool::new(false);

pub fn enabled() -> bool {
    cfg!(debug_assertions)
        && std::env::var(ENV_VAR).is_ok_and(|value| !value.is_empty() && value != "0")
}

pub fn on_page_load<R: Runtime>(window: WebviewWindow<R>, payload: PageLoadPayload<'_>) {
    if !enabled()
        || payload.event() != PageLoadEvent::Finished
        || !payload.url().as_str().starts_with(WHATSAPP_URL)
        || STARTED.swap(true, Ordering::Relaxed)
    {
        return;
    }

    log::info!("diagnóstico: iniciando testes na página do WhatsApp");
    std::thread::spawn(move || {
        // Dá tempo para o WhatsApp Web inicializar antes de testar.
        std::thread::sleep(Duration::from_secs(3));
        let _ = window.eval("window.__waNative && window.__waNative.runDiagnostics()");

        let done = std::sync::Arc::new(AtomicBool::new(false));
        for _ in 0..POLL_ATTEMPTS {
            std::thread::sleep(Duration::from_secs(1));
            if done.load(Ordering::Relaxed) {
                return;
            }
            let done = done.clone();
            let _ = window.eval_with_callback(
                "(window.__waNative && window.__waNative.lastDiagnostics) || null",
                move |result| {
                    if result != "null" && !done.swap(true, Ordering::Relaxed) {
                        let pretty = serde_json::from_str::<serde_json::Value>(&result)
                            .and_then(|value| serde_json::to_string_pretty(&value))
                            .unwrap_or(result);
                        log::info!("diagnóstico: resultado\n{pretty}");
                    }
                },
            );
        }
        log::warn!("diagnóstico: sem resposta da página após {POLL_ATTEMPTS}s");
    });
}
