# 🗺️ Plano de Implementação — WhatsApp Desktop para Linux (Tauri v2 + React + Tailwind)

Plano derivado de `whatsapp-desktop-spec.md` (SRS, Arquitetura e Styleguide). Ele organiza o trabalho em fases incrementais, cada uma com entregáveis e critérios de aceite verificáveis, e registra os ajustes técnicos necessários para que a especificação funcione na prática com Tauri v2 no Ubuntu.

---

## ✅ Status da implementação (03/10/2026)

Implementado e verificado: Fases 0 a 4, 6 e 7, e a parte base da Fase 5 (tokens, CSS de override, item ativo com barra lateral, cantos de 8px). Ficaram para depois os itens opcionais da Fase 5 (barra de título customizada, nav rail, tema claro) e a medição de desempenho da Fase 8.

Verificações feitas: `npm run check` (tipos + 13 testes do script injetado), `cargo test` (16 testes), `cargo clippy -D warnings`, `cargo fmt --check`, geração do `.deb` (2,6 MB) e execução real no Ubuntu 26.04 (WhatsApp Web carregou o QR code sem aviso de navegador; bandeja com menu funcionando).

Decisões que mudaram em relação ao texto abaixo, ao implementar:

- **npm em vez de pnpm** (o pnpm não estava instalado).
- **Contagem de não lidas lida no Rust** com `on_document_title_changed` (Tauri 2.12), sem IPC; a página remota só pode chamar `notify` e `open_settings`.
- **Notificações via `notify-rust`** em vez de `tauri-plugin-notification`, porque o plugin não informa cliques no desktop. Clicar na notificação restaura a janela e abre a conversa.
- **Configurações em JSON próprio** (`~/.config/com.whatsapp.linux.native/settings.json`) em vez de `tauri-plugin-store`.
- **Tela offline em HTML estático** (`src-tauri/assets/offline.html`), carregada pelo sinal `load-failed` do WebKitGTK, em vez de uma rota React.
- **Microfone e câmera** liberados com `on_permission_request` (Tauri 2.12), só para `web.whatsapp.com`.
- **Navegação**: links externos abrem no navegador apenas via `target="_blank"` (`on_new_window`); navegações da janela principal para fora do WhatsApp são bloqueadas sem abrir nada, pois o handler também dispara para iframes.
- **Logs** com `tauri-plugin-log` (terminal + `~/.local/share/com.whatsapp.linux.native/logs`).
- **Notificações com resposta** desenhadas pelo próprio app (`src-tauri/src/toast.rs` + `src/Toasts.tsx`): cartões no canto superior direito com avatar e campo "Responder". O servidor de notificações do GNOME 50 não tem `inline-reply`, então a notificação nativa ficou como alternativa (configuração "Notificações com resposta" e "Não perturbe" do GNOME). A resposta é enviada pela janela principal, mesmo escondida (`inject/reply.ts`), conferindo o cabeçalho da conversa antes de escrever.
- **XWayland por padrão** (`GDK_BACKEND=x11`, desligável com `WA_WAYLAND=1`): no Wayland o GNOME não permite posicionar os cartões. Com escala 1 e `xwayland-native-scaling` não há perda de nitidez.
- **Chamadas de voz e vídeo no navegador padrão**: o WebKitGTK do Ubuntu é compilado sem WebRTC, e um WebKitGTK próprio com LibWebRTC foi descartado (horas de compilação; o Karere tentou o mesmo e migrou para CEF). Os botões de chamada são interceptados (`inject/calls.ts`) e há o item "Abrir no navegador (chamadas)" na bandeja.
- **User-Agent padrão do WebKit (Safari)**, com os quirks do WebKitGTK ligados; um User-Agent personalizado desliga os quirks para valer de fato.

Como rodar: `npm install`, depois `npm run tauri dev` (desenvolvimento) ou `npm run tauri build` (gera `.deb` e AppImage em `src-tauri/target/release/bundle/`).

---

## 0. Ajustes necessários à especificação

Antes de implementar, os pontos abaixo da especificação precisam ser corrigidos, pois não funcionariam como descritos.

