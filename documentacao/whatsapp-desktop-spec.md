# 📱 Projeto: WhatsApp Desktop para Linux (Ubuntu Nativo)
Esse documento reúne as Especificações de Escopo (SRS), a Arquitetura Técnica e o Guia de Estilo (Styleguide) para a criação de um cliente nativo leve do WhatsApp baseado em Tauri, React e Tailwind CSS, espelhando a experiência do Windows 11.

---

## 📄 Documento 1: Especificações e Escopo (SRS)

### 1.1 Objetivo do Projeto
Desenvolver um cliente de desktop nativo para Linux (Ubuntu) baseado no WhatsApp Web, utilizando **Tauri**, **React** e **Tailwind CSS**. O objetivo principal é replicar com precisão cirúrgica a experiência visual, a fluidez e os recursos do aplicativo oficial do WhatsApp para Windows 11, superando as limitações de consumo de hardware do Electron.

### 1.2 Escopo de Recursos (Features)
*   **Encapsulamento de Alta Performance:** Carregamento do WhatsApp Web sem bordas de navegador, utilizando o motor WebKitGtk via Tauri.
*   **Simulação de Ambiente (User-Agent Spoofer):** Mascaramento do User-Agent para uma versão recente do Windows/Edge, liberando recursos ocultos da interface web.
*   **Integração com o Sistema Operacional Linux:**
    *   Exibição de balão de contagem de mensagens não lidas (*badge count*) no Dock do Ubuntu.
    *   Notificações nativas do sistema com suporte a respostas rápidas (se disponível no ambiente desktop).
    *   Minimizar para a bandeja do sistema (*System Tray*) com menu de contexto rápido.
*   **Customização Estética:** Injeção de estilos customizados (CSS) para remover elementos web redundantes e aplicar o visual *Fluent Design* do Windows.

### 1.3 Fora de Escopo (Out of Scope)
*   **Engenharia Reversa do Protocolo:** O app não fará conexões diretas aos servidores do WhatsApp sem passar pelo WhatsApp Web (evitando banimentos da conta).
*   **Chamadas de Áudio/Vídeo Nativo (Fase 1):** Devido a limitações do WebKitGtk com WebRTC em algumas distribuições, chamadas de voz e vídeo ficam em segundo plano para correções futuras, focando primeiro na interface e mensagens.

---

## 📐 Documento 2: Arquitetura Técnica

### 2.1 Visão Geral do Sistema
O projeto utiliza a arquitetura isolada do Tauri v2, dividida em duas camadas principais: Core (Rust) e Interface (React).

```
+-------------------------------------------------------------+
|                      TAURI CORE (Rust)                      |
|  - Gerenciamento de Janelas  - System Tray  - Notificações  |
+-------------------------------------------------------------+
                              │ ▲
          Comunicação IPC     │ │  Injeção de Scripts / CSS
          (Tauri Bridges)     ▼ │
+-------------------------------------------------------------+
|                   INTERFACE DE RENDERIZAÇÃO                 |
|  [Camada React + Tailwind]  ──> [Webview: WhatsApp Web]     |
+-------------------------------------------------------------+
```

### 2.2 Estrutura do Projeto
```text
whatsapp-linux-native/
├── src-tauri/                 # Código nativo em Rust (Backend)
│   ├── src/main.rs            # Inicialização e configuração do ciclo de vida
│   └── tauri.conf.json        # Configurações de permissões e janelas
├── src/                       # Interface e Injeção (Frontend)
│   ├── components/            # Componentes de UI simulados do Windows
│   ├── styles/
│   │   └── whatsapp-override.css # CSS injetado diretamente no WhatsApp Web
│   ├── App.tsx                # Ponto de entrada do React
│   └── main.tsx
```

### 2.3 Configuração Crítica do Tauri (`tauri.conf.json`)
Aqui forçamos as dimensões iniciais, removemos a decoração padrão se necessário (para criar uma barra de título customizada) e preparamos os recursos de sistema.

```json
{
  "productName": "WhatsApp Desktop",
  "version": "1.0.0",
  "identifier": "com.whatsapp.linux.native",
  "v2": {
    "window": {
      "title": "WhatsApp",
      "width": 1024,
      "height": 768,
      "minWidth": 680,
      "minHeight": 500,
      "decorations": true,
      "transparent": false,
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0"
    },
    "permissions": [
      "core:default",
      "core:notification",
      "core:tray"
    ]
  }
}
```

