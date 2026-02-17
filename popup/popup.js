// AI Bridge — Popup Controller

const App = (function() {
  // ─── State ──────────────────────────────────────────────────────────────
  let state = {
    sessions: [],
    selectedSessionId: null,
    selectedMode: 'coding',
    selectedProvider: null,
    currentSummary: null,
    formattedPrompt: null,
    targetUrl: null,
    settings: {}
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

  // ─── Toast ───────────────────────────────────────────────────────────────
  function showToast(msg, duration = 2000) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
  }

  // ─── Provider Badge ───────────────────────────────────────────────────────
  function providerLabel(p) {
    const map = { chatgpt: 'GPT', claude: 'CLD', gemini: 'GEM', perplexity: 'PPL' };
    return map[p] || p.toUpperCase().slice(0, 3);
  }

  function providerName(p) {
    const map = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', perplexity: 'Perplexity' };
    return map[p] || p;
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  }

  // ─── Sessions Render ─────────────────────────────────────────────────────
  function renderSessions() {
    const list = $('sessionsList');

    if (state.sessions.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="8" width="24" height="18" rx="3" stroke="currentColor" stroke-width="1.5"/>
              <path d="M10 14H22M10 19H18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M16 3V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <p>No sessions yet</p>
          <span>Visit ChatGPT, Claude, Gemini, or<br>Perplexity to start capturing</span>
        </div>
      `;
      $('transferBtn').disabled = true;
      return;
    }

    $('transferBtn').disabled = !state.selectedSessionId;

    list.innerHTML = state.sessions.map(s => `
      <div class="session-card ${s.id === state.selectedSessionId ? 'selected' : ''}"
           data-id="${s.id}">
        <div class="session-provider-badge badge-${s.provider}">
          ${providerLabel(s.provider)}
        </div>
        <div class="session-info">
          <div class="session-title">${escapeHtml(s.title || 'Untitled')}</div>
          <div class="session-meta">${s.messageCount} msgs · ${timeAgo(s.lastUpdated)}</div>
        </div>
        <div class="session-actions">
          <button class="session-del-btn" data-del="${s.id}" title="Delete">×</button>
        </div>
      </div>
    `).join('');

    // Bind events
    list.querySelectorAll('.session-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.dataset.del) return; // handled below
        selectSession(card.dataset.id);
      });
    });

    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(btn.dataset.del);
      });
    });
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function selectSession(id) {
    state.selectedSessionId = id;
    renderSessions();
    $('transferBtn').disabled = false;
    
    // Load and show session details
    loadSessionDetails(id);
  }

  function loadSessionDetails(id) {
    const session = state.sessions.find(s => s.id === id);
    if (!session) return;

    // Update header
    $('detailProviderBadge').textContent = providerLabel(session.provider);
    $('detailProviderBadge').className = `detail-provider-badge badge-${session.provider}`;
    $('detailTitle').textContent = session.title || 'Untitled Session';
    $('detailMeta').textContent = `${session.messageCount} messages · ${timeAgo(session.lastUpdated)}`;

    // Get full session data
    const sessionKey = 'aibridge_session_' + id;
    chrome.storage.local.get(sessionKey, (result) => {
      if (!result[sessionKey]) {
        $('statMessages').textContent = '0';
        $('statCodeBlocks').textContent = '0';
        $('statDuration').textContent = '0m';
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
      const codeBlocks = messages.flatMap(m => m.codeBlocks || []).filter(b => b.code.length > 0);
      
      $('statMessages').textContent = messages.length;
      $('statCodeBlocks').textContent = codeBlocks.length;
      
      // Calculate duration (first to last message)
      if (messages.length > 1) {
        const firstTs = messages[0].timestamp || sessionData.createdAt;
        const lastTs = messages[messages.length - 1].timestamp || sessionData.lastUpdated;
        const durationMin = Math.round((lastTs - firstTs) / 60000);
        $('statDuration').textContent = durationMin + 'm';
      }

      // Render messages preview
      renderMessagesPreview(messages);
    });

    // Check if this is the active session and get capture state
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CURRENT_SESSION' }, (res) => {
          if (res?.session && res.session.id === id) {
            state.currentTabId = tabs[0].id;
            state.isCapturing = res.isCapturing !== false;
            toggleSessionControls(state.isCapturing);
          } else {
            // Not an active session, hide stop button
            state.currentTabId = null;
            toggleSessionControls(false);
          }
        });
      }
    });

    showView('sessionDetails');
  }

  function renderMessagesPreview(messages) {
    const container = $('messagesList');
    
    if (messages.length === 0) {
      container.innerHTML = '<div class="empty-messages">No messages to display</div>';
      return;
    }

    // Show last 10 messages
    const recentMessages = messages.slice(-10);
    
    container.innerHTML = recentMessages.map(m => `
      <div class="message-item message-${m.role}">
        <div class="message-role">${m.role === 'user' ? 'User' : 'Assistant'}</div>
        <div class="message-content">${escapeHtml(m.content.slice(0, 150))}${m.content.length > 150 ? '...' : ''}</div>
      </div>
    `).join('');
  }

  function deleteSession(id) {
    chrome.runtime.sendMessage({ type: 'DELETE_SESSION', sessionId: id }, () => {
      state.sessions = state.sessions.filter(s => s.id !== id);
      if (state.selectedSessionId === id) {
        state.selectedSessionId = null;
        $('transferBtn').disabled = true;
      }
      renderSessions();
      showToast('Session deleted');
    });
  }

  // ─── Capture Status ───────────────────────────────────────────────────────
  function updateCaptureStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;

      const url = tabs[0].url || '';
      const aiProviders = {
        'chatgpt.com': 'ChatGPT',
        'chat.openai.com': 'ChatGPT',
        'claude.ai': 'Claude',
        'gemini.google.com': 'Gemini',
        'perplexity.ai': 'Perplexity'
      };

      let activeProvider = null;
      for (const [domain, name] of Object.entries(aiProviders)) {
        if (url.includes(domain)) {
          activeProvider = name;
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

        // Always store current tab info for start/stop
        state.currentTabId = tabs[0].id;

        // Try to get session from active tab
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CURRENT_SESSION' }, (res) => {
          if (chrome.runtime.lastError) {
            console.log('[AI Bridge] Tab message error:', chrome.runtime.lastError.message);
            // Content script might not be loaded yet
            state.isCapturing = true;
            updateCaptureControlButton();
            return;
          }
          if (res?.session && res.session.messages.length > 0) {
            subLabelEl.textContent = `${res.session.messages.length} messages captured`;
            state.isCapturing = res.isCapturing !== false;
          } else {
            // No messages yet but content script is loaded
            state.isCapturing = true;
          }
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
    chrome.runtime.sendMessage({ type: 'GET_SESSIONS' }, (res) => {
      state.sessions = res?.sessions || [];
      renderSessions();
    });
  }

  // ─── Transfer View Setup ──────────────────────────────────────────────────
  function setupTransferView() {
    const session = state.sessions.find(s => s.id === state.selectedSessionId);
    if (!session) return;

    $('previewProvider').textContent = providerName(session.provider);
    $('previewTitle').textContent = session.title || 'Untitled Session';
    $('previewMeta').textContent = `${session.messageCount} messages · ${timeAgo(session.lastUpdated)}`;

    // Disable current provider
    $('providerGrid').querySelectorAll('.provider-btn').forEach(btn => {
      btn.disabled = btn.dataset.provider === session.provider;
      btn.style.opacity = btn.dataset.provider === session.provider ? '0.4' : '1';
    });

    // Auto-select first available provider
    if (!state.selectedProvider || state.selectedProvider === session.provider) {
      const firstAvailable = ['chatgpt', 'claude', 'gemini', 'perplexity']
        .find(p => p !== session.provider);
      state.selectedProvider = firstAvailable;
      updateProviderSelection();
    }
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

    if (!state.settings.apiKey) {
      showToast('Add your Gemini API key in Settings first');
      showView('settings');
      return;
    }

    showView('processing');
    setStep(1);

    // Step 1: Get session data
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

      // Step 2 & 3: Process with Gemini and format
      chrome.runtime.sendMessage({
        type: 'PROCESS_CONTEXT',
        sessionData,
        mode: state.selectedMode,
        targetProvider: state.selectedProvider,
        apiKey: state.settings.apiKey
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

        // Step 4: Inject
        chrome.runtime.sendMessage({
          type: 'INJECT_TO_TAB',
          targetProvider: state.selectedProvider,
          prompt: state.formattedPrompt
        }, (injRes) => {
          if (injRes?.error) {
            // Still show success with manual copy option
          }
          showResult(true);
        });
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
      if (state.settings.apiKey) {
        $('apiKeyInput').value = state.settings.apiKey;
      }
      if (typeof state.settings.localOnly !== 'undefined') {
        $('localOnlyToggle').checked = state.settings.localOnly;
      }
      if (typeof state.settings.autoCapture !== 'undefined') {
        $('autoCaptureToggle').checked = state.settings.autoCapture;
      }
    });
  }

  function saveSettings() {
    const settings = {
      apiKey: $('apiKeyInput').value.trim(),
      localOnly: $('localOnlyToggle').checked,
      autoCapture: $('autoCaptureToggle').checked
    };

    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, () => {
      state.settings = settings;
      showToast('Settings saved');
      showView('main');
    });
  }

  function updateStorageStats() {
    chrome.storage.local.getBytesInUse(null, (bytes) => {
      const maxBytes = 5 * 1024 * 1024; // 5MB (chrome.storage.local default)
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
    // Main view
    $('settingsBtn').onclick = () => {
      updateStorageStats();
      showView('settings');
    };

    $('captureControlBtn').onclick = async () => {
      console.log('[AI Bridge] Capture button clicked, tabId:', state.currentTabId, 'isCapturing:', state.isCapturing);
      
      if (!state.currentTabId) {
        showToast('No active session - open an AI chat first');
        return;
      }

      // Try to connect to content script
      try {
        const response = await chrome.tabs.sendMessage(state.currentTabId, { 
          type: state.isCapturing ? 'STOP_CAPTURE' : 'START_CAPTURE' 
        });
        
        if (response?.ok) {
          state.isCapturing = !state.isCapturing;
          updateCaptureControlButton();
          showToast(state.isCapturing ? 'Session capturing started' : 'Session capturing stopped & saved');
          if (!state.isCapturing) {
            loadSessions();
          }
        } else {
          showToast('Failed to ' + (state.isCapturing ? 'stop' : 'start') + ' capture');
        }
      } catch (err) {
        console.error('[AI Bridge] Send message error:', err);
        // Content script not loaded - suggest page refresh
        if (confirm('Could not connect to the page. Refresh the AI chat page and try again.\n\nClick OK to refresh the current tab.')) {
          chrome.tabs.reload(state.currentTabId);
        }
      }
    };

    $('transferBtn').onclick = () => {
      if (!state.selectedSessionId) return;
      setupTransferView();
      showView('transfer');
    };

    $('clearAllBtn').onclick = () => {
      if (!confirm('Delete all sessions?')) return;
      chrome.storage.local.get(null, (items) => {
        const keys = Object.keys(items).filter(k => k.startsWith('aibridge_session_') || k === 'aibridge_index');
        chrome.storage.local.remove(keys, () => {
          state.sessions = [];
          state.selectedSessionId = null;
          $('transferBtn').disabled = true;
          renderSessions();
          showToast('All sessions cleared');
        });
      });
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
          showToast('Copied to clipboard!');
        });
      }
    };

    // Settings view
    $('backFromSettings').onclick = () => showView('main');

    $('showKeyBtn').onclick = () => {
      const input = $('apiKeyInput');
      if (input.type === 'password') {
        input.type = 'text';
        $('showKeyBtn').textContent = 'Hide';
      } else {
        input.type = 'password';
        $('showKeyBtn').textContent = 'Show';
      }
    };

    $('saveSettingsBtn').onclick = saveSettings;

    // Session Details view
    $('backFromSessionDetails').onclick = () => showView('main');

    $('startSessionBtn').onclick = async () => {
      console.log('[AI Bridge] Session details - Start clicked, tabId:', state.currentTabId);
      if (!state.currentTabId) {
        showToast('No active session to start');
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(state.currentTabId, { type: 'START_CAPTURE' });
        if (response?.ok) {
          state.isCapturing = true;
          toggleSessionControls(true);
          showToast('Session capturing started');
        } else {
          showToast('Failed to start capture');
        }
      } catch (err) {
        console.error('[AI Bridge] Start error:', err);
        if (confirm('Could not connect to the page. Refresh the AI chat page and try again.')) {
          chrome.tabs.reload(state.currentTabId);
        }
      }
    };

    $('stopSessionBtn').onclick = async () => {
      console.log('[AI Bridge] Session details - Stop clicked, tabId:', state.currentTabId);
      if (!state.currentTabId) {
        showToast('No active session to stop');
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(state.currentTabId, { type: 'STOP_CAPTURE' });
        if (response?.ok) {
          state.isCapturing = false;
          toggleSessionControls(false);
          showToast('Session capturing stopped & saved');
          loadSessions();
        } else {
          showToast('Failed to stop capture');
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

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
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
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