| # | Ponto da spec | Problema | Decisão |
|---|---------------|----------|---------|
| 1 | `<iframe src="https://web.whatsapp.com">` no `App.tsx` (2.4) | O WhatsApp Web envia `X-Frame-Options`/CSP `frame-ancestors`, bloqueando a incorporação em iframe. A página não carregaria. | A janela principal carrega `https://web.whatsapp.com` **diretamente** na WebView (URL externa). CSS e JS são injetados via `initialization_script` no Rust. |
| 2 | Injeção de CSS pelo React escutando `tauri://webview-created` (2.4) | O React não roda dentro da página remota; não há como injetar a partir dele. | Criar um **bundle de injeção** (TS + CSS) compilado pelo Vite e embutido no binário Rust com `include_str!`. |
| 3 | `tauri.conf.json` com chave `"v2"` e `permissions` (2.3) | Esse formato não existe no Tauri v2. Janelas ficam em `app.windows`; permissões ficam em arquivos de *capabilities*. `core:notification` não existe (é plugin). | Usar o schema v2 correto (ver seção 3) e `src-tauri/capabilities/*.json`. |
| 4 | Seletores CSS ofuscados (`._209_f`, `._1X4S1`) (3.3) | As classes do WhatsApp Web mudam a cada deploy; os overrides quebrariam com frequência. | Priorizar seletores estáveis (`[data-testid]`, `[role]`, `[aria-label]`, `#app`, `#side`, `#main`) e centralizar seletores num único módulo versionado. |
| 5 | `src-tauri/src/main.rs` como único arquivo | Tauri v2 usa `lib.rs` + `main.rs`; tudo em um arquivo fica difícil de manter. | Separar em módulos (`tray.rs`, `badge.rs`, `notifications.rs`, etc.). |
| 6 | Paleta com três verdes (`#00a884`, `#107c41`, `#005a4e`) (3.1) | Ambíguo para implementação. | Definir tokens: `accent = #00a884` (ícones/realces ativos), `accent-strong = #005a4e` (botões primários). `#107c41` descartado. |
| 7 | `rounded-md (8px)` (3.2) | No Tailwind, `rounded-md` = 6px; `rounded-lg` = 8px. | Usar `rounded-lg` (8px) para cards/inputs e `rounded-md`/`rounded-lg` com `shadow-xl` para menus, conforme fidelidade ao Windows 11. |
| 8 | User-Agent fixo do Edge 122 | UA desatualizado tende a disparar aviso de “navegador não suportado” com o tempo. | UA configurável (padrão: Edge/Chromium recente) e revisado a cada release. |
| 9 | Respostas rápidas em notificações | `tauri-plugin-notification` não suporta ações no desktop; GNOME não suporta resposta inline. | Fase 1: notificação nativa com clique que foca a conversa. Resposta rápida vira item “best effort” futuro via `notify-rust` (funciona em KDE). |
| 10 | Mica material (3.1) | Não existe Mica no Linux/WebKitGTK. | Simular com cores sólidas em camadas da paleta. |

---

## 1. Arquitetura revisada

```
+--------------------------------------------------------------------+
|                         TAURI CORE (Rust)                          |
|  Janela principal • Tray • Badge (Unity LauncherEntry/D-Bus)       |
|  Notificações • Single instance • Window state • Downloads • Links |
+--------------------------------------------------------------------+
        ▲ invoke() (IPC restrito)          │ initialization_script
        │                                  ▼ (inject.js com CSS embutido)
+--------------------------------------------------------------------+
|  WebView "main" → https://web.whatsapp.com (remota)                |
|   • Override de CSS (Fluent / Windows 11)                          |
|   • Ponte de notificações (substitui window.Notification)          |
|   • Observador do <title> → contagem de não lidas                  |
|   • (Opcional) barra de título e nav rail estilo Windows 11        |
+--------------------------------------------------------------------+
+--------------------------------------------------------------------+
|  WebView "settings" → app local React + Tailwind                   |
|   • Configurações, Sobre, tela offline/erro                        |
+--------------------------------------------------------------------+
```

Princípios:

