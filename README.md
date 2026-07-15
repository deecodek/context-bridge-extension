# AI Bridge — Universal Context Relay
### Chrome Extension for Seamless AI Conversation Continuity

**Version 2.0** — Now with multi-model support, enhanced UI, and 7+ AI providers!

---

## 🚀 Overview

AI Bridge is a Chrome extension that acts as a **universal context bridge** between AI providers. When you hit token limits, want a second opinion, or need to switch platforms, AI Bridge:

1. **Passively captures** your conversation from 7+ AI providers
2. **Compresses & stores** the full context locally using LZ-based compression
3. **Intelligently summarizes** your conversation using Gemini, OpenAI, or Anthropic APIs
4. **Auto-injects** the formatted context into your chosen target AI

---

## ✨ What's New in v2.0

### 🎨 Enhanced UI
- **Light/Dark Theme Toggle** — Switch between dark and light modes
- **Search & Filter** — Find sessions quickly with full-text search and provider filters
- **Favorites** — Star important sessions for quick access
- **Better Visual Hierarchy** — Improved spacing, animations, and feedback
- **Toast Notifications** — Clear feedback for all actions

### 🤖 Multi-Model Support
- **Gemini** — Gemini 2.0 Flash & Pro (default, free tier available)
- **OpenAI** — GPT-4o & GPT-4o Mini (requires OpenAI API key)
- **Anthropic** — Claude 3.5 Sonnet & Haiku (requires Anthropic API key)

### 📦 New Features
- **Export Sessions** — Export as Markdown or JSON
- **Token Estimation** — See estimated token count before processing
- **Backup/Restore** — Export and import your session data
- **Auto-Delete** — Automatically clean up old sessions
- **Keyboard Shortcuts** — Quick actions with keyboard (press `?` for help)
- **Storage Cleanup** — One-click storage management

### 🌐 More Providers
- **Microsoft Copilot** — Full capture and injection support
- **Mistral AI** — La Chat integration
- **HuggingFace Chat** — Open-source model conversations

---

## 📥 Installation

### From Chrome Web Store (Coming Soon)
1. Visit the Chrome Web Store
2. Click "Add to Chrome"

### Manual Installation (Development)
1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `llm-context-manager-extension` folder
5. The AI Bridge icon appears in your toolbar

---

## ⚙️ Setup (Required)

### Get API Keys

#### Gemini API (Required - Free tier available)
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Click the AI Bridge icon → Settings
4. Paste your API key and click **Save Settings**

#### OpenAI API (Optional)
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Add it in AI Bridge Settings

#### Anthropic API (Optional)
1. Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Create a new API key
3. Add it in AI Bridge Settings

---

## 📖 How to Use

### Automatic Capture
Simply open any supported AI platform and start chatting. AI Bridge automatically:
- Detects the conversation
- Extracts all messages in real-time
- Compresses and stores them locally
- Shows "Capturing" status in the popup

### Switching Providers
1. Click the **AI Bridge** toolbar icon
2. Use **Search** or **Filters** to find a session (or star it as Favorite)
3. Select a session from the list
4. Click **Continue Elsewhere** (or press `t`)
5. Choose a **Context Mode**:
   - **Coding** — Prioritizes code, architecture, technical implementations
   - **Debug** — Focuses on errors, stack traces, attempted fixes
   - **Ideas** — Preserves brainstorming threads and concepts
   - **Docs** — Tracks documentation progress and style decisions
   - **Research** — Organizes findings, sources, hypotheses
   - **General** — Balanced summary for any conversation
6. Select the **target AI provider** (7 options available)
7. Choose an **AI Model** (Gemini, GPT-4o, Claude, etc.)
8. Click **Process & Transfer**

AI Bridge will:
- Decompress your conversation
- Analyze it with the selected AI model
- Format the continuation prompt for your target provider
- Auto-inject it into the new chat window

### Export Sessions
1. Select a session
2. Click **Export** (or press `e`)
3. Choose format: **Markdown** or **JSON**

### Backup & Restore
1. Go to **Settings** → **Data Management**
2. Click **Backup** to export all sessions
3. Click **Restore** to import a backup file

---

## 🌐 Supported Platforms

