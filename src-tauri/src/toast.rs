//! Notificações desenhadas pelo próprio app: cartões no canto superior direito,
//! com resposta direto no cartão (o servidor de notificações do GNOME não
//! oferece campo de texto).

use tauri::window::Color;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::notifications::{MessageNotification, NotificationStore, ReplyContext, SOUND_NAME};

pub const TOAST: &str = "toast";
const EVENT: &str = "toasts";

/// Largura lógica da janela, incluindo a margem para a sombra dos cartões.
const WIDTH: f64 = 392.0;
const INITIAL_HEIGHT: f64 = 140.0;
const MAX_HEIGHT: f64 = 720.0;
/// Distância da borda direita e do topo (abaixo da barra superior do GNOME).
const MARGIN_RIGHT: f64 = 8.0;
const MARGIN_TOP: f64 = 36.0;

pub fn show<R: Runtime>(app: &AppHandle<R>, message: MessageNotification) {
    let context = message.context();
    let store = app.state::<NotificationStore>();
    store.remember(context.clone());
    let toasts = store.push_toast(context);

    if !message.silent {
        play_sound();
    }
    if let Err(err) = sync(app, toasts) {
        log::warn!("falha ao exibir a notificação do app: {err}");
    }
}

pub fn dismiss<R: Runtime>(app: &AppHandle<R>, id: u64) {
    let toasts = app.state::<NotificationStore>().dismiss_toast(id);
    if let Err(err) = sync(app, toasts) {
        log::warn!("falha ao atualizar as notificações do app: {err}");
    }
}

/// Ajusta a altura ao conteúdo, mantendo o canto superior direito no lugar.
pub fn resize<R: Runtime>(app: &AppHandle<R>, height: f64) {
    if let Some(window) = app.get_webview_window(TOAST) {
        let height = height.clamp(1.0, MAX_HEIGHT);
        let _ = window.set_size(LogicalSize::new(WIDTH, height));
        place(&window);
    }
}

fn sync<R: Runtime>(app: &AppHandle<R>, toasts: Vec<ReplyContext>) -> tauri::Result<()> {
    let window = match app.get_webview_window(TOAST) {
        Some(window) => window,
        None if toasts.is_empty() => return Ok(()),
        None => create(app)?,
    };
    window.emit_to(TOAST, EVENT, &toasts)?;

    if toasts.is_empty() {
        window.hide()?;
    } else if !window.is_visible()? {
        place(&window);
        window.show()?;
        window.set_always_on_top(true)?;
        place(&window);
    }
    Ok(())
}

fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    let window = WebviewWindowBuilder::new(app, TOAST, WebviewUrl::App("index.html".into()))
        .title("Notificações — WhatsApp")
        .inner_size(WIDTH, INITIAL_HEIGHT)
        // O GTK ignora `set_size` em janelas não redimensionáveis; sem bordas,
        // o usuário não tem como redimensionar mesmo assim.
        .resizable(true)
        .maximizable(false)
        .decorations(false)
        .transparent(true)
        .background_color(Color(0, 0, 0, 0))
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()?;
    configure_gtk(&window);
    Ok(window)
}

/// Sem roubar o foco ao aparecer e fora do alternador de janelas.
#[cfg(target_os = "linux")]
fn configure_gtk<R: Runtime>(window: &WebviewWindow<R>) {
    use gtk::prelude::GtkWindowExt;

    if let Ok(gtk_window) = window.gtk_window() {
        gtk_window.set_focus_on_map(false);
        gtk_window.set_skip_pager_hint(true);
        gtk_window.set_keep_above(true);
    }
}

#[cfg(not(target_os = "linux"))]
fn configure_gtk<R: Runtime>(_window: &WebviewWindow<R>) {}

fn place<R: Runtime>(window: &WebviewWindow<R>) {
    let monitor = window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let x = area.position.x + area.size.width as i32 - ((WIDTH + MARGIN_RIGHT) * scale) as i32;
    let y = monitor.position().y + (MARGIN_TOP * scale) as i32;
    let _ = window.set_position(PhysicalPosition::new(x, y.max(area.position.y)));
}

/// Mesmo "Não perturbe" do GNOME: com os banners desligados, a notificação
/// vai só para a central do sistema.
#[cfg(target_os = "linux")]
pub fn banners_enabled() -> bool {
    use gtk::gio;
    use gtk::prelude::SettingsExt;

    const SCHEMA: &str = "org.gnome.desktop.notifications";
    let installed = gio::SettingsSchemaSource::default()
        .and_then(|source| source.lookup(SCHEMA, true))
        .is_some();
    !installed || gio::Settings::new(SCHEMA).boolean("show-banners")
}

#[cfg(not(target_os = "linux"))]
pub fn banners_enabled() -> bool {
    true
}

fn play_sound() {
    let result = std::process::Command::new("canberra-gtk-play")
        .args([
            "--id",
            SOUND_NAME,
            "--description",
            "Nova mensagem do WhatsApp",
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
    if let Ok(mut child) = result {
        std::thread::spawn(move || {
            let _ = child.wait();
        });
    }
}