- **A página remota recebe o mínimo de IPC possível.** A capability remota libera apenas os comandos próprios do app (ex.: `set_unread_count`, `notify`), nunca filesystem ou shell.
- **React + Tailwind** são usados nas telas locais (configurações, sobre, offline). Os tokens do styleguide são compartilhados entre o Tailwind e o CSS injetado (via variáveis CSS).
- **Nada de protocolo próprio**: toda comunicação com o WhatsApp passa pelo WhatsApp Web (requisito 1.3 da spec).

### 1.1 Estrutura de pastas proposta

```text
whatsapp-linux-native/
├── package.json
├── vite.config.ts                 # build da UI local (settings/about/offline)
├── vite.inject.config.ts          # build do bundle de injeção (IIFE único)
├── tailwind.config.ts             # tokens do styleguide
├── src/                           # UI local (React)
│   ├── main.tsx
│   ├── App.tsx                    # roteia: /settings, /about, /offline
│   ├── components/                # componentes estilo Windows 11
│   ├── pages/
│   └── styles/
│       ├── tokens.css             # variáveis CSS compartilhadas (cores, raios, fonte)
│       └── index.css
├── inject/                        # código executado DENTRO do web.whatsapp.com
│   ├── index.ts                   # ponto de entrada (aplica CSS, inicia módulos)
│   ├── selectors.ts               # seletores centralizados e estáveis
│   ├── styles/whatsapp-override.css
│   ├── unread.ts                  # observa <title> e envia contagem
│   ├── notifications.ts           # shim de window.Notification → Rust
│   ├── links.ts                   # intercepta window.open / links externos
│   └── titlebar.ts                # (opcional) barra de título customizada
├── dist-inject/inject.js          # gerado; embutido no Rust via include_str!
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   ├── local.json             # permissões da UI local
    │   └── remote-whatsapp.json   # permissões mínimas para web.whatsapp.com
    ├── icons/
    └── src/
        ├── main.rs                # chama lib::run()
        ├── lib.rs                 # Builder, plugins, setup
        ├── window.rs              # criação da janela principal
        ├── tray.rs
        ├── badge.rs
        ├── notifications.rs
        ├── commands.rs            # comandos IPC expostos
        ├── settings.rs            # persistência de preferências
        └── webkit.rs              # ajustes WebKitGTK (mídia, permissões, spellcheck)
```

---

## 2. Fases de implementação

### Fase 0 — Ambiente e scaffold

**Tarefas**
1. Instalar dependências do Ubuntu: `build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`, além de `gstreamer1.0-plugins-good`/`-bad` e `gstreamer1.0-libav` (áudio e vídeo no WebKitGTK).
2. Instalar Rust estável (rustup), Node LTS e pnpm (ou npm).
3. Criar o projeto: `pnpm create tauri-app` (template React + TypeScript), adicionar Tailwind CSS.
4. Inicializar Git, `.gitignore`, ESLint, Prettier, `rustfmt` e `clippy`.
5. Reorganizar as pastas conforme a seção 1.1 e criar `vite.inject.config.ts`.

**Critério de aceite:** `pnpm tauri dev` abre uma janela com a UI React padrão; `cargo clippy` e `pnpm lint` passam sem erros.

---

### Fase 1 — Janela principal carregando o WhatsApp Web

**Tarefas**
1. Remover a janela declarativa do `tauri.conf.json` (`app.windows: []`) e criar a janela `main` no `setup` via `WebviewWindowBuilder` com `WebviewUrl::External("https://web.whatsapp.com")`.
2. Configurar: título, `1024x768`, mínimo `680x500`, `decorations: true` e `.user_agent(...)` (UA do Edge/Chromium, lido das configurações).
3. Garantir a **persistência da sessão** (cookies, IndexedDB, service worker) no diretório de dados do app (`~/.local/share/com.whatsapp.linux.native`), para não pedir o QR code a cada abertura.
4. **Links externos**: `on_navigation` permite apenas `web.whatsapp.com` e domínios necessários (`*.whatsapp.net`, `*.whatsapp.com`); qualquer outro é aberto no navegador padrão com `tauri-plugin-opener`. Interceptar também `window.open` (módulo `inject/links.ts`).
5. Habilitar atalhos de zoom (`zoom_hotkeys_enabled(true)`).
6. Tela de **offline/erro**: se o carregamento falhar, exibir a página local `/offline` (React) com botão “Tentar novamente”.

