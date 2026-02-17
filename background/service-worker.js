// AI Bridge - Background Service Worker v2.0
// Handles multi-model AI API calls (Gemini, OpenAI, Anthropic), session management, and cross-tab communication

// LZString compression (inline for service worker)
const LZString = {
  compressToBase64: (str) => {
    try {
      return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m, p) => String.fromCharCode(parseInt(p, 16))));
    } catch (e) {
      console.error('Compression failed:', e);
      return null;
    }
  }
};

// ─── API Configuration ─────────────────────────────────────────────────────

const API_CONFIG = {
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-pro']
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o', 'gpt-4o-mini']
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-latest',
    models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest']
  }
};

// ─── Context Mode Prompts ──────────────────────────────────────────────────

const MODE_PROMPTS = {
  coding: `You are analyzing a programming conversation to create a continuation brief.
PRIORITY: Source code, architecture decisions, function signatures, errors, stack traces, and technical implementations.
IGNORE: General chitchat, greetings, off-topic discussions.
OUTPUT FORMAT: Structured technical handoff.`,

  debugging: `You are analyzing a debugging session to create a continuation brief.
PRIORITY: Error messages, stack traces, attempted fixes, root cause hypotheses, environment details.
INCLUDE: Every error encountered, every solution tried (even failed ones), current state of the bug.
OUTPUT FORMAT: Debug session handoff with clear "SOLVED/UNSOLVED" status.`,

  brainstorming: `You are analyzing a brainstorming session to create a continuation brief.
PRIORITY: Core concepts, ideas explored, promising directions, rejected paths and WHY they were rejected.
PRESERVE: Creative leaps, metaphors used, and the reasoning behind each idea cluster.
OUTPUT FORMAT: Idea map with current focus area clearly marked.`,

  documentation: `You are analyzing a documentation writing session to create a continuation brief.
PRIORITY: What has been documented, style guidelines established, gaps identified, examples created.
INCLUDE: Tone, audience, and format decisions made.
OUTPUT FORMAT: Documentation progress tracker.`,

  research: `You are analyzing a research session to create a continuation brief.
PRIORITY: Research questions, findings so far, sources referenced, hypotheses being tested.
INCLUDE: What's been confirmed, what's uncertain, and what needs more investigation.
OUTPUT FORMAT: Research journal summary.`,

  general: `You are analyzing an AI conversation to create a continuation brief.
PRIORITY: Main goals, key information exchanged, decisions made, current state, next steps.
OUTPUT FORMAT: Concise conversation handoff.`
};

// ─── Provider Adapters ─────────────────────────────────────────────────────

const PROVIDER_ADAPTERS = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    formatPrompt: (summary) => {
      return `[CONTINUING FROM PREVIOUS AI SESSION]\n\n${summary}\n\n---\nPlease acknowledge you understand the context above and are ready to continue from where we left off. Then proceed with the next step.`;
    }
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    formatPrompt: (summary) => {
      return `<context_transfer>\n${summary}\n</context_transfer>\n\nI was working on this with another AI assistant and need to continue. Please review the context above and help me continue from where we left off.`;
    }
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    formatPrompt: (summary) => {
      return `Context from previous AI conversation:\n\n${summary}\n\nPlease continue helping me from this point, acknowledging the work already done.`;
    }
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    formatPrompt: (summary) => {
      return `I'm continuing a conversation from another AI. Here's the context:\n\n${summary}\n\nBased on this, please help me continue.`;
    }
  },
  copilot: {
    name: 'Copilot',
    url: 'https://copilot.microsoft.com',
    formatPrompt: (summary) => {
      return `Previous AI conversation context:\n\n${summary}\n\nPlease continue from this point, understanding the context already established.`;
    }
  },
  mistral: {
    name: 'Mistral',
    url: 'https://chat.mistral.ai',
    formatPrompt: (summary) => {
      return `Context transfer from another AI:\n\n${summary}\n\nPlease review this context and continue assisting me from where we left off.`;
    }
  },
  huggingface: {
    name: 'HuggingFace',
    url: 'https://huggingface.co/chat',
    formatPrompt: (summary) => {
      return `Previous AI session summary:\n\n${summary}\n\nPlease continue the conversation from this point.`;
    }
  }
};

