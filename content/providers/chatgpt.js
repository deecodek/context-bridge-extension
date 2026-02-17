// AI Bridge - ChatGPT Provider
// Captures conversations from chat.openai.com / chatgpt.com

(function() {
  const PROVIDER = 'chatgpt';

  function extractMessages() {
    // ChatGPT uses specific article elements for messages
    const messages = document.querySelectorAll('[data-message-author-role]');
    if (!messages.length) return;

    const session = AIBridgeCore.getCurrentSession(PROVIDER);
    if (!session) return;

    // Reset and re-capture all messages for accuracy
    session.messages = [];

    messages.forEach((el) => {
      const role = el.getAttribute('data-message-author-role'); // 'user' or 'assistant'
      const contentEl = el.querySelector('.markdown, [class*="message-content"], .prose');
      if (!contentEl) return;

      const content = contentEl.innerText.trim();
      if (content.length < 2) return;

      AIBridgeCore.addMessage(
        role === 'user' ? 'user' : 'assistant',
        content,
        PROVIDER
      );
    });
  }

  function handleInjection(e) {
    const { prompt } = e.detail;
    const textarea = document.querySelector('#prompt-textarea, textarea[data-id="root"], [contenteditable="true"][data-lexical-editor]');
    if (!textarea) return;

    if (textarea.getAttribute('contenteditable') === 'true') {
      textarea.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      textarea.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: prompt }));
      const p = document.createElement('p');
      p.textContent = prompt;
      textarea.appendChild(p);
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
    } else {
      textarea.focus();
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeInputValueSetter.call(textarea, prompt);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  window.addEventListener('aibridge_inject', handleInjection);

  // Start observing
  AIBridgeCore.setupObserver('[role="main"]', extractMessages);

  // Initial extraction after page load
  setTimeout(extractMessages, 2000);
  setTimeout(extractMessages, 5000);
})();