**Critério de aceite:** o app abre direto no WhatsApp Web sem aviso de navegador não suportado; após ler o QR code e reiniciar o app, a sessão continua ativa; links clicados em conversas abrem no navegador do sistema.

Esboço do builder:

```rust
let main = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(WA_URL.parse()?))
    .title("WhatsApp")
    .inner_size(1024.0, 768.0)
    .min_inner_size(680.0, 500.0)
    .user_agent(&settings.user_agent)
    .initialization_script(include_str!("../../dist-inject/inject.js"))
    .disable_drag_drop_handler()
    .zoom_hotkeys_enabled(true)
    .on_navigation(|url| navigation::is_allowed(url))
    .on_download(downloads::handle)
    .build()?;
```

---

### Fase 2 — Pipeline de injeção e override de CSS

**Tarefas**
1. Configurar `vite.inject.config.ts` para gerar um único `dist-inject/inject.js` (formato IIFE), com o CSS importado como string (`import css from './styles/whatsapp-override.css?inline'`).
2. Encadear os builds: `beforeDevCommand`/`beforeBuildCommand` executam o build de injeção antes do Rust compilar (o `include_str!` exige o arquivo pronto).
3. `inject/index.ts`: aguardar `DOMContentLoaded`, inserir um `<style id="wa-native-override">` e reaplicá-lo se o WhatsApp recriar o `<head>` (MutationObserver leve).
4. Escrever `whatsapp-override.css` conforme o styleguide (seção 3.3 da spec) usando os seletores estáveis de `selectors.ts`:
   - fundo `#202020` no container e remoção da faixa verde superior;
   - scrollbar fina de 4px (`#454545`, raio 2px, trilho transparente);
   - fonte `Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif` (com fallback para `Cantarell`/`Ubuntu` quando a Segoe UI não estiver instalada);
   - tema escuro forçado (`body { background: #202020; color: #fff }`).
5. Expor as variáveis CSS (`--wa-bg`, `--wa-chat-bg`, `--wa-accent`…) a partir de `src/styles/tokens.css`, compartilhadas com o Tailwind.
6. Criar uma página de diagnóstico (modo dev) que liste quais seletores de `selectors.ts` foram encontrados no DOM, para detectar rapidamente quando o WhatsApp mudar a estrutura.

**Critério de aceite:** o WhatsApp Web aparece com a paleta escura do styleguide e a scrollbar fina; alterar o CSS e rodar `pnpm tauri dev` reflete a mudança; nenhum erro de console originado do script injetado.

---

### Fase 3 — Integração com o sistema (tray, badge, notificações)

**3.1 System Tray**
1. Ativar a feature `tray-icon` do crate `tauri` e criar o tray com `TrayIconBuilder`.
2. Menu: **Mostrar/Ocultar**, **Configurações**, separador, **Sair**.
3. No Linux (AppIndicator) o tray **não emite eventos de clique**, só de menu. Por isso “Mostrar/Ocultar” precisa ser o primeiro item do menu.
4. Ícone do tray com variante “com mensagens não lidas” (ponto verde), trocado conforme a contagem.

**3.2 Minimizar para a bandeja**
1. Em `WindowEvent::CloseRequested`: `api.prevent_close()` + `window.hide()` (quando a opção “Fechar para a bandeja” estiver ativa; padrão: ligada).
2. “Sair” no tray encerra de fato (`app.exit(0)`).

**3.3 Badge de não lidas no Dock do Ubuntu**
1. `inject/unread.ts`: observar o `<title>` (formato `(N) WhatsApp`) com MutationObserver, extrair N e chamar `invoke('set_unread_count', { count })` somente quando o valor mudar.
2. `badge.rs`: chamar `window.set_badge_count(Some(n))`/`None`. No Linux isso usa a API Unity LauncherEntry via D-Bus, que o Dock do Ubuntu suporta.
3. Requisito: o arquivo `.desktop` instalado precisa corresponder ao identificador do app (e ter `StartupWMClass` correto), senão o Dock não associa o badge. Validar com o pacote `.deb` instalado, não apenas em `tauri dev`.
4. Atualizar também o título da janela e o ícone do tray.

