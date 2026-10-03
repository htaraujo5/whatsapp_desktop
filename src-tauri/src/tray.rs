use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

use crate::state::AppState;
use crate::{navigation, window};

const TRAY_ID: &str = "main-tray";

/// Cor do indicador de mensagens não lidas sobre o ícone da bandeja.
const DOT_COLOR: [u8; 3] = [0xf1, 0x5c, 0x6d];

const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");

fn base_icon<R: Runtime>(app: &AppHandle<R>) -> Option<Image<'static>> {
    Image::from_bytes(TRAY_ICON)
        .map(|icon| icon.to_owned())
        .ok()
        .or_else(|| {
            app.default_window_icon()
                .map(|icon| icon.clone().to_owned())
        })
}

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(
        app,
        "toggle",
        "Mostrar/Ocultar WhatsApp",
        true,
        None::<&str>,
    )?;
    let browser = MenuItem::with_id(
        app,
        "browser",
        "Abrir no navegador (chamadas)",
        true,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "settings", "Configurações", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &browser, &settings, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("WhatsApp")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => window::toggle_main(app),
            "browser" => navigation::open_whatsapp_in_browser(app),
            "settings" => {
                if let Err(err) = window::open_settings(app) {
                    log::warn!("falha ao abrir configurações: {err}");
                }
            }
            "quit" => {
                app.state::<AppState>().mark_quitting();
                app.exit(0);
            }
            _ => {}
        })
        // No Linux (AppIndicator) só o menu funciona; o clique vale para outros sistemas.
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::toggle_main(tray.app_handle());
            }
        });

    if let Some(icon) = base_icon(app) {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

pub fn set_unread<R: Runtime>(app: &AppHandle<R>, count: u32) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let tooltip = match count {
        0 => "WhatsApp".to_string(),
        1 => "WhatsApp — 1 mensagem não lida".to_string(),
        n => format!("WhatsApp — {n} mensagens não lidas"),
    };
    let _ = tray.set_tooltip(Some(&tooltip));

    if let Some(icon) = base_icon(app) {
        let icon = if count > 0 {
            with_unread_dot(&icon)
        } else {
            icon
        };
        let _ = tray.set_icon(Some(icon));
    }
}

/// Desenha um círculo no canto superior direito do ícone (com borda escura
/// para manter contraste em painéis claros e escuros).
pub fn with_unread_dot(icon: &Image<'_>) -> Image<'static> {
    let (width, height) = (icon.width(), icon.height());
    let mut rgba = icon.rgba().to_vec();

    let size = width.min(height) as f32;
    let radius = size * 0.24;
    let border = (size * 0.05).max(1.0);
    let cx = width as f32 - radius - border;
    let cy = radius + border;

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let distance = (dx * dx + dy * dy).sqrt();
            let color = if distance <= radius {
                [DOT_COLOR[0], DOT_COLOR[1], DOT_COLOR[2]]
            } else if distance <= radius + border {
                [0x20, 0x20, 0x20]
            } else {
                continue;
            };
            let idx = ((y * width + x) * 4) as usize;
            rgba[idx..idx + 4].copy_from_slice(&[color[0], color[1], color[2], 0xff]);
        }
    }

    Image::new_owned(rgba, width, height)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dot_is_drawn_in_top_right_corner() {
        let icon = Image::new_owned(vec![0; 32 * 32 * 4], 32, 32);
        let dotted = with_unread_dot(&icon);
        let pixel = |x: u32, y: u32| {
            let i = ((y * 32 + x) * 4) as usize;
            dotted.rgba()[i..i + 4].to_vec()
        };
        assert_eq!(
            pixel(24, 7),
            vec![DOT_COLOR[0], DOT_COLOR[1], DOT_COLOR[2], 0xff]
        );
        assert_eq!(pixel(2, 30), vec![0, 0, 0, 0]);
    }
}
