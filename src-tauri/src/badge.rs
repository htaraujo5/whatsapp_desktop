use tauri::{Manager, Runtime, WebviewWindow};

use crate::state::AppState;
use crate::tray;

/// Extrai a contagem de não lidas do título do WhatsApp Web, no formato `(3) WhatsApp`.
pub fn parse_unread(title: &str) -> u32 {
    title
        .trim_start()
        .strip_prefix('(')
        .and_then(|rest| rest.split_once(')'))
        .and_then(|(count, _)| count.trim().parse().ok())
        .unwrap_or(0)
}

pub fn on_title_changed<R: Runtime>(window: &WebviewWindow<R>, title: &str) {
    let count = parse_unread(title);
    let app = window.app_handle();
    if !app.state::<AppState>().set_unread(count) {
        return;
    }

    let badge = (count > 0).then_some(i64::from(count));
    if let Err(err) = window.set_badge_count(badge) {
        log::warn!("falha ao atualizar o badge: {err}");
    }
    let _ = window.set_title(&window_title(count));
    tray::set_unread(app, count);
}

pub fn window_title(count: u32) -> String {
    if count > 0 {
        format!("({count}) WhatsApp")
    } else {
        "WhatsApp".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_counts_from_title() {
        assert_eq!(parse_unread("(3) WhatsApp"), 3);
        assert_eq!(parse_unread("(128) WhatsApp Business"), 128);
        assert_eq!(parse_unread(" ( 7 ) WhatsApp"), 7);
    }

    #[test]
    fn titles_without_count_are_zero() {
        assert_eq!(parse_unread("WhatsApp"), 0);
        assert_eq!(parse_unread(""), 0);
        assert_eq!(parse_unread("(abc) WhatsApp"), 0);
        assert_eq!(parse_unread("Conversa (3)"), 0);
    }

    #[test]
    fn window_title_reflects_count() {
        assert_eq!(window_title(0), "WhatsApp");
        assert_eq!(window_title(5), "(5) WhatsApp");
    }
}