**3.4 Notificações nativas**
1. Adicionar `tauri-plugin-notification`.
2. `inject/notifications.ts`: substituir `window.Notification` por um shim que:
   - reporta `Notification.permission = "granted"` e resolve `requestPermission()` com `"granted"`;
   - no construtor, envia título, corpo e tag para `invoke('notify', …)`;
   - mantém o objeto retornado compatível (`onclick`, `close()`), para o WhatsApp não quebrar.
3. No Rust: não notificar quando a janela estiver focada e visível (opcional, configurável).
4. **Clique na notificação** → mostrar e focar a janela. Abrir a conversa específica é um item de melhoria: o shim guarda o `onclick` original pela `tag` e o dispara quando o Rust avisar.
5. Respostas rápidas ficam para o backlog (ver seção 0, item 9).

**3.5 Instância única e estado da janela**
1. `tauri-plugin-single-instance`: abrir o app de novo apenas mostra e foca a janela existente.
2. `tauri-plugin-window-state`: lembrar tamanho, posição e estado maximizado.

**Critério de aceite:** fechar a janela a esconde no tray e o menu “Mostrar” a restaura; mensagens novas geram notificação nativa do GNOME e badge numérico no Dock (com o `.deb` instalado); abrir o app duas vezes não cria duas janelas.

---

### Fase 4 — Mídia, anexos e comportamento de navegador

1. **Arrastar e soltar arquivos**: usar `.disable_drag_drop_handler()`, senão o Tauri intercepta o drop e o WhatsApp não recebe os arquivos.
2. **Downloads**: no `on_download`, salvar em `~/Downloads` (XDG) evitando sobrescrever arquivos e emitir notificação “Download concluído” com opção de abrir a pasta.
3. **Microfone (mensagens de voz) e câmera**: em `webkit.rs`, usar `with_webview` para acessar a `WebKitWebView` e:
   - habilitar `enable-media-stream` / `enable-webrtc` nas configurações do WebKit;
   - tratar o sinal `permission-request` concedendo `UserMediaPermissionRequest` **apenas** para a origem `web.whatsapp.com`.
4. **Colar imagens** (Ctrl+V) e copiar texto: validar o funcionamento nativo do WebKitGTK.
5. **Corretor ortográfico**: ativar o spellcheck do WebKitGTK com `pt_BR` e `en_US` (configurável).
6. **Menu de contexto**: manter o nativo e remover “Inspecionar elemento” em builds de release.

**Critério de aceite:** é possível arrastar uma imagem para uma conversa, gravar e enviar um áudio, baixar um documento para `~/Downloads` e colar uma captura de tela.

---

### Fase 5 — Fidelidade visual Windows 11 (Fluent)

1. **Tokens finais** no `tailwind.config.ts` e em `tokens.css`:
   - `bg-window #202020`, `bg-chat #2c2c2c`, `bubble-in #202c33`, `bubble-out #005c4b`;
   - `accent #00a884`, `accent-strong #005a4e`, `text-primary #ffffff`, `text-secondary #a1a1a1`.
2. **Overrides no WhatsApp Web** (via `whatsapp-override.css`):
   - item de chat em hover/ativo: fundo `#2d2d2d` + barra vertical de 4px `#00a884` à esquerda;
   - inputs e cards com raio de 8px; menus suspensos com raio de 8px e `shadow-xl`;
   - balões de mensagem nas cores do styleguide;
   - cabeçalhos do painel lateral e da conversa no tom `#202020`, sem bordas fortes.
3. **(Opcional) Barra de título estilo Windows 11**: `decorations: false` + barra injetada via `inject/titlebar.ts` com área de arraste (`startDragging`) e botões minimizar/maximizar/fechar. Exige liberar na capability remota só `core:window:allow-start-dragging`, `allow-minimize`, `allow-toggle-maximize` e `allow-close`. Fica atrás de uma opção nas configurações, porque no GNOME a decoração nativa costuma ser preferível.
4. **(Opcional) Nav rail lateral** (Conversas, Status, Canais, Comunidades, Configurações), como no app do Windows, reutilizando os botões existentes do WhatsApp Web.
5. **Tema claro**: respeitar a preferência do sistema (`prefers-color-scheme`) com uma paleta clara equivalente. Prioridade baixa; o escuro é o foco da spec.
6. Comparar capturas de tela lado a lado com o app oficial do Windows 11 e ajustar espaçamentos, tamanhos de fonte e raios.

