use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

const FILE_NAME: &str = "settings.json";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub close_to_tray: bool,
    pub start_minimized: bool,
    pub autostart: bool,
    pub notifications_enabled: bool,
    pub notify_when_focused: bool,
    pub show_message_preview: bool,
    /// Cartões do próprio app, com resposta; senão, notificações do sistema.
    pub in_app_notifications: bool,
    /// Vazio = User-Agent do próprio WebKit (Safari), que o WhatsApp Web aceita.
    pub user_agent: String,
    pub spellcheck_languages: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            start_minimized: false,
            autostart: false,
            notifications_enabled: true,
            notify_when_focused: false,
            show_message_preview: true,
            in_app_notifications: true,
            user_agent: String::new(),
            spellcheck_languages: vec!["pt_BR".into(), "en_US".into()],
        }
    }
}

impl Settings {
    pub fn custom_user_agent(&self) -> Option<&str> {
        Some(self.user_agent.trim()).filter(|ua| !ua.is_empty())
    }
}

fn path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(FILE_NAME))
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> Settings {
    let Some(path) = path(app) else {
        return Settings::default();
    };
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|err| {
            log::warn!("configurações inválidas em {}: {err}", path.display());
            Settings::default()
        }),
        Err(_) => Settings::default(),
    }
}

pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<(), String> {
    let path = path(app).ok_or("diretório de configuração indisponível")?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_user_agent_means_webkit_default() {
        let mut settings = Settings::default();
        assert_eq!(settings.custom_user_agent(), None);
        settings.user_agent = "  ".into();
        assert_eq!(settings.custom_user_agent(), None);
        settings.user_agent = " Custom/1.0 ".into();
        assert_eq!(settings.custom_user_agent(), Some("Custom/1.0"));
    }

    #[test]
    fn missing_fields_use_defaults() {
        let settings: Settings = serde_json::from_str(r#"{"closeToTray":false}"#).unwrap();
        assert!(!settings.close_to_tray);
        assert!(settings.notifications_enabled);
        assert_eq!(settings.spellcheck_languages, vec!["pt_BR", "en_US"]);
    }
}