### 2.4 Script de Injeção (Estratégia para UI Overrides)
No `App.tsx`, monitoramos o carregamento da WebView do WhatsApp para injetar o Guia de Estilo do Windows:

```typescript
import { useEffect } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export default function App() {
  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    
    // Escuta quando a página terminar de carregar para injetar nossas correções visuais
    webview.listen('tauri://webview-created', () => {
      // Código para injetar o arquivo whatsapp-override.css personalizado
    });
  }, []);

  return (
    <div className="w-screen h-screen bg-[#202020] text-white">
      {/* Aqui o Tauri renderiza o conteúdo do web.whatsapp.com */}
      <iframe src="https://web.whatsapp.com" className="w-full h-full border-none" />
    </div>
  );
}
```

---

## 🎨 Documento 3: Guia de Estilo (Styleguide)

Para atingir a fidelidade visual do aplicativo do Windows 11 (construído em XAML/WinUI 3), devemos aplicar os seguintes padrões de design através do Tailwind CSS e da injeção de estilos.

### 3.1 Paleta de Cores (Fiel ao Windows 11 Dark Mode)
O aplicativo do Windows utiliza o conceito de superfícies em camadas (Mica material).

*   **Fundo Principal (Sidebar/Janela):** `#202020` (Tailwind: `bg-[#202020]`)
*   **Fundo do Chat (Área de Leitura):** `#2c2c2c` (Tailwind: `bg-[#2c2c2c]`)
*   **Verde Assinatura (Destakes e Ícones ativos):** `#00a884` ou o Verde Windows `#107c41` (Usaremos o `#005a4e` para botões primários discretos).
*   **Balão de Mensagem Recebida:** `#202c33`
*   **Balão de Mensagem Enviada:** `#005c4b`
*   **Texto Principal:** `#ffffff` (Alta ênfase)
*   **Texto Secundário:** `#a1a1a1` (Média ênfase)

### 3.2 Tipografia e Elementos Visuais
*   **Fonte do Sistema:** `Segoe UI`, `-apple-system`, `BlinkMacSystemFont`, sans-serif.
*   **Bordas e Cantos:** O Windows 11 padroniza cantos arredondados finos para elements internos.
    *   Cards e inputs: `rounded-md` (8px).
    *   Menus suspensos: `rounded-lg` (4px a 8px com sombra suave `shadow-xl`).
*   **Efeito de Hover (Seleção de Chat):** No Windows, o item selecionado ou sob o mouse ganha um fundo cinza sutil e uma pequena barra vertical à esquerda.
    *   Classe Tailwind para item ativo: `bg-[#2d2d2d] border-l-4 border-[#00a884]`.

### 3.3 Estrutura de Substituição de CSS (`whatsapp-override.css`)
Este código deve ser forçado na WebView para esconder o cabeçalho verde padrão do WhatsApp Web e adotar o minimalismo do app do Windows:

```css
/* Remove a barra verde superior clássica da Web */
._209_f, .app-wrapper-web ._1X4S1 {
    background-color: #202020 !important;
    border-top: none !important;
}

/* Customiza a barra de rolagem para o padrão fino do Windows 11 */
::-webkit-scrollbar {
    width: 4px !important;
    height: 4px !important;
}
::-webkit-scrollbar-thumb {
    background: #454545 !important;
    border-radius: 2px !important;
}
::-webkit-scrollbar-track {
    background: transparent !important;
}

/* Força o tema escuro nativo do container */
body {
    background-color: #202020 !important;
    color: #ffffff !important;
}
```

### 3.4 Substituição do Ícone
Como você mencionou que possui o ícone que vai compartilhar, o Tauri exige que as imagens estejam no formato `.png` e `.ico` (para compatibilidade interna) dentro da pasta `src-tauri/icons`. Assim que você tiver o arquivo, faremos a substituição dos arquivos padrões (`icon.png`, `128x128.png`, etc.) usando o utilitário do próprio Tauri para gerar todos os tamanhos automaticamente.