// AI Bridge - Gemini Provider
// Captures conversations from gemini.google.com

(function() {
  const PROVIDER = 'gemini';

  function extractMessages() {
    const session = AIBridgeCore.getCurrentSession(PROVIDER);
    if (!session) return;

    session.messages = [];

    // Gemini query bubbles
    document.querySelectorAll('.query-text, [class*="query-content"], user-query').forEach(el => {
      const content = el.innerText.trim();
      if (content.length < 2) return;
      AIBridgeCore.addMessage('user', content, PROVIDER);
    });

    // Gemini response containers
    document.querySelectorAll('model-response, [class*="response-container"], .response-content').forEach(el => {
      const content = el.innerText.trim();
      if (content.length < 2) return;
      AIBridgeCore.addMessage('assistant', content, PROVIDER);
    });

    // Fallback: look for conversation turns
    if (session.messages.length === 0) {
      document.querySelectorAll('[class*="conversation-turn"], [class*="chat-turn"]').forEach(el => {
        const isUser = el.querySelector('[class*="user"], [class*="human"]');
        const content = el.innerText.trim();
        if (content.length < 2) return;
        AIBridgeCore.addMessage(isUser ? 'user' : 'assistant', content, PROVIDER);
      });
    }
  }

  function handleInjection(e) {
    const { prompt } = e.detail;

    const textarea = document.querySelector('rich-textarea [contenteditable], textarea.input-area, [class*="input-box"] [contenteditable]');
    if (!textarea) return;

    textarea.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, prompt);
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }

  window.addEventListener('aibridge_inject', handleInjection);

  AIBridgeCore.setupObserver('chat-window, main, [class*="conversation"]', extractMessages);

  setTimeout(extractMessages, 2000);
  setTimeout(extractMessages, 5000);
})();
