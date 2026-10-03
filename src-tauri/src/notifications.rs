use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, VecDeque};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::oneshot;

use crate::window::{self, MAIN};

/// Nome do ícone instalado pelo pacote `.deb` em `/usr/share/icons/hicolor`.
const ICON_NAME: &str = "whatsapp-desktop";
pub const SOUND_NAME: &str = "message-new-instant";
const MAX_RECENT: usize = 50;
const MAX_TOASTS: usize = 3;
const MAX_AVATAR_BYTES: usize = 512 * 1024;
const REPLY_TIMEOUT: Duration = Duration::from_secs(20);

const ACTION_OPEN: &str = "default";

pub struct MessageNotification {
    pub id: u64,
    pub title: String,
    pub body: String,
    /// Identifica a conversa: notificações da mesma conversa se substituem.
    pub tag: String,
    pub silent: bool,
    /// Avatar do contato como `data:image/...;base64,...`.
    pub avatar: Option<String>,
    /// Notificação de exemplo: a resposta é simulada, sem tocar no WhatsApp.
    pub test: bool,
}

impl MessageNotification {
    /// Identifica a conversa: a tag do WhatsApp ou, na falta dela, o título.
    pub fn chat_key(&self) -> String {
        if self.tag.is_empty() {
            self.title.clone()
        } else {
            self.tag.clone()
        }
    }

    pub fn context(&self) -> ReplyContext {
        ReplyContext {
            id: self.id,
            chat: self.chat_key(),
            title: self.title.clone(),
            body: self.body.clone(),
            avatar: self.avatar.clone(),
            test: self.test,
        }
    }
}

/// Uma notificação como exibida no cartão do app (e usada para responder).
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplyContext {
    pub id: u64,
    pub chat: String,
    pub title: String,
    pub body: String,
    pub avatar: Option<String>,
    pub test: bool,
}

#[derive(Default)]
pub struct NotificationStore {
    recent: Mutex<VecDeque<ReplyContext>>,
    /// Cartões visíveis, do mais novo para o mais antigo; um por conversa.
    toasts: Mutex<Vec<ReplyContext>>,
    /// Conversa → id da notificação no servidor (para substituir).
    server_ids: Mutex<HashMap<String, u32>>,
    /// Id no servidor → notificação mais recente exibida com ele.
    latest: Mutex<HashMap<u32, u64>>,
    pending_replies: Mutex<HashMap<u64, oneshot::Sender<Result<(), String>>>>,
}

impl NotificationStore {
    pub fn remember(&self, context: ReplyContext) {
        let mut recent = self.recent.lock().expect("notifications lock");
        recent.retain(|entry| entry.id != context.id);
        recent.push_back(context);
        while recent.len() > MAX_RECENT {
            recent.pop_front();
        }
    }

    pub fn get(&self, id: u64) -> Option<ReplyContext> {
        let recent = self.recent.lock().expect("notifications lock");
        recent.iter().find(|entry| entry.id == id).cloned()
    }

    fn server_id(&self, key: &str) -> Option<u32> {
        self.server_ids
            .lock()
            .expect("notifications lock")
            .get(key)
            .copied()
    }

    fn shown(&self, key: String, server_id: u32, id: u64) {
        self.server_ids
            .lock()
            .expect("notifications lock")
            .insert(key, server_id);
        self.latest
            .lock()
            .expect("notifications lock")
            .insert(server_id, id);
    }

    /// Uma notificação substituída continua esperando ações com o mesmo id no
    /// servidor; só a mais recente deve reagir.
    fn is_latest(&self, server_id: u32, id: u64) -> bool {
        self.latest
            .lock()
            .expect("notifications lock")
            .get(&server_id)
            == Some(&id)
    }

    /// Adiciona o cartão no topo, substituindo o da mesma conversa.
    pub fn push_toast(&self, context: ReplyContext) -> Vec<ReplyContext> {
        let mut toasts = self.toasts.lock().expect("notifications lock");
        toasts.retain(|toast| toast.chat != context.chat);
        toasts.insert(0, context);
        toasts.truncate(MAX_TOASTS);
        toasts.clone()
    }