// ─── Gemini API Integration ────────────────────────────────────────────────

async function processWithGemini(conversationData, mode, apiKey, model = 'gemini-2.0-flash') {
  const { messages, title } = conversationData;
  const modePrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.general;

  const transcript = messages.map(m => {
    const role = m.role === 'user' ? 'USER' : 'AI ASSISTANT';
    return `[${role}]:\n${m.content}`;
  }).join('\n\n---\n\n');

  const codeBlocks = messages
    .flatMap(m => m.codeBlocks || [])
    .filter(b => b.code?.length > 0)
    .map(b => `\`\`\`${b.language}\n${b.code}\n\`\`\``)
    .join('\n\n');

  const systemInstruction = `${modePrompt}

Create a CONTINUATION BRIEF that allows someone to seamlessly resume this conversation with a new AI.

Your output MUST include these sections:
1. **OBJECTIVE** - The main goal being pursued (1-2 sentences)
2. **PROGRESS** - What has been accomplished so far
3. **CURRENT STATE** - Where things stand right now (the last meaningful point)
4. **BLOCKERS** - Any unresolved issues, errors, or obstacles
5. **ATTEMPTED SOLUTIONS** - What has been tried (especially important for debugging)
6. **KEY CONTEXT** - Critical technical details, preferences, constraints
${codeBlocks ? '7. **RELEVANT CODE** - The most important code snippets' : ''}
8. **NEXT STEPS** - What should happen next to continue progress

Be concise but complete. The goal is maximum context with minimum tokens.`;

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: `${systemInstruction}\n\n=== CONVERSATION TRANSCRIPT ===\n\nTitle: ${title}\n\n${transcript}` }]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
      topP: 0.8
    }
  };

  const response = await fetch(`${API_CONFIG.gemini.baseUrl}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Gemini API error: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message || errorMessage;
    } catch (e) {}
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!summary) throw new Error('No summary generated from Gemini');
  return summary;
}

// ─── OpenAI API Integration ────────────────────────────────────────────────

async function processWithOpenAI(conversationData, mode, apiKey, model = 'gpt-4o-mini') {
  const { messages, title } = conversationData;
  const modePrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.general;

  const transcript = messages.map(m => {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    return `${role}: ${m.content}`;
  }).join('\n\n');

  const systemPrompt = `${modePrompt}

Create a CONTINUATION BRIEF that allows someone to seamlessly resume this conversation with a new AI.

Your output MUST include these sections:
1. **OBJECTIVE** - The main goal being pursued (1-2 sentences)
2. **PROGRESS** - What has been accomplished so far
3. **CURRENT STATE** - Where things stand right now
4. **BLOCKERS** - Any unresolved issues, errors, or obstacles
5. **ATTEMPTED SOLUTIONS** - What has been tried
6. **KEY CONTEXT** - Critical technical details, preferences, constraints
7. **NEXT STEPS** - What should happen next

Be concise but complete.`;

  const requestBody = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Conversation Title: ${title}\n\n=== CONVERSATION TRANSCRIPT ===\n\n${transcript}` }
    ],
    temperature: 0.3,
    max_tokens: 2048
  };

  const response = await fetch(`${API_CONFIG.openai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `OpenAI API error: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message || errorMessage;
    } catch (e) {}
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const summary = data.choices?.[0]?.message?.content;

  if (!summary) throw new Error('No summary generated from OpenAI');
  return summary;
}

// ─── Anthropic API Integration ─────────────────────────────────────────────