| Platform | URL | Capture | Inject |
|----------|-----|---------|--------|
| ChatGPT | chatgpt.com | ✅ | ✅ |
| Claude | claude.ai | ✅ | ✅ |
| Gemini | gemini.google.com | ✅ | ✅ |
| Perplexity | perplexity.ai | ✅ | ✅ |
| Microsoft Copilot | copilot.microsoft.com | ✅ | ✅ |
| Mistral AI | chat.mistral.ai | ✅ | ✅ |
| HuggingFace Chat | huggingface.co/chat | ✅ | ✅ |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `s` | Focus search |
| `e` | Export session |
| `t` | Transfer session |
| `f` | Toggle favorite |
| `d` | Delete session |
| `j` / `k` | Navigate sessions (down/up) |
| `?` | Show help |
| `Esc` | Close modal |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                  AI BRIDGE v2.0 LAYERS              │
├─────────────────────────────────────────────────────┤
│  Content Scripts (Per Provider)                     │
│  └─ DOM observer → Message extraction → Core        │
├─────────────────────────────────────────────────────┤
│  Capture Core                                       │
│  └─ Classify → Code detection → Session management  │
├─────────────────────────────────────────────────────┤
│  Compressed Storage                                 │
│  └─ LZ-String Base64 → chrome.storage.local         │
│     Session index → Favorites → Provider cache      │
├─────────────────────────────────────────────────────┤
│  Intelligence Layer (Background Service Worker)     │
│  └─ Multi-model API (Gemini/OpenAI/Anthropic)       │
│     Auto-retry with exponential backoff             │
│     Mode-aware prompting                            │
├─────────────────────────────────────────────────────┤
│  Provider Adapter Layer                             │
│  └─ 7 provider formats with custom adapters         │
├─────────────────────────────────────────────────────┤
│  UI Layer (Enhanced Popup)                          │
│  └─ Theme toggle → Search → Filters → Export        │
│     Keyboard shortcuts → Toast notifications        │
└─────────────────────────────────────────────────────┘
```

---

## 🔒 Privacy

- **All conversation data** is stored locally in `chrome.storage.local`
- **Nothing is sent** to external servers except the selected AI API (your own key)
- **Enable "Local storage only"** in Settings to prevent any data leaving your device
- **Auto-delete** optionally removes old sessions after N days
- **Backup/Restore** gives you full control over your data
- Sessions are LZ-compressed to minimize storage usage (~60-80% reduction)

---

## 💾 Storage

- Each session is LZ-compressed before storage
- Maximum 20 sessions stored (oldest are automatically removed)
- Typical compressed session: 5-50 KB depending on conversation length
- View storage usage in Settings → Data Management
- **Backup** exports all data as JSON
- **Cleanup** removes all sessions with one click

---

## 🛠️ Troubleshooting

### Extension not capturing
Refresh the AI platform page after installing/updating the extension.

### Injection not working
Some AI platforms update their DOM structure. Use the **Copy** button in the Result view to manually paste the context.

### API errors
- **401/403**: Invalid API key — check your key in Settings
- **429**: Rate limit exceeded — wait a moment and try again
- **Network error**: Check your internet connection
- **Timeout**: Conversation too long — try a shorter session

### Session not found
Sessions persist across browser sessions. If a session disappears, it may have been auto-deleted (check Settings) or removed to make room for newer sessions.

### Theme not changing
Make sure you're clicking the theme toggle in the header (sun/moon icon).

---

## 📊 Technical Notes

**Why multi-model support?** Different AI models excel at different tasks. Gemini offers a generous free tier, GPT-4o provides excellent code understanding, and Claude excels at nuanced text analysis.

**Why auto-retry?** Network requests can fail temporarily. The extension automatically retries failed API calls with exponential backoff (up to 3 attempts).

**Why token estimation?** Knowing your token count helps you understand API costs and avoid hitting context limits.

---

## 🗺️ Roadmap

### Coming Soon
- [ ] Custom processing templates
- [ ] Selective message capture
- [ ] Conversation analytics dashboard
- [ ] Context menu integration
- [ ] Mobile companion app
- [ ] Cloud sync (encrypted, optional)

### Under Consideration
- [ ] Webhook support for automation
- [ ] REST API for external tools
- [ ] Voice command support
- [ ] Real-time collaboration

---

## 📝 Changelog

### v2.0.0 (2026)
**Major Update**
- ✨ Light/Dark theme toggle
- 🔍 Search and filter sessions
- ⭐ Favorites system
- 🤖 Multi-model support (Gemini, OpenAI, Anthropic)
- 📤 Export sessions as Markdown/JSON
- 💾 Backup/Restore functionality
- ⌨️ Keyboard shortcuts
- 🌐 Added Copilot, Mistral, HuggingFace support
- 🔄 Auto-retry with exponential backoff
- 📊 Token estimation
- 🗑️ Auto-delete old sessions
- 🎨 Enhanced UI with better animations

### v1.0.0 (Previous)
- Initial release
- Support for ChatGPT, Claude, Gemini, Perplexity
- Basic capture and transfer
- Gemini API integration

---

## 🙏 Credits

Built with:
- **LZ-String** — Compression library
- **Google Fonts** — Inter & Space Mono
- **Gemini API** — Default AI processing
- **OpenAI API** — Alternative processing
- **Anthropic API** — Alternative processing

---

## 📄 License

MIT License — See LICENSE file for details.

---

## 💬 Support

Found a bug or have a feature request? Please open an issue on the [GitHub repository](https://github.com/yourusername/llm-context-manager-extension).

**Made with ❤️ for the AI community**