**Critério de aceite:** checklist visual aprovado em comparação com capturas do app do Windows 11 (lista de chats, conversa aberta, menus, configurações).

---

### Fase 6 — Tela de configurações (React + Tailwind)

1. Janela secundária `settings` (UI local), aberta pelo tray e por um atalho (`Ctrl+,`).
2. Opções persistidas com `tauri-plugin-store`:
   - fechar para a bandeja; iniciar minimizado;
   - iniciar com o sistema (`tauri-plugin-autostart`);
   - notificações: ligadas/desligadas, silenciar quando a janela estiver em foco, mostrar prévia do texto;
   - User-Agent personalizado (avançado), com botão “Restaurar padrão”;
   - barra de título customizada (opcional da Fase 5);
   - idioma do corretor ortográfico.
3. Página **Sobre**: versão, link do repositório e aviso de que o projeto não é oficial.
4. Componentes no estilo Windows 11 (toggle switch, cards de configuração, botões) em `src/components/`.

**Critério de aceite:** todas as opções persistem entre reinícios e entram em vigor (algumas, como o UA, após recarregar a página).

---

### Fase 7 — Ícones, empacotamento e distribuição

1. **Ícone**: com o PNG fonte (≥ 1024×1024, fundo transparente), rodar `pnpm tauri icon caminho/icone.png` para gerar todos os tamanhos em `src-tauri/icons` (conforme 3.4 da spec). Criar também as variantes do tray (normal e com não lidas).
2. **Bundles Linux**: `.deb` (prioritário para Ubuntu) e `AppImage`. Avaliar `.rpm` e Flatpak depois.
3. Arquivo `.desktop`: `Name=WhatsApp`, `Categories=Network;InstantMessaging;Chat;`, `StartupWMClass` coerente com o identificador (necessário para o badge e o agrupamento no Dock).
4. Declarar no `.deb` as dependências de runtime (`libwebkit2gtk-4.1-0`, `libayatana-appindicator3-1`, plugins GStreamer).
5. **Atualizações**: avaliar `tauri-plugin-updater` (funciona com AppImage); para o `.deb`, um repositório APT ou aviso de nova versão.
6. **CI (GitHub Actions)**: em cada PR rodar lint, testes, `cargo clippy` e build; nas tags `v*`, gerar `.deb` e `AppImage` como artefatos de release (runner `ubuntu-22.04` para compatibilidade de glibc).

**Critério de aceite:** o `.deb` instala no Ubuntu 22.04 e 24.04 limpos, aparece no menu de aplicativos com o ícone correto, fixa no Dock e mostra o badge.

---

### Fase 8 — Qualidade, desempenho e hardening

1. **Testes automatizados**
   - `inject/`: Vitest + jsdom para a extração da contagem do título, o shim de notificações e a interceptação de links.
   - Rust: testes unitários de `navigation::is_allowed`, da lógica de badge e de settings.
2. **Checklist manual de regressão** (a cada release): login com QR, envio de texto/imagem/áudio/documento, notificações, badge, tray, reinício com sessão persistida, links externos, downloads.
3. **Segurança**
   - capability remota restrita a `https://web.whatsapp.com` e só aos comandos do app;
   - nunca expor `fs`, `shell` ou `opener` arbitrário à página remota (o Rust valida as URLs antes de abrir);
   - CSP aplicada à UI local; DevTools desabilitado em release.
4. **Desempenho**: medir RAM/CPU em repouso e comparar com Electron (ex.: WhatsApp for Linux/whatsdesk), cumprindo o objetivo da spec. Meta inicial: menos de 50% da memória de um cliente Electron equivalente.
5. **Robustez contra mudanças do WhatsApp Web**: a página de diagnóstico de seletores (Fase 2) e uma rotina de verificação antes de cada release.

---

## 3. Configuração Tauri v2 corrigida

