// AI Bridge - Perplexity Provider
// Captures conversations from perplexity.ai

(function() {
  const PROVIDER = 'perplexity';

  function extractMessages() {
    const session = AIBridgeCore.getCurrentSession(PROVIDER);
    if (!session) return;

    session.messages = [];

    // Perplexity query elements
    document.querySelectorAll('[class*="UserMessage"], [class*="userMessage"], [data-testid="query"]').forEach(el => {
      const content = el.innerText.trim();
      if (content.length < 2) return;
      AIBridgeCore.addMessage('user', content, PROVIDER);
    });

    // Perplexity answer elements
    document.querySelectorAll('[class*="AnswerContainer"], [class*="answerContainer"], [class*="ProseBlock"], [data-testid="answer"]').forEach(el => {
      const content = el.innerText.trim();
      if (content.length < 2) return;
      AIBridgeCore.addMessage('assistant', content, PROVIDER);
    });

    // Fallback: look for markdown prose blocks
    if (session.messages.length === 0) {
      document.querySelectorAll('.prose, [class*="markdown"]').forEach(el => {
        const content = el.innerText.trim();
        if (content.length < 2) return;
        AIBridgeCore.addMessage('assistant', content, PROVIDER);
      });
    }
  }

  function handleInjection(e) {
    const { prompt } = e.detail;

    const textarea = document.querySelector('textarea[placeholder*="Ask"], textarea[placeholder*="Follow"], textarea');
    if (!textarea) return;

    textarea.focus();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeInputValueSetter.call(textarea, prompt);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  window.addEventListener('aibridge_inject', handleInjection);

  AIBridgeCore.setupObserver('[class*="conversation"], main', extractMessages);

  setTimeout(extractMessages, 2000);
  setTimeout(extractMessages, 5000);
})();
