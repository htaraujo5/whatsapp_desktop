use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

use crate::settings::Settings;

pub struct AppState {
    settings: Mutex<Settings>,
    unread: AtomicU32,
    quitting: AtomicBool,
}

impl AppState {
    pub fn new(settings: Settings) -> Self {
        Self {
            settings: Mutex::new(settings),
            unread: AtomicU32::new(0),
            quitting: AtomicBool::new(false),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.lock().expect("settings lock").clone()
    }

    pub fn replace_settings(&self, settings: Settings) -> Settings {
        std::mem::replace(&mut *self.settings.lock().expect("settings lock"), settings)
    }

    pub fn close_to_tray(&self) -> bool {
        self.settings.lock().expect("settings lock").close_to_tray
    }

    /// Atualiza a contagem e retorna `true` se o valor mudou.
    pub fn set_unread(&self, count: u32) -> bool {
        self.unread.swap(count, Ordering::Relaxed) != count
    }

    pub fn mark_quitting(&self) {
        self.quitting.store(true, Ordering::Relaxed);
    }

    pub fn is_quitting(&self) -> bool {
        self.quitting.load(Ordering::Relaxed)
    }
}
