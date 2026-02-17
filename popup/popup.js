// AI Bridge — Popup Controller v2.0
// Enhanced with theme toggle, search, filters, export, multi-model support

const App = (function() {
  // ─── State ──────────────────────────────────────────────────────────────
  let state = {
    sessions: [],
    filteredSessions: [],
    selectedSessionId: null,
    selectedMode: 'coding',
    selectedProvider: null,
    currentSummary: null,
    formattedPrompt: null,
    targetUrl: null,
    settings: {},
    currentFilter: 'all',
    searchQuery: '',
    currentTabId: null,
    isCapturing: true,
    theme: 'dark',
    isLoading: true,
    searchTimeout: null,
    selectedTags: []
  };

  // ─── DOM Refs ────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const views = {
    main: $('viewMain'),
    transfer: $('viewTransfer'),
    processing: $('viewProcessing'),
    result: $('viewResult'),
    settings: $('viewSettings'),
    sessionDetails: $('viewSessionDetails')
  };

  // ─── Provider Helpers ───────────────────────────────────────────────────
  const PROVIDERS = {
    chatgpt: { name: 'ChatGPT', label: 'GPT', url: 'https://chatgpt.com' },
    claude: { name: 'Claude', label: 'CLD', url: 'https://claude.ai' },
    gemini: { name: 'Gemini', label: 'GEM', url: 'https://gemini.google.com' },
    perplexity: { name: 'Perplexity', label: 'PPL', url: 'https://www.perplexity.ai' },
    copilot: { name: 'Copilot', label: 'COP', url: 'https://copilot.microsoft.com' },
    mistral: { name: 'Mistral', label: 'MIS', url: 'https://chat.mistral.ai' },
    huggingface: { name: 'HuggingFace', label: 'HF', url: 'https://huggingface.co/chat' }
  };

  // ─── View Navigation ─────────────────────────────────────────────────────
  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      if (key === name) {
        el.classList.remove('slide-out');
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  // ─── Toast Notifications ────────────────────────────────────────────────
  function showToast(msg, type = 'info', duration = 2500) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'toast show';
    if (type === 'success') toast.classList.add('success');
    if (type === 'error') toast.classList.add('error');
    setTimeout(() => toast.classList.remove('show'), duration);
  }

  // ─── Time Helpers ───────────────────────────────────────────────────────
  function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    return Math.floor(diff / 604800000) + 'w ago';
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString();
  }

  // ─── Token Estimation ───────────────────────────────────────────────────
  function estimateTokens(text, model) {
    // More accurate estimation based on model
    // GPT-4: ~4 chars per token
    // Claude: ~4.5 chars per token
    // Gemini: ~4 chars per token
    let charsPerToken = 4;
    if (model?.includes('claude')) {
      charsPerToken = 4.5;
    }
    return Math.ceil(text.length / charsPerToken);
  }

  function calculateSessionTokens(sessionData, model) {
    if (!sessionData || !sessionData.messages) return 0;
    const totalText = sessionData.messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    // Add overhead for system prompt and formatting
    const overhead = 500;
    return overhead + estimateTokens(totalText, model);
  }

  // ─── Theme Management ───────────────────────────────────────────────────
  function loadTheme() {
    const saved = localStorage.getItem('aibridge_theme') || 'dark';
    state.theme = saved;
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeToggle();
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('aibridge_theme', state.theme);
    updateThemeToggle();
  }

  function updateThemeToggle() {
    // Theme toggle icon updates via CSS
  }

  // ─── Escape HTML ────────────────────────────────────────────────────────
  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Filter & Search ────────────────────────────────────────────────────
  function applyFilters() {
    let filtered = [...state.sessions];

    // Apply search
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        (s.title || '').toLowerCase().includes(query) ||
        (s.provider || '').toLowerCase().includes(query)
      );
    }

    // Apply category filter
    if (state.currentFilter !== 'all') {
      if (state.currentFilter === 'favorites') {
        filtered = filtered.filter(s => s.favorite);
      } else {
        filtered = filtered.filter(s => s.provider === state.currentFilter);
      }
    }

    state.filteredSessions = filtered;
    renderSessions();
  }

  // ─── Sessions Render ────────────────────────────────────────────────────
  function renderSessions() {
    const list = $('sessionsList');
    const sessions = state.filteredSessions;

    // Show loading skeleton
    if (state.isLoading) {
      list.innerHTML = `
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      `;
      return;
    }

    if (sessions.length === 0) {
      if (state.sessions.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="8" y="12" width="24" height="18" rx="4" stroke="currentColor" stroke-width="1.5"/>
                <path d="M14 18H28M14 23H24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M20 6V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </div>
            <p>No sessions yet</p>
            <span>Visit ChatGPT, Claude, Gemini, or Perplexity to start capturing</span>
          </div>
        `;
      } else {
        list.innerHTML = `
          <div class="empty-state">
            <p>No matching sessions</p>
            <span>Try adjusting your search or filters</span>
          </div>
        `;
      }
      $('transferBtn').disabled = true;
      $('exportBtn').disabled = true;
      return;
    }

    $('transferBtn').disabled = !state.selectedSessionId;
    $('exportBtn').disabled = !state.selectedSessionId;

    list.innerHTML = sessions.map(s => `
      <div class="session-card ${s.id === state.selectedSessionId ? 'selected' : ''}"
           data-id="${s.id}">
        <div class="session-provider-badge badge-${s.provider}">
          ${PROVIDERS[s.provider]?.label || s.provider.toUpperCase().slice(0, 3)}
        </div>
        <div class="session-info">
          <div class="session-title">${escapeHtml(s.title || 'Untitled')}</div>
          <div class="session-meta">
            <span>${s.messageCount || 0} msgs</span>
            <span>·</span>
            <span>${timeAgo(s.lastUpdated)}</span>
          </div>
          <div class="session-tags">
            ${s.favorite ? '<span class="session-tag favorite">⭐</span>' : ''}
            ${(s.tags || []).slice(0, 3).map(tag => `<span class="session-tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>
        <div class="session-actions">
          <button class="session-action-btn session-fav-btn ${s.favorite ? 'active' : ''}" data-fav="${s.id}" title="Toggle favorite">
            ${s.favorite ? '⭐' : '☆'}
          </button>
          <button class="session-action-btn session-del-btn" data-del="${s.id}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Bind events
    list.querySelectorAll('.session-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-del]') || e.target.closest('[data-fav]')) return;
        selectSession(card.dataset.id);
      });
    });

    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(btn.dataset.del);
      });
    });

    list.querySelectorAll('[data-fav]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(btn.dataset.fav);
      });
    });
  }

  function selectSession(id) {
    state.selectedSessionId = id;
    renderSessions();
    $('transferBtn').disabled = false;
    $('exportBtn').disabled = false;
    loadSessionDetails(id);
  }

  // ─── Session Details ────────────────────────────────────────────────────
  let currentSessionTags = [];
  let currentSessionId = null;

  function loadSessionDetails(id) {
    const session = state.sessions.find(s => s.id === id);
    if (!session) return;

    // Update header
    const providerLabel = PROVIDERS[session.provider]?.label || session.provider.toUpperCase().slice(0, 3);
    $('detailProviderBadge').textContent = providerLabel;
    $('detailProviderBadge').className = `detail-provider-badge badge-${session.provider}`;
    $('detailTitle').textContent = session.title || 'Untitled Session';
    $('detailMeta').textContent = `${session.messageCount || 0} messages · ${timeAgo(session.lastUpdated)}`;

    // Get full session data
    const sessionKey = 'aibridge_session_' + id;
    chrome.storage.local.get(sessionKey, (result) => {
      if (!result[sessionKey]) {
        $('statMessages').textContent = '0';
        $('statCodeBlocks').textContent = '0';
        $('statTokens').textContent = '0';
        $('messagesList').innerHTML = '<div class="empty-messages">No messages to display</div>';
        return;
      }

      let sessionData;
      try {
        const json = LZString.decompressFromBase64(result[sessionKey]);
        sessionData = JSON.parse(json);
      } catch (e) {
        console.error('Failed to decompress:', e);
        return;
      }

      // Update stats
      const messages = sessionData.messages || [];
      const codeBlocks = messages.flatMap(m => m.codeBlocks || []).filter(b => b.code?.length > 0);
      const totalTokens = calculateSessionTokens(sessionData, state.settings.preferredModel);

      $('statMessages').textContent = messages.length;
      $('statCodeBlocks').textContent = codeBlocks.length;
      $('statTokens').textContent = totalTokens.toLocaleString();

      // Load and display tags
      currentSessionId = id;
      currentSessionTags = session.tags || [];
      renderTagsEditor();

      // Update favorite button state
      const favBtn = $('toggleFavoriteBtn');
      if (session.favorite) {
        favBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1L10.5 6L16 6.5L12 10.5L13 16L8 13L3 16L4 10.5L0 6.5L5.5 6L8 1Z"/>
          </svg>
          Favorited
        `;
      } else {
        favBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L10.5 6L16 6.5L12 10.5L13 16L8 13L3 16L4 10.5L0 6.5L5.5 6L8 1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          </svg>
          Favorite
        `;
      }

      // Render messages preview
      renderMessagesPreview(messages);
    });

    // Check if this is the active session
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CURRENT_SESSION' }, (res) => {
          if (res?.session && res.session.id === id) {
            state.currentTabId = tabs[0].id;
            state.isCapturing = res.isCapturing !== false;
            toggleSessionControls(state.isCapturing);
          } else {
            state.currentTabId = null;
            toggleSessionControls(false);
          }
        }).catch(() => {
          state.currentTabId = null;
          toggleSessionControls(false);
        });
      }
    });

    showView('sessionDetails');
  }

  function renderMessagesPreview(messages) {
    const container = $('messagesList');

    if (!messages || messages.length === 0) {
      container.innerHTML = '<div class="empty-messages">No messages to display</div>';
      return;
    }

    // Show last 10 messages
    const recentMessages = messages.slice(-10);

    container.innerHTML = recentMessages.map(m => `
      <div class="message-item message-${m.role}">
        <div class="message-role">${m.role === 'user' ? 'You' : 'Assistant'}</div>
        <div class="message-content">${escapeHtml(m.content?.slice(0, 200) || '')}${(m.content?.length || 0) > 200 ? '...' : ''}</div>
      </div>
    `).join('');
  }

  function toggleFavorite(id) {
    const session = state.sessions.find(s => s.id === id);
    if (!session) return;

    session.favorite = !session.favorite;

    // Save to favorites storage
    chrome.storage.local.get('aibridge_favorites', (result) => {
      let favorites = result.aibridge_favorites || [];
      if (session.favorite) {
        if (!favorites.includes(id)) favorites.push(id);
      } else {
        favorites = favorites.filter(fid => fid !== id);
      }
      chrome.storage.local.set({ aibridge_favorites: favorites }, () => {
        // Update index with favorite status
        updateSessionIndex(session);
        // Re-render
        applyFilters();
        if (state.selectedSessionId === id) {
          loadSessionDetails(id);
        }
        showToast(session.favorite ? 'Added to favorites' : 'Removed from favorites', 'success');
      });
    });
  }

  function updateSessionIndex(session) {
    chrome.storage.local.get('aibridge_index', (result) => {
      let index = result.aibridge_index || [];
      const existing = index.findIndex(s => s.id === session.id);
      if (existing >= 0) {
        index[existing] = {
          ...index[existing],
          favorite: session.favorite,
          tags: session.tags || []
        };
        chrome.storage.local.set({ aibridge_index: index });
      }
    });
  }

  function deleteSession(id) {
    if (!confirm('Delete this session?')) return;
    
    chrome.runtime.sendMessage({ type: 'DELETE_SESSION', sessionId: id }, () => {
      state.sessions = state.sessions.filter(s => s.id !== id);
      if (state.selectedSessionId === id) {
        state.selectedSessionId = null;
        $('transferBtn').disabled = true;
        $('exportBtn').disabled = true;
      }
      applyFilters();
      showToast('Session deleted', 'success');
    });
  }

  // ─── Capture Status ───────────────────────────────────────────────────────
  function updateCaptureStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;

      const url = tabs[0].url || '';
      const aiProviders = {
        'chatgpt.com': 'chatgpt',
        'chat.openai.com': 'chatgpt',
        'claude.ai': 'claude',
        'gemini.google.com': 'gemini',
        'perplexity.ai': 'perplexity',
        'copilot.microsoft.com': 'copilot',
        'chat.mistral.ai': 'mistral',
        'huggingface.co/chat': 'huggingface'
      };

      let activeProvider = null;
      for (const [domain, provider] of Object.entries(aiProviders)) {
        if (url.includes(domain)) {
          activeProvider = PROVIDERS[provider]?.name || provider;
          break;
        }
      }

      const statusEl = $('captureStatus');
      const labelEl = $('captureLabel');
      const subLabelEl = $('captureSubLabel');
      const statusDot = $('statusDot');
      const controlBtn = $('captureControlBtn');

      if (activeProvider) {
        statusEl.classList.add('capturing');
        statusDot.classList.add('active');
        controlBtn.style.display = 'flex';
        labelEl.textContent = `Capturing from ${activeProvider}`;
        subLabelEl.textContent = tabs[0].title?.slice(0, 40) || 'Active conversation';
        state.currentTabId = tabs[0].id;

        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CURRENT_SESSION' }, (res) => {
          if (chrome.runtime.lastError) {
            state.isCapturing = true;
            updateCaptureControlButton();
            return;
          }
          if (res?.session && res.session.messages?.length > 0) {
            subLabelEl.textContent = `${res.session.messages.length} messages captured`;
            state.isCapturing = res.isCapturing !== false;
          } else {
            state.isCapturing = true;
          }
          updateCaptureControlButton();
        }).catch(() => {
          state.isCapturing = true;
          updateCaptureControlButton();
        });
      } else {
        statusEl.classList.remove('capturing');
        statusDot.classList.remove('active');
        controlBtn.style.display = 'none';
        state.currentTabId = null;
        labelEl.textContent = 'Not on an AI platform';
        subLabelEl.textContent = 'Open ChatGPT, Claude, Gemini, or Perplexity';
      }
    });
  }

  function updateCaptureControlButton() {
    const controlBtn = $('captureControlBtn');
    const playIcon = controlBtn.querySelector('.icon-play');
    const pauseIcon = controlBtn.querySelector('.icon-pause');

    if (state.isCapturing) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      controlBtn.title = 'Stop capturing';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      controlBtn.title = 'Start capturing';
    }
  }

  // ─── Load Sessions ────────────────────────────────────────────────────────
  function loadSessions() {
    state.isLoading = true;
    renderSessions(); // Show skeleton
    
    chrome.runtime.sendMessage({ type: 'GET_SESSIONS' }, (res) => {
      state.sessions = res?.sessions || [];
      // Load favorites
      chrome.storage.local.get('aibridge_favorites', (result) => {
        const favorites = result.aibridge_favorites || [];
        state.sessions.forEach(s => {
          s.favorite = favorites.includes(s.id);
        });
        state.filteredSessions = [...state.sessions];
        state.isLoading = false;
        renderSessions();
      });
    });
  }

  // ─── Export Functionality ────────────────────────────────────────────────
  function exportSession(format = 'markdown') {
    if (!state.selectedSessionId) return;

    const sessionKey = 'aibridge_session_' + state.selectedSessionId;
    chrome.storage.local.get(sessionKey, (result) => {
      if (!result[sessionKey]) {
        showToast('Session data not found', 'error');
        return;
      }

      let sessionData;
      try {
        const json = LZString.decompressFromBase64(result[sessionKey]);
        sessionData = JSON.parse(json);
      } catch (e) {
        showToast('Failed to decompress session', 'error');
        return;
      }

      let content = '';
      const filename = `ai-bridge-${sessionData.provider}-${Date.now()}`;

      if (format === 'markdown') {
        content = exportAsMarkdown(sessionData);
        downloadFile(content, filename + '.md', 'text/markdown');
      } else if (format === 'json') {
        content = JSON.stringify(sessionData, null, 2);
        downloadFile(content, filename + '.json', 'application/json');
      }

      showToast(`Exported as ${format.toUpperCase()}`, 'success');
    });
  }

  function exportAsMarkdown(sessionData) {
    const provider = PROVIDERS[sessionData.provider]?.name || sessionData.provider;
    let md = `# ${sessionData.title || 'AI Conversation'}\n\n`;
    md += `**Provider:** ${provider}\n`;
    md += `**Date:** ${formatDate(sessionData.createdAt)}\n`;
    md += `**Messages:** ${sessionData.messages?.length || 0}\n\n`;
    md += `---\n\n`;

    (sessionData.messages || []).forEach((m, i) => {
      const role = m.role === 'user' ? '👤 You' : '🤖 Assistant';
      md += `### ${role}\n\n`;
      md += `${m.content}\n\n`;
      
      if (m.codeBlocks?.length > 0) {
        m.codeBlocks.forEach(block => {
          md += `\`\`\`${block.language}\n${block.code}\n\`\`\`\n\n`;
        });
      }
      md += `---\n\n`;
    });

    md += `\n*Exported from AI Bridge v2.0*\n`;
    return md;
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─── Backup/Restore ──────────────────────────────────────────────────────
  function backupData() {
    chrome.storage.local.get(null, (items) => {
      const backup = {
        version: '2.0',
        timestamp: Date.now(),
        data: items
      };
      const content = JSON.stringify(backup, null, 2);
      downloadFile(content, `ai-bridge-backup-${Date.now()}.json`, 'application/json');
      showToast('Backup created', 'success');
    });
  }

  function restoreData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        if (!backup.data) throw new Error('Invalid backup file');
        
        chrome.storage.local.set(backup.data, () => {
          loadSessions();
          showToast('Backup restored successfully', 'success');
        });
      } catch (err) {
        showToast('Invalid backup file', 'error');
      }
    };
    reader.readAsText(file);
  }

  function cleanupStorage() {
    // First, run auto-delete to remove old sessions
    chrome.runtime.sendMessage({ type: 'RUN_CLEANUP' }, () => {
      // Then ask for confirmation to clear all
      if (!confirm('This will remove ALL sessions. Continue?')) return;
      
      chrome.storage.local.get(null, (items) => {
        const keysToRemove = Object.keys(items).filter(k => 
          k.startsWith('aibridge_session_') || 
          k === 'aibridge_index' ||
          k === 'aibridge_favorites'
        );
        chrome.storage.local.remove(keysToRemove, () => {
          state.sessions = [];
          state.filteredSessions = [];
          state.selectedSessionId = null;
          $('transferBtn').disabled = true;
          $('exportBtn').disabled = true;
          renderSessions();
          updateStorageStats();
          showToast('All storage cleaned', 'success');
        });
      });
    });
  }

  // ─── Transfer View Setup ──────────────────────────────────────────────────
  function setupTransferView() {
    const session = state.sessions.find(s => s.id === state.selectedSessionId);
    if (!session) return;

    $('previewProvider').textContent = PROVIDERS[session.provider]?.name || session.provider;
    $('previewTitle').textContent = session.title || 'Untitled Session';
    $('previewMeta').textContent = `${session.messageCount || 0} messages · ${timeAgo(session.lastUpdated)}`;

    // Disable current provider
    $('providerGrid').querySelectorAll('.provider-btn').forEach(btn => {
      btn.disabled = btn.dataset.provider === session.provider;
      btn.style.opacity = btn.disabled ? '0.3' : '1';
    });

    // Auto-select first available provider
    if (!state.selectedProvider || state.selectedProvider === session.provider) {
      const firstAvailable = Object.keys(PROVIDERS).find(p => p !== session.provider);
      state.selectedProvider = firstAvailable;
      updateProviderSelection();
    }

    // Update token estimation
    updateTokenEstimation();
  }

  function updateTokenEstimation() {
    const sessionKey = 'aibridge_session_' + state.selectedSessionId;
    const selectedModel = $('modelSelect')?.value || 'gemini-2.0-flash';
    
    chrome.storage.local.get(sessionKey, (result) => {
      if (!result[sessionKey]) {
        $('tokenValue').textContent = '0';
        return;
      }

      try {
        const json = LZString.decompressFromBase64(result[sessionKey]);
        const sessionData = JSON.parse(json);
        const tokens = calculateSessionTokens(sessionData, selectedModel);
        $('tokenValue').textContent = tokens.toLocaleString();
      } catch (e) {
        $('tokenValue').textContent = 'N/A';
      }
    });
  }

  function updateProviderSelection() {
    $('providerGrid').querySelectorAll('.provider-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.provider === state.selectedProvider);
    });
  }

  // ─── Processing ───────────────────────────────────────────────────────────
  function setStep(stepNum) {
    for (let i = 1; i <= 4; i++) {
      const el = $('step' + i);
      if (!el) continue;
      el.classList.remove('active', 'done');
      if (i < stepNum) el.classList.add('done');
      if (i === stepNum) el.classList.add('active');
    }
  }

  async function runProcessing() {
    if (!state.selectedSessionId || !state.selectedProvider) {
      showToast('Select a session and target provider');
      return;
    }

    // Get API key based on selected model
    const selectedModel = $('modelSelect').value;
    let apiKey = state.settings.geminiApiKey;
    
    if (selectedModel.startsWith('gpt-')) {
      apiKey = state.settings.openaiApiKey;
    } else if (selectedModel.startsWith('claude-')) {
      apiKey = state.settings.anthropicApiKey;
    }

    if (!apiKey) {
      showToast('API key required for selected model', 'error');
      showView('settings');
      return;
    }

    showView('processing');
    setStep(1);

    const sessionKey = 'aibridge_session_' + state.selectedSessionId;
    chrome.storage.local.get(sessionKey, async (result) => {
      if (!result[sessionKey]) {
        showResult(false, 'Session data not found');
        return;
      }

      setStep(1);
      await delay(400);

      let sessionData;
      try {
        const json = LZString.decompressFromBase64(result[sessionKey]);
        sessionData = JSON.parse(json);
      } catch (e) {
        showResult(false, 'Failed to decompress session data');
        return;
      }

      setStep(2);

      // Process with selected AI model
      chrome.runtime.sendMessage({
        type: 'PROCESS_CONTEXT',
        sessionData,
        mode: state.selectedMode,
        targetProvider: state.selectedProvider,
        apiKey,
        model: selectedModel
      }, async (res) => {
        if (res?.error) {
          showResult(false, res.error);
          return;
        }

        setStep(3);
        await delay(500);
        setStep(4);

        state.currentSummary = res.summary;
        state.formattedPrompt = res.formattedPrompt;
        state.targetUrl = res.targetUrl;

        await delay(400);

        // Inject to target
        chrome.runtime.sendMessage({
          type: 'INJECT_TO_TAB',
          targetProvider: state.selectedProvider,
          prompt: state.formattedPrompt
        }, (injRes) => {
          // Continue even if injection fails
        });

        showResult(true);
      });
    });
  }

  function showResult(success, errorMsg = '') {
    showView('result');

    $('resultSuccess').style.display = success ? 'flex' : 'none';
    $('resultError').style.display = success ? 'none' : 'flex';

    if (!success) {
      $('errorMessage').textContent = errorMsg;
    }

    if (state.currentSummary) {
      $('summaryContent').textContent = state.currentSummary;
      $('summaryBox').style.display = 'flex';
    }

    if (state.targetUrl) {
      $('openTargetBtn').onclick = () => {
        chrome.tabs.create({ url: state.targetUrl });
      };
    }
  }

  // ─── Settings ─────────────────────────────────────────────────────────────
  function loadSettings() {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
      state.settings = res?.settings || {};
      if (state.settings.geminiApiKey) {
        $('geminiApiKeyInput').value = state.settings.geminiApiKey;
      }
      if (state.settings.openaiApiKey) {
        $('openaiApiKeyInput').value = state.settings.openaiApiKey;
      }
      if (state.settings.anthropicApiKey) {
        $('anthropicApiKeyInput').value = state.settings.anthropicApiKey;
      }
      if (typeof state.settings.localOnly !== 'undefined') {
        $('localOnlyToggle').checked = state.settings.localOnly;
      }
      if (typeof state.settings.autoCapture !== 'undefined') {
        $('autoCaptureToggle').checked = state.settings.autoCapture;
      }
      if (typeof state.settings.autoDelete !== 'undefined') {
        $('autoDeleteToggle').checked = state.settings.autoDelete;
        $('autoDeleteDaysWrapper').style.opacity = state.settings.autoDelete ? '1' : '0.5';
        $('autoDeleteDaysWrapper').style.pointerEvents = state.settings.autoDelete ? 'auto' : 'none';
        $('autoDeleteDays').value = state.settings.autoDeleteDays || '7';
      }
      // Load preferred model
      if (state.settings.preferredModel) {
        $('modelSelect').value = state.settings.preferredModel;
      }
    });
  }

  function saveSettings() {
    const settings = {
      geminiApiKey: $('geminiApiKeyInput').value.trim(),
      openaiApiKey: $('openaiApiKeyInput').value.trim(),
      anthropicApiKey: $('anthropicApiKeyInput').value.trim(),
      localOnly: $('localOnlyToggle').checked,
      autoCapture: $('autoCaptureToggle').checked,
      autoDelete: $('autoDeleteToggle').checked,
      autoDeleteDays: parseInt($('autoDeleteDays').value),
      preferredModel: $('modelSelect').value
    };

    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, () => {
      state.settings = settings;
      showToast('Settings saved', 'success');
      showView('main');
    });
  }

  function updateStorageStats() {
    if (typeof chrome.storage.local.getBytesInUse !== 'function') {
      $('storageFill').style.width = '0%';
      $('storageLabel').textContent = 'Storage stats unavailable';
      return;
    }

    chrome.storage.local.getBytesInUse((bytes) => {
      const maxBytes = 5 * 1024 * 1024;
      const pct = Math.min(100, (bytes / maxBytes) * 100);
      $('storageFill').style.width = pct + '%';
      $('storageLabel').textContent = `${formatBytes(bytes)} used of 5 MB`;
    });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── Event Binding ────────────────────────────────────────────────────────
  function bindEvents() {
    // Theme toggle
    $('themeToggle').addEventListener('click', toggleTheme);

    // Main view
    $('settingsBtn').onclick = () => {
      updateStorageStats();
      showView('settings');
    };

    $('captureControlBtn').onclick = async () => {
      if (!state.currentTabId) {
        showToast('No active session - open an AI chat first');
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(state.currentTabId, {
          type: state.isCapturing ? 'STOP_CAPTURE' : 'START_CAPTURE'
        });

        if (response?.ok) {
          state.isCapturing = !state.isCapturing;
          updateCaptureControlButton();
          showToast(state.isCapturing ? 'Session capturing started' : 'Session capturing stopped & saved', 'success');
          if (!state.isCapturing) {
            loadSessions();
          }
        } else {
          showToast('Failed to ' + (state.isCapturing ? 'stop' : 'start') + ' capture', 'error');
        }
      } catch (err) {
        console.error('[AI Bridge] Send message error:', err);
        if (confirm('Could not connect to the page. Refresh the AI chat page and try again.\n\nClick OK to refresh the current tab.')) {
          chrome.tabs.reload(state.currentTabId);
        }
      }
    };

    // Search with debouncing
    $('searchInput').addEventListener('input', (e) => {
      clearTimeout(state.searchTimeout);
      state.searchTimeout = setTimeout(() => {
        state.searchQuery = e.target.value;
        applyFilters();
      }, 300);
    });

    // Filter tabs
    $('filterTabs').querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $('filterTabs').querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.currentFilter = tab.dataset.filter;
        applyFilters();
      });
    });

    $('transferBtn').onclick = () => {
      if (!state.selectedSessionId) return;
      setupTransferView();
      showView('transfer');
    };

    $('exportBtn').onclick = () => {
      exportSession('markdown');
    };

    $('clearAllBtn').onclick = () => {
      if (!confirm('Delete all sessions? This cannot be undone.')) return;
      cleanupStorage();
    };

    // Transfer view
    $('backFromTransfer').onclick = () => showView('main');

    $('modeGrid').querySelectorAll('.mode-btn').forEach(btn => {
      btn.onclick = () => {
        $('modeGrid').querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedMode = btn.dataset.mode;
      };
    });

    $('providerGrid').querySelectorAll('.provider-btn').forEach(btn => {
      btn.onclick = () => {
        if (btn.disabled) return;
        state.selectedProvider = btn.dataset.provider;
        updateProviderSelection();
      };
    });

    $('processBtn').onclick = runProcessing;

    // Result view
    $('backFromResult').onclick = () => showView('main');

    $('copySummaryBtn').onclick = () => {
      if (state.formattedPrompt) {
        navigator.clipboard.writeText(state.formattedPrompt).then(() => {
          showToast('Copied to clipboard!', 'success');
        });
      }
    };

    $('exportResultBtn').onclick = () => {
      if (state.currentSummary) {
        const blob = new Blob([state.currentSummary], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-bridge-summary-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Summary exported', 'success');
      }
    };

    // Settings view
    $('backFromSettings').onclick = () => showView('main');

    // API key show/hide buttons
    $('showGeminiKeyBtn').onclick = () => toggleKeyVisibility('geminiApiKeyInput', 'showGeminiKeyBtn');
    $('showOpenaiKeyBtn').onclick = () => toggleKeyVisibility('openaiApiKeyInput', 'showOpenaiKeyBtn');
    $('showAnthropicKeyBtn').onclick = () => toggleKeyVisibility('anthropicApiKeyInput', 'showAnthropicKeyBtn');

    $('saveSettingsBtn').onclick = saveSettings;

    // Auto-delete toggle
    $('autoDeleteToggle').addEventListener('change', (e) => {
      $('autoDeleteDaysWrapper').style.opacity = e.target.checked ? '1' : '0.5';
      $('autoDeleteDaysWrapper').style.pointerEvents = e.target.checked ? 'auto' : 'none';
    });

    // Backup/Restore/Cleanup
    $('backupBtn').onclick = backupData;
    $('restoreBtn').onclick = () => $('restoreFileInput').click();
    $('cleanupBtn').onclick = cleanupStorage;
    $('restoreFileInput').addEventListener('change', (e) => {
      if (e.target.files[0]) {
        restoreData(e.target.files[0]);
        e.target.value = '';
      }
    });

    // Session Details view
    $('backFromSessionDetails').onclick = () => showView('main');

    // Tags editor
    $('editTagsBtn').onclick = () => {
      const editor = $('tagsEditor');
      const isHidden = editor.style.display === 'none' || !editor.style.display;
      showTagsEditor(isHidden);
      if (isHidden) {
        $('tagsInput').focus();
      }
    };

    $('addTagBtn').onclick = () => {
      const input = $('tagsInput');
      addTag(input.value);
      input.value = '';
    };

    $('tagsInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addTag(e.target.value);
        e.target.value = '';
      }
    });

    $('toggleFavoriteBtn').onclick = () => {
      if (state.selectedSessionId) {
        toggleFavorite(state.selectedSessionId);
      }
    };

    $('startSessionBtn').onclick = async () => {
      if (!state.currentTabId) {
        showToast('No active session to start');
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(state.currentTabId, { type: 'START_CAPTURE' });
        if (response?.ok) {
          state.isCapturing = true;
          toggleSessionControls(true);
          showToast('Session capturing started', 'success');
        } else {
          showToast('Failed to start capture', 'error');
        }
      } catch (err) {
        console.error('[AI Bridge] Start error:', err);
        if (confirm('Could not connect to the page. Refresh the AI chat page and try again.')) {
          chrome.tabs.reload(state.currentTabId);
        }
      }
    };

    $('stopSessionBtn').onclick = async () => {
      if (!state.currentTabId) {
        showToast('No active session to stop');
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(state.currentTabId, { type: 'STOP_CAPTURE' });
        if (response?.ok) {
          state.isCapturing = false;
          toggleSessionControls(false);
          showToast('Session capturing stopped & saved', 'success');
          loadSessions();
        } else {
          showToast('Failed to stop capture', 'error');
        }
      } catch (err) {
        console.error('[AI Bridge] Stop error:', err);
        if (confirm('Could not connect to the page. Refresh the AI chat page and try again.')) {
          chrome.tabs.reload(state.currentTabId);
        }
      }
    };

    $('transferFromDetailsBtn').onclick = () => {
      if (!state.selectedSessionId) return;
      setupTransferView();
      showView('transfer');
    };
  }

  function toggleKeyVisibility(inputId, btnId) {
    const input = $(inputId);
    const btn = $(btnId);
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = 'Hide';
    } else {
      input.type = 'password';
      btn.textContent = 'Show';
    }
  }

  function toggleSessionControls(isActive) {
    const startBtn = $('startSessionBtn');
    const stopBtn = $('stopSessionBtn');

    if (isActive) {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
    } else {
      startBtn.style.display = 'flex';
      stopBtn.style.display = 'none';
    }
  }

  // ─── Tags Editor ────────────────────────────────────────────────────────
  function renderTagsEditor() {
    const tagsList = $('tagsList');
    if (!tagsList) return;

    tagsList.innerHTML = currentSessionTags.map((tag, index) => `
      <div class="tag-item">
        ${escapeHtml(tag)}
        <button onclick="App.removeTag(${index})" title="Remove tag">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    `).join('');
  }

  function showTagsEditor(show) {
    const editor = $('tagsEditor');
    if (editor) {
      editor.style.display = show ? 'flex' : 'none';
    }
  }

  function addTag(tag) {
    if (!tag.trim() || currentSessionTags.includes(tag.trim())) return;
    currentSessionTags.push(tag.trim());
    saveTags();
    renderTagsEditor();
    renderSessions(); // Update session list with new tags
  }

  function removeTag(index) {
    currentSessionTags.splice(index, 1);
    saveTags();
    renderTagsEditor();
    renderSessions();
  }

  function saveTags() {
    if (!currentSessionId) return;
    
    chrome.storage.local.get('aibridge_index', (result) => {
      let index = result.aibridge_index || [];
      const sessionIndex = index.findIndex(s => s.id === currentSessionId);
      if (sessionIndex >= 0) {
        index[sessionIndex].tags = currentSessionTags;
        chrome.storage.local.set({ aibridge_index: index }, () => {
          showToast('Tags saved', 'success');
        });
      }
    });
  }

  // Make App functions accessible from HTML onclick
  window.App = {
    removeTag,
    addTag
  };

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    loadTheme();
    bindEvents();
    loadSessions();
    loadSettings();
    updateCaptureStatus();
    showView('main');

    // Listen for updates from content scripts
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'SESSION_UPDATED') {
        loadSessions();
        updateCaptureStatus();
      }
    });

    // Update capture status when tab changes
    chrome.tabs.onActivated.addListener(() => {
      updateCaptureStatus();
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);