    pub fn dismiss_toast(&self, id: u64) -> Vec<ReplyContext> {
        let mut toasts = self.toasts.lock().expect("notifications lock");
        toasts.retain(|toast| toast.id != id);
        toasts.clone()
    }

    pub fn toasts(&self) -> Vec<ReplyContext> {
        self.toasts.lock().expect("notifications lock").clone()
    }

    fn register_reply(&self, id: u64) -> oneshot::Receiver<Result<(), String>> {
        let (sender, receiver) = oneshot::channel();
        self.pending_replies
            .lock()
            .expect("notifications lock")
            .insert(id, sender);
        receiver
    }

    pub fn finish_reply(&self, id: u64, result: Result<(), String>) {
        let sender = self
            .pending_replies
            .lock()
            .expect("notifications lock")
            .remove(&id);
        if let Some(sender) = sender {
            let _ = sender.send(result);
        }
    }
}

fn hash_key(key: &str) -> String {
    let mut hasher = DefaultHasher::new();
    key.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub fn decode_data_url(data_url: &str) -> Option<Vec<u8>> {
    let (header, payload) = data_url.split_once(',')?;
    if !header.starts_with("data:image/") || !header.ends_with(";base64") {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .ok()?;
    (bytes.len() <= MAX_AVATAR_BYTES).then_some(bytes)
}

/// Grava o avatar no cache para o servidor de notificações ler (`image-path`).
fn save_avatar<R: Runtime>(app: &AppHandle<R>, key: &str, data_url: &str) -> Option<PathBuf> {
    let bytes = decode_data_url(data_url)?;
    let dir = app.path().app_cache_dir().ok()?.join("avatars");
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join(format!("{}.img", hash_key(key)));
    std::fs::write(&path, bytes).ok()?;
    Some(path)
}

/// Mostra a notificação no servidor de notificações do desktop (usado quando
/// os cartões do app estão desativados ou o "Não perturbe" está ligado).
pub fn show_message<R: Runtime>(app: &AppHandle<R>, message: MessageNotification) {
    let key = message.chat_key();
    let avatar_path = message
        .avatar
        .as_deref()
        .and_then(|avatar| save_avatar(app, &key, avatar));

    let store = app.state::<NotificationStore>();
    store.remember(message.context());
    let replaces = store.server_id(&key);

    let app = app.clone();
    std::thread::spawn(move || {
        let mut notification = notify_rust::Notification::new();
        notification
            .appname("WhatsApp")
            .summary(&message.title)
            .body(&message.body)
            .icon(ICON_NAME)
            .hint(notify_rust::Hint::DesktopEntry(
                app.package_info().name.clone(),
            ))
            .hint(notify_rust::Hint::Category("im.received".into()))
            .action(ACTION_OPEN, "Abrir conversa");
        if let Some(path) = &avatar_path {
            notification.image_path(&path.to_string_lossy());
        }
        if !message.silent {
            notification.sound_name(SOUND_NAME);
        }
        if let Some(server_id) = replaces {
            notification.id(server_id);
        }

        let handle = match notification.show() {
            Ok(handle) => handle,
            Err(err) => {
                log::warn!("falha ao exibir notificação: {err}");
                return;
            }
        };
        let server_id = handle.id();
        app.state::<NotificationStore>()
            .shown(key, server_id, message.id);

        handle.wait_for_action(|action| {
            if !app
                .state::<NotificationStore>()
                .is_latest(server_id, message.id)
            {
                return;
            }
            log::info!("notificação {}: ação \"{action}\"", message.id);
            if action == ACTION_OPEN {
                open_chat(&app, message.id);
            }
        });
    });
}

/// Restaura a janela e dispara o `onclick` original do WhatsApp, que abre a conversa.
pub fn open_chat<R: Runtime>(app: &AppHandle<R>, id: u64) {
    window::show_main(app);
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.eval(format!(
            "window.__waNative && window.__waNative.notificationClicked({id})"
        ));
    }
}

/// Envia a resposta pelo WhatsApp Web (na janela principal, mesmo escondida)
/// e aguarda o script injetado confirmar o envio.
pub async fn send_reply<R: Runtime>(app: &AppHandle<R>, id: u64, text: &str) -> Result<(), String> {
    let store = app.state::<NotificationStore>();
    let context = store
        .get(id)
        .ok_or("Esta notificação expirou. Abra a conversa para responder.")?;
    if context.test {
        tokio::time::sleep(Duration::from_millis(600)).await;
        return Ok(());
    }

    let main = app
        .get_webview_window(MAIN)
        .ok_or("A janela do WhatsApp não está disponível.")?;
    let text = serde_json::to_string(text).map_err(|e| e.to_string())?;
    let receiver = store.register_reply(id);
    main.eval(format!(
        "window.__waNative && window.__waNative.reply({id}, {text})"
    ))
    .map_err(|e| e.to_string())?;

    match tokio::time::timeout(REPLY_TIMEOUT, receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("O envio foi cancelado.".into()),
        Err(_) => {
            store.finish_reply(id, Err(String::new()));
            Err("O WhatsApp não confirmou o envio a tempo.".into())
        }
    }
}

pub fn download_finished<R: Runtime>(app: &AppHandle<R>, path: Option<&Path>) {
    let file_name = path
        .and_then(Path::file_name)
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Arquivo".into());
    let folder = path.and_then(Path::parent).map(Path::to_path_buf);
    let app = app.clone();

    std::thread::spawn(move || {
        let handle = notify_rust::Notification::new()
            .appname("WhatsApp")
            .summary("Download concluído")
            .body(&file_name)
            .icon(ICON_NAME)
            .hint(notify_rust::Hint::DesktopEntry(
                app.package_info().name.clone(),
            ))
            .hint(notify_rust::Hint::Category("transfer.complete".into()))
            .action("default", "Abrir pasta")
            .show();

        if let (Ok(handle), Some(folder)) = (handle, folder) {
            handle.wait_for_action(|action| {
                if action == "default" {
                    use tauri_plugin_opener::OpenerExt;
                    let _ = app
                        .opener()
                        .open_path(folder.to_string_lossy(), None::<&str>);
                }
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context(id: u64) -> ReplyContext {
        ReplyContext {
            id,
            chat: format!("chat-{id}"),
            title: format!("Contato {id}"),
            body: String::new(),
            avatar: None,
            test: false,
        }
    }

    #[test]
    fn decodes_only_image_data_urls() {
        assert_eq!(
            decode_data_url("data:image/png;base64,AAEC"),
            Some(vec![0, 1, 2])
        );
        assert_eq!(decode_data_url("data:text/html;base64,AAEC"), None);
        assert_eq!(decode_data_url("data:image/png,raw"), None);
        assert_eq!(decode_data_url("https://pps.whatsapp.net/a.jpg"), None);
    }

    #[test]
    fn keeps_only_recent_notifications() {
        let store = NotificationStore::default();
        for id in 0..(MAX_RECENT as u64 + 5) {
            store.remember(context(id));
        }
        assert!(store.get(0).is_none());
        assert!(store.get(MAX_RECENT as u64 + 4).is_some());
    }

    #[test]
    fn toasts_keep_one_card_per_chat_newest_first() {
        let store = NotificationStore::default();
        store.push_toast(context(1));
        store.push_toast(context(2));
        let mut newer = context(3);
        newer.chat = "chat-1".into();
        let toasts = store.push_toast(newer);
        let ids: Vec<u64> = toasts.iter().map(|t| t.id).collect();
        assert_eq!(ids, vec![3, 2]);

        for id in 10..20 {
            store.push_toast(context(id));
        }
        assert_eq!(store.toasts().len(), MAX_TOASTS);
        assert!(store.dismiss_toast(19).iter().all(|t| t.id != 19));
    }

    #[test]
    fn replaced_notifications_ignore_actions() {
        let store = NotificationStore::default();
        store.shown("chat".into(), 7, 1);
        store.shown("chat".into(), 7, 2);
        assert!(!store.is_latest(7, 1));
        assert!(store.is_latest(7, 2));
        assert_eq!(store.server_id("chat"), Some(7));
    }

    #[test]
    fn reply_result_reaches_the_waiting_sender() {
        let store = NotificationStore::default();
        let mut receiver = store.register_reply(3);
        store.finish_reply(3, Err("falhou".into()));
        assert_eq!(receiver.try_recv().unwrap(), Err("falhou".into()));
    }
}
