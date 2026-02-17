// AI Bridge - Background Service Worker
// Handles Gemini API calls, session management, and cross-tab communication

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ─── Context Mode Prompts ─────────────────────────────────────────────────────

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

// ─── Provider Adapters ────────────────────────────────────────────────────────

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
      return `<context_transfer>\n${summary}\n</context_transfer>\n\nI was working on this with another AI assistant and need to continue. Please review the context above and help me continue from the current state.`;
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
  }
};

// ─── Gemini API Integration ───────────────────────────────────────────────────

async function processWithGemini(conversationData, mode, apiKey) {
  const { messages, title } = conversationData;

  const modePrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.general;

  // Build conversation transcript
  const transcript = messages.map(m => {
    const role = m.role === 'user' ? 'USER' : 'AI ASSISTANT';
    return `[${role}]:\n${m.content}`;
  }).join('\n\n---\n\n');

  const codeBlocks = messages
    .flatMap(m => m.codeBlocks || [])
    .filter(b => b.code.length > 0)
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
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${systemInstruction}\n\n=== CONVERSATION TRANSCRIPT ===\n\nTitle: ${title}\n\n${transcript}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
      topP: 0.8
    }
  };

  console.log('[AI Bridge] Sending request to Gemini API:', GEMINI_API_BASE);
  console.log('[AI Bridge] Request body:', JSON.stringify(requestBody, null, 2));

  const response = await fetch(`${GEMINI_API_BASE}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  console.log('[AI Bridge] Response status:', response.status, response.statusText);

  if (!response.ok) {
    let errorMessage = `Gemini API error: ${response.status}`;
    try {
      const errorText = await response.text();
      console.error('[AI Bridge] Error response body:', errorText);
      if (errorText) {
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          console.error('[AI Bridge] Could not parse error response as JSON');
        }
      }
    } catch (e) {
      console.error('[AI Bridge] Failed to read error response:', e);
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  console.log('[AI Bridge] Response data:', JSON.stringify(data, null, 2));
  const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!summary) throw new Error('No summary generated from Gemini');

  return summary;
}

// ─── Message Handlers ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[AI Bridge] Message received:', message.type, sender);

  if (message.type === 'PROCESS_CONTEXT') {
    handleProcessContext(message, sendResponse);
    return true; // Keep async
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
        try {
          // We need LZString here - use the stored string directly
          sendResponse({ compressed: result[key] });
        } catch (e) {
          console.error('[AI Bridge] Error decompressing session:', e);
          sendResponse({ error: e.message });
        }
      } else {
        console.error('[AI Bridge] Session not found:', message.sessionId);
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
});

async function handleProcessContext(message, sendResponse) {
  try {
    const { sessionData, mode, targetProvider, apiKey } = message;

    console.log('[AI Bridge] Processing context:', { 
      sessionId: sessionData?.id, 
      mode, 
      targetProvider,
      hasApiKey: !!apiKey 
    });

    if (!apiKey) {
      console.error('[AI Bridge] No Gemini API key provided');
      sendResponse({ error: 'No Gemini API key configured. Please add your API key in Settings.' });
      return;
    }

    // Process with Gemini
    const summary = await processWithGemini(sessionData, mode, apiKey);
    console.log('[AI Bridge] Summary generated successfully');

    // Format for target provider
    const adapter = PROVIDER_ADAPTERS[targetProvider];
    if (!adapter) {
      console.error('[AI Bridge] Unknown provider:', targetProvider);
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
    sendResponse({ error: e.message });
  }
}

async function handleInjection(message, sendResponse) {
  const { targetProvider, prompt } = message;
  const adapter = PROVIDER_ADAPTERS[targetProvider];
  
  console.log('[AI Bridge] Handling injection for provider:', targetProvider);
  
  if (!adapter) {
    console.error('[AI Bridge] Unknown provider:', targetProvider);
    sendResponse({ error: 'Unknown provider' });
    return;
  }

  try {
    // Find tab with the target provider
    const tabs = await chrome.tabs.query({ url: adapter.url + '/*' });
    console.log('[AI Bridge] Found tabs for', adapter.url + '/*', ':', tabs.length);

    if (tabs.length > 0) {
      // Inject into existing tab
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
      // Open new tab
      const tab = await chrome.tabs.create({ url: adapter.url });
      console.log('[AI Bridge] Created new tab for provider:', tab.id);
      // Store prompt to inject after page loads
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
          console.log('[AI Bridge] Injecting pending prompt into tab:', tabId, 'provider:', provider);
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
          }, 3000);
          chrome.storage.local.remove(key);
        }
      });
    }
  }
});