async function processWithAnthropic(conversationData, mode, apiKey, model = 'claude-3-5-haiku-latest') {
  const { messages, title } = conversationData;
  const modePrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.general;

  const transcript = messages.map(m => {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    return `${role}: ${m.content}`;
  }).join('\n\n');

  const systemPrompt = `${modePrompt}

Create a CONTINUATION BRIEF that allows someone to seamlessly resume this conversation with a new AI.

Your output MUST include these sections:
1. **OBJECTIVE** - The main goal being pursued (1-2 sentences)
2. **PROGRESS** - What has been accomplished so far
3. **CURRENT STATE** - Where things stand right now
4. **BLOCKERS** - Any unresolved issues, errors, or obstacles
5. **ATTEMPTED SOLUTIONS** - What has been tried
6. **KEY CONTEXT** - Critical technical details, preferences, constraints
7. **NEXT STEPS** - What should happen next

Be concise but complete.`;

  const requestBody = {
    model: model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      { role: 'user', content: `Conversation Title: ${title}\n\n=== CONVERSATION TRANSCRIPT ===\n\n${transcript}` }
    ]
  };

  const response = await fetch(`${API_CONFIG.anthropic.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Anthropic API error: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message || errorMessage;
    } catch (e) {}
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const summary = data.content?.[0]?.text;

  if (!summary) throw new Error('No summary generated from Anthropic');
  return summary;
}

// ─── Main Processing Function ──────────────────────────────────────────────

async function processWithAI(conversationData, mode, apiKey, model) {
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Determine which API to use based on model name
      if (model.startsWith('gpt-')) {
        return await processWithOpenAI(conversationData, mode, apiKey, model);
      } else if (model.startsWith('claude-')) {
        return await processWithAnthropic(conversationData, mode, apiKey, model);
      } else {
        // Default to Gemini
        const geminiModel = model.startsWith('gemini-') ? model : API_CONFIG.gemini.defaultModel;
        return await processWithGemini(conversationData, mode, apiKey, geminiModel);
      }
    } catch (error) {
      lastError = error;
      console.error(`[AI Bridge] API call failed (attempt ${attempt}/${maxRetries}):`, error.message);
      
      // Don't retry on authentication errors
      if (error.message.includes('401') || error.message.includes('403')) {
        throw new Error('Invalid API key. Please check your API key in Settings.');
      }
      
      // Don't retry on rate limit errors after max retries
      if (error.message.includes('429') && attempt === maxRetries) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error('Failed to process with AI after multiple attempts');
}

// ─── Message Handlers ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[AI Bridge] Message received:', message.type);

  if (message.type === 'PROCESS_CONTEXT') {
    handleProcessContext(message, sendResponse);
    return true;
  }

  if (message.type === 'GET_SESSIONS') {
    chrome.storage.local.get('aibridge_index', (result) => {
      sendResponse({ sessions: result.aibridge_index || [] });
    });
    return true;
  }

  if (message.type === 'GET_SESSION_DATA') {
    const key = 'aibridge_session_' + message.sessionId;
    chrome.storage.local.get(key, (result) => {
      if (result[key]) {
        sendResponse({ compressed: result[key] });
      } else {
        sendResponse({ error: 'Session not found' });
      }
    });
    return true;
  }

  if (message.type === 'DELETE_SESSION') {
    const key = 'aibridge_session_' + message.sessionId;
    chrome.storage.local.remove(key, () => {
      chrome.storage.local.get('aibridge_index', (result) => {
        const index = (result.aibridge_index || []).filter(s => s.id !== message.sessionId);
        chrome.storage.local.set({ aibridge_index: index }, () => {
          sendResponse({ ok: true });
        });
      });
    });
    return true;
  }

  if (message.type === 'INJECT_TO_TAB') {
    handleInjection(message, sendResponse);
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ aibridge_settings: message.settings }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get('aibridge_settings', (result) => {
      sendResponse({ settings: result.aibridge_settings || {} });
    });
    return true;
  }

  if (message.type === 'RUN_CLEANUP') {
    runAutoDelete();
    sendResponse({ ok: true });
    return true;
  }

  return true;
});

async function handleProcessContext(message, sendResponse) {
  try {
    const { sessionData, mode, targetProvider, apiKey, model } = message;

    console.log('[AI Bridge] Processing context:', {
      sessionId: sessionData?.id,
      mode,
      targetProvider,
      model,
      hasApiKey: !!apiKey
    });

    if (!apiKey) {
      sendResponse({ error: 'No API key configured. Please add your API key in Settings.' });
      return;
    }

    if (!sessionData || !sessionData.messages || sessionData.messages.length === 0) {
      sendResponse({ error: 'No conversation data to process. Please ensure the session has messages.' });
      return;
    }

    // Process with selected AI model
    const summary = await processWithAI(sessionData, mode, apiKey, model);
    console.log('[AI Bridge] Summary generated successfully');

    // Format for target provider
    const adapter = PROVIDER_ADAPTERS[targetProvider];
    if (!adapter) {
      sendResponse({ error: `Unknown provider: ${targetProvider}` });
      return;
    }

    const formattedPrompt = adapter.formatPrompt(summary);

    // Store processed summary
    const processedKey = `aibridge_processed_${sessionData.id}_${targetProvider}`;
    chrome.storage.local.set({
      [processedKey]: {
        summary,
        formattedPrompt,
        mode,
        targetProvider,
        model,
        processedAt: Date.now()
      }
    });

    sendResponse({
      success: true,
      summary,
      formattedPrompt,
      targetProvider,
      targetUrl: adapter.url
    });

  } catch (e) {
    console.error('[AI Bridge] Error in handleProcessContext:', e);
    
    // Provide user-friendly error messages
    let errorMessage = e.message;
    if (errorMessage.includes('API key')) {
      errorMessage = 'Invalid or missing API key. Please check your API key in Settings.';
    } else if (errorMessage.includes('rate limit')) {
      errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
    } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      errorMessage = 'Network error. Please check your internet connection and try again.';
    } else if (errorMessage.includes('timeout')) {
      errorMessage = 'Request timed out. The conversation may be too long. Try a shorter session.';
    }
    
    sendResponse({ error: errorMessage });
  }
}

async function handleInjection(message, sendResponse) {
  const { targetProvider, prompt } = message;
  const adapter = PROVIDER_ADAPTERS[targetProvider];

  console.log('[AI Bridge] Handling injection for provider:', targetProvider);

  if (!adapter) {
    sendResponse({ error: 'Unknown provider' });
    return;
  }

  try {
    const tabs = await chrome.tabs.query({ url: adapter.url + '/*' });
    console.log('[AI Bridge] Found tabs:', tabs.length);

    if (tabs.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (prompt) => {
          window.dispatchEvent(new CustomEvent('aibridge_inject', { detail: { prompt } }));
        },
        args: [prompt]
      });
      await chrome.tabs.update(tabs[0].id, { active: true });
      console.log('[AI Bridge] Injected into existing tab:', tabs[0].id);
      sendResponse({ ok: true, tabId: tabs[0].id });
    } else {
      const tab = await chrome.tabs.create({ url: adapter.url });
      console.log('[AI Bridge] Created new tab:', tab.id);
      chrome.storage.local.set({ [`aibridge_pending_inject_${targetProvider}`]: { prompt, tabId: tab.id } });
      sendResponse({ ok: true, tabId: tab.id, newTab: true });
    }
  } catch (e) {
    console.error('[AI Bridge] Error in handleInjection:', e);
    sendResponse({ error: e.message });
  }
}

// Handle injection when tab loads
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;

  const providers = Object.keys(PROVIDER_ADAPTERS);
  for (const provider of providers) {
    const adapter = PROVIDER_ADAPTERS[provider];
    if (tab.url && tab.url.startsWith(adapter.url)) {
      const key = `aibridge_pending_inject_${provider}`;
      chrome.storage.local.get(key, (result) => {
        if (result[key] && result[key].tabId === tabId) {
          const { prompt } = result[key];
          console.log('[AI Bridge] Injecting pending prompt into tab:', tabId);
          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId },
              func: (p) => {
                window.dispatchEvent(new CustomEvent('aibridge_inject', { detail: { prompt: p } }));
              },
              args: [prompt]
            }).catch((e) => {
              console.error('[AI Bridge] Failed to inject script:', e);
            });
          }, 2000);
          chrome.storage.local.remove(key);
        }
      });
    }
  }
});

// Auto-delete old sessions if enabled
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'aibridge_auto_delete') {
    runAutoDelete();
  }
});

function runAutoDelete() {
  chrome.storage.local.get(['aibridge_settings', 'aibridge_index'], (result) => {
    const settings = result.aibridge_settings || {};
    if (!settings.autoDelete) return;

    const days = settings.autoDeleteDays || 7;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const index = result.aibridge_index || [];

    const toDelete = index.filter(s => s.lastUpdated < cutoff);
    if (toDelete.length === 0) return;

    const keysToRemove = toDelete.map(s => 'aibridge_session_' + s.id);
    chrome.storage.local.remove(keysToRemove, () => {
      const newIndex = index.filter(s => s.lastUpdated >= cutoff);
      chrome.storage.local.set({ aibridge_index: newIndex }, () => {
        console.log(`[AI Bridge] Auto-deleted ${toDelete.length} old sessions`);
        // Notify user
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'AI Bridge - Cleanup Complete',
          message: `Removed ${toDelete.length} old session(s) older than ${days} days.`
        });
        updateBadge();
      });
    });
  });
}

// Set up daily alarm for auto-delete
chrome.alarms.create('aibridge_auto_delete', { periodInMinutes: 1440 });

// ─── Badge Counter ──────────────────────────────────────────────────────────

function updateBadge() {
  chrome.storage.local.get('aibridge_index', (result) => {
    const count = (result.aibridge_index || []).length;
    const text = count > 0 && count < 100 ? String(count) : '';
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: '#00d4ff' });
  });
}

// Update badge when sessions change
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.aibridge_index) {
    updateBadge();
  }
});

// Initial badge update
updateBadge();

// ─── Context Menu ───────────────────────────────────────────────────────────

// Create context menu items
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'aibridge_save_selection',
    title: 'Save to AI Bridge',
    contexts: ['selection']
  });
  
  chrome.contextMenus.create({
    id: 'aibridge_export_session',
    title: 'Export Session as Markdown',
    contexts: ['all']
  });
  
  chrome.contextMenus.create({
    id: 'aibridge_open_popup',
    title: 'Open AI Bridge',
    contexts: ['action']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'aibridge_save_selection') {
    // Save selected text as a new session
    const session = {
      id: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      provider: 'web',
      url: tab.url,
      title: info.selectionText.substring(0, 60) + (info.selectionText.length > 60 ? '...' : ''),
      messages: [{
        role: 'user',
        content: info.selectionText,
        timestamp: Date.now(),
        type: 'text',
        codeBlocks: []
      }],
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      mode: 'general'
    };
    
    // Compress and save
    const compressed = LZString.compressToBase64(JSON.stringify(session));
    const key = 'aibridge_session_' + session.id;
    
    chrome.storage.local.set({ [key]: compressed }, () => {
      // Update index
      chrome.storage.local.get('aibridge_index', (result) => {
        let index = result.aibridge_index || [];
        index.unshift({
          id: session.id,
          provider: session.provider,
          title: session.title,
          messageCount: 1,
          lastUpdated: Date.now(),
          mode: session.mode
        });
        chrome.storage.local.set({ aibridge_index: index }, () => {
          updateBadge();
          chrome.tabs.sendMessage(tab.id, { type: 'SESSION_UPDATED' });
        });
      });
    });
  }
  
  if (info.menuItemId === 'aibridge_export_session') {
    // Open popup to select session for export
    chrome.action.openPopup();
  }
  
  if (info.menuItemId === 'aibridge_open_popup') {
    chrome.action.openPopup();
  }
});