`src-tauri/tauri.conf.json` (a janela principal é criada no código):

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "WhatsApp Desktop",
  "version": "1.0.0",
  "identifier": "com.whatsapp.linux.native",
  "build": {
    "beforeDevCommand": "pnpm build:inject && pnpm dev",
    "beforeBuildCommand": "pnpm build:inject && pnpm build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [],
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["deb", "appimage"],
    "category": "SocialNetworking",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.png"],
    "linux": {
      "deb": {
        "depends": ["libwebkit2gtk-4.1-0", "libayatana-appindicator3-1", "gstreamer1.0-plugins-good"]
      }
    }
  }
}
```

`src-tauri/capabilities/remote-whatsapp.json` (permissões mínimas para a página remota):

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "remote-whatsapp",
  "windows": ["main"],
  "remote": { "urls": ["https://web.whatsapp.com"] },
  "permissions": [
    "allow-set-unread-count",
    "allow-notify"
  ]
}
```

As permissões `allow-set-unread-count` e `allow-notify` são geradas no `build.rs` declarando os comandos do app: `tauri_build::try_build(Attributes::new().app_manifest(AppManifest::new().commands(&["set_unread_count", "notify"])))`.

`src-tauri/capabilities/local.json` (UI local de configurações):

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "local",
  "windows": ["settings"],
  "permissions": [
    "core:default",
    "store:default",
    "autostart:default",
    "notification:default"
  ]
}
```

Plugins previstos (`Cargo.toml` / `package.json`): `tauri` (feature `tray-icon`), `tauri-plugin-notification`, `tauri-plugin-opener`, `tauri-plugin-single-instance`, `tauri-plugin-window-state`, `tauri-plugin-store`, `tauri-plugin-autostart`, `webkit2gtk` (para os ajustes de `webkit.rs`) e, opcionalmente, `tauri-plugin-updater`.

---

## 4. Riscos e mitigação

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| WhatsApp Web passa a bloquear o WebKitGTK mesmo com UA falso | Alto | UA atualizável pelas configurações; testar a cada release; manter canal rápido de patch. |
| Mudanças no DOM quebram os overrides de CSS | Médio | Seletores estáveis centralizados, página de diagnóstico e CSS que degrada sem quebrar (só cor e espaçamento). |
| Badge não aparece no Dock | Médio | Conferir `.desktop` e `StartupWMClass`; testar sempre com o pacote instalado. |
| Microfone ou WebRTC indisponível em algumas distribuições | Médio | Ajustes do WebKit em `webkit.rs`, dependências GStreamer no `.deb`; chamadas continuam fora do escopo da fase 1. |
| Exposição de IPC à página remota | Alto | Capability remota com apenas dois comandos próprios, validação de entrada no Rust. |
| Uso de nome e logo “WhatsApp” | Médio (legal) | Deixar claro em “Sobre” que o projeto não é oficial; avaliar nome e ícone próprios antes de distribuir publicamente. |
| Tray sem ícone em GNOME sem extensão AppIndicator | Baixo | Detectar a ausência e desativar “fechar para a bandeja” automaticamente; documentar a extensão (já vem no Ubuntu). |

---

## 5. Backlog pós-v1 (fora do escopo da fase 1)

- Chamadas de áudio e vídeo (WebRTC no WebKitGTK), conforme 1.3 da spec.
- Resposta rápida em notificações via `notify-rust` (KDE/Plasma).
- Múltiplas contas (perfis de dados separados por janela).
- Tema claro completo e cor de destaque configurável.
- Flatpak e Snap.

---

## 6. Ordem sugerida e estimativa

| Fase | Entrega | Estimativa |
|------|---------|------------|
| 0 | Ambiente e scaffold | 0,5 dia |
| 1 | WhatsApp Web carregando, sessão persistente, links externos | 1–2 dias |
| 2 | Pipeline de injeção e CSS base | 1–2 dias |
| 3 | Tray, badge, notificações, instância única | 3–4 dias |
| 4 | Mídia, anexos e downloads | 2–3 dias |
| 5 | Fidelidade visual Windows 11 | 3–5 dias |
| 6 | Tela de configurações | 2 dias |
| 7 | Ícones, empacotamento e CI | 1–2 dias |
| 8 | Testes, segurança e desempenho | 2–3 dias |

Total estimado: **~3 a 4 semanas** para uma pessoa. As fases 1 a 3 formam o MVP utilizável no dia a dia; as fases seguintes adicionam a fidelidade visual e o acabamento.
