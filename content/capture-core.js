// AI Bridge - Core Capture Module
// Handles storage, compression, and message passing for all providers

const AIBridgeCore = (function() {
  const STORAGE_KEY_PREFIX = 'aibridge_session_';
  const MAX_SESSIONS = 20;
  const DEBOUNCE_MS = 800;

  let currentSession = null;
  let captureDebouncer = null;
  let observerActive = false;
  let isCapturing = true; // Default to capturing

  // ─── Storage Helpers ─────────────────────────────────────────────────────

  function compress(data) {
    try {
      const json = JSON.stringify(data);
      return LZString.compressToBase64(json);
    } catch (e) {
      console.warn('[AI Bridge] Compression failed:', e);
      return null;
    }
  }

  function decompress(compressed) {
    try {
      const json = LZString.decompressFromBase64(compressed);
      return JSON.parse(json);
    } catch (e) {
      console.warn('[AI Bridge] Decompression failed:', e);
      return null;
    }
  }

  function saveSession(session) {
    if (!session || !session.id) return;
    
    console.log('[AI Bridge] Saving session:', session.id, 'messages:', session.messages.length);
    
    const compressed = compress(session);
    if (!compressed) return;

    const key = STORAGE_KEY_PREFIX + session.id;
    chrome.storage.local.set({ [key]: compressed }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[AI Bridge] Save error:', chrome.runtime.lastError);
      } else {
        console.log('[AI Bridge] Session saved successfully');
      }
    });

    // Update session index
    chrome.storage.local.get('aibridge_index', (result) => {
      let index = result.aibridge_index || [];
      const existing = index.findIndex(s => s.id === session.id);
      const meta = {
        id: session.id,
        provider: session.provider,
        title: session.title || 'Untitled Session',
        messageCount: session.messages.length,
        lastUpdated: Date.now(),
        mode: session.mode || 'general'
      };
      
      console.log('[AI Bridge] Updating index, existing:', existing, 'meta:', meta);
      
      if (existing >= 0) {
        index[existing] = meta;
      } else {
        index.unshift(meta);
        if (index.length > MAX_SESSIONS) {
          const removed = index.splice(MAX_SESSIONS);
          removed.forEach(s => {
            chrome.storage.local.remove(STORAGE_KEY_PREFIX + s.id);
          });
        }
      }
      
      chrome.storage.local.set({ aibridge_index: index }, () => {
        console.log('[AI Bridge] Index updated:', index.length, 'sessions');
        // Notify popup to refresh
        try {
          chrome.runtime.sendMessage({ type: 'SESSION_UPDATED' });
        } catch (e) {}
      });
    });
  }

  function loadSession(sessionId, callback) {
    const key = STORAGE_KEY_PREFIX + sessionId;
    chrome.storage.local.get(key, (result) => {
      if (result[key]) {
        const session = decompress(result[key]);
        callback(session);
      } else {
        callback(null);
      }
    });
  }

  // ─── Session Management ───────────────────────────────────────────────────

  function createSession(provider, url) {
    return {
      id: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      provider: provider,
      url: url,
      title: document.title || 'AI Conversation',
      messages: [],
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      mode: 'general',
      metadata: {
        pageTitle: document.title,
        domain: window.location.hostname
      }
    };
  }

  function getCurrentSession(provider) {
    if (!currentSession) {
      // Try to load existing session for this URL
      const urlHash = btoa(window.location.href).replace(/[^a-z0-9]/gi, '').substr(0, 20);
      chrome.storage.local.get('aibridge_url_' + urlHash, (result) => {
        if (result['aibridge_url_' + urlHash]) {
          loadSession(result['aibridge_url_' + urlHash], (session) => {
            if (session) {
              currentSession = session;
            } else {
              currentSession = createSession(provider, window.location.href);
            }
          });
        } else {
          currentSession = createSession(provider, window.location.href);
        }
      });
    }
    return currentSession;
  }

  // ─── Message Processing ───────────────────────────────────────────────────

  function classifyContent(text) {
    const codePatterns = /```[\s\S]*?```|`[^`]+`|function\s+\w+|const\s+\w+|class\s+\w+|import\s+|export\s+/;
    const errorPatterns = /error:|exception:|traceback:|syntax error|undefined|null pointer|failed to|cannot|TypeError|ReferenceError/i;
    const questionPatterns = /\?$|^(how|what|why|when|where|who|can you|could you|please|help)/i;

    if (codePatterns.test(text)) return 'code';
    if (errorPatterns.test(text)) return 'error';
    if (questionPatterns.test(text)) return 'question';
    return 'text';
  }

  function extractCodeBlocks(text) {
    const blocks = [];
    const regex = /```(\w*)\n?([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      blocks.push({
        language: match[1] || 'unknown',
        code: match[2].trim()
      });
    }
    return blocks;
  }

  function addMessage(role, content, provider) {
    if (!isCapturing) {
      console.log('[AI Bridge] Capture is stopped, skipping message');
      return;
    }
    
    const session = getCurrentSession(provider);
    if (!session) return;

    // Deduplicate: don't add if last message is same content
    if (session.messages.length > 0) {
      const last = session.messages[session.messages.length - 1];
      if (last.role === role && last.content === content) return;
    }

    const message = {
      id: Date.now(),
      role: role, // 'user' | 'assistant'
      content: content,
      timestamp: Date.now(),
      type: classifyContent(content),
      codeBlocks: extractCodeBlocks(content),
      provider: provider
    };

    session.messages.push(message);
    session.lastUpdated = Date.now();
    session.title = inferTitle(session);

    // Debounced save
    clearTimeout(captureDebouncer);
    captureDebouncer = setTimeout(() => {
      saveSession(session);
      notifyBackground(session);
    }, DEBOUNCE_MS);
  }

  function inferTitle(session) {
    if (session.messages.length === 0) return 'New Conversation';
    const firstUserMsg = session.messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      return firstUserMsg.content.substring(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '');
    }
    return 'AI Conversation';
  }

  // ─── Background Communication ─────────────────────────────────────────────

  function notifyBackground(session) {
    try {
      chrome.runtime.sendMessage({
        type: 'SESSION_UPDATED',
        sessionId: session.id,
        provider: session.provider,
        messageCount: session.messages.length,
        title: session.title
      });
    } catch (e) {
      // Extension context may be invalidated
    }
  }

  // ─── Observer Setup ───────────────────────────────────────────────────────

  function setupObserver(targetSelector, extractFn) {
    if (observerActive) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          clearTimeout(captureDebouncer);
          captureDebouncer = setTimeout(() => {
            extractFn();
          }, DEBOUNCE_MS);
        }
      }
    });

    const attach = () => {
      const target = document.querySelector(targetSelector) || document.body;
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true
      });
      observerActive = true;
    };

    if (document.readyState === 'complete') {
      attach();
    } else {
      window.addEventListener('load', attach);
    }

    return observer;
  }

  // ─── Message Listener ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_CURRENT_SESSION') {
      if (currentSession) {
        sendResponse({ session: currentSession, isCapturing });
      } else {
        sendResponse({ session: null, isCapturing });
      }
      return true;
    }
    
    if (message.type === 'INJECT_PROMPT') {
      window.dispatchEvent(new CustomEvent('aibridge_inject', {
        detail: { prompt: message.prompt, provider: message.provider }
      }));
      sendResponse({ ok: true });
      return true;
    }
    
    if (message.type === 'START_CAPTURE') {
      isCapturing = true;
      console.log('[AI Bridge] Capture started');
      sendResponse({ ok: true, isCapturing });
      return true;
    }
    
    if (message.type === 'STOP_CAPTURE') {
      isCapturing = false;
      console.log('[AI Bridge] Capture stopped');
      // Save current session when stopping
      if (currentSession) {
        saveSession(currentSession);
      }
      sendResponse({ ok: true, isCapturing });
      return true;
    }
    
    if (message.type === 'GET_CAPTURE_STATE') {
      sendResponse({ isCapturing });
      return true;
    }
    
    return true;
  });

  return {
    addMessage,
    getCurrentSession,
    setupObserver,
    compress,
    decompress,
    saveSession,
    isCapturing: () => isCapturing
  };
})();

window.AIBridgeCore = AIBridgeCore;
