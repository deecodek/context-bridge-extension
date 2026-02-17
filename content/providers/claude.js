// AI Bridge - Claude Provider
// Captures conversations from claude.ai

(function() {
  const PROVIDER = 'claude';

  function extractMessages() {
    // Claude uses specific data attributes and class patterns
    const userMessages = document.querySelectorAll('[data-testid="user-message"], .human-turn, [class*="HumanMessage"]');
    const assistantMessages = document.querySelectorAll('[data-testid="assistant-message"], .assistant-turn, [class*="AssistantMessage"]');

    const allMessages = [];

    document.querySelectorAll('[data-testid="user-message"]').forEach(el => {
      allMessages.push({ role: 'user', el, order: getElementOrder(el) });
    });

    document.querySelectorAll('[data-testid="assistant-message"]').forEach(el => {
      allMessages.push({ role: 'assistant', el, order: getElementOrder(el) });
    });

    // Fallback: try generic message containers
    if (allMessages.length === 0) {
      document.querySelectorAll('[class*="message-block"], [class*="MessageBlock"]').forEach(el => {
        const isHuman = el.querySelector('[class*="human"], [class*="Human"]');
        allMessages.push({
          role: isHuman ? 'user' : 'assistant',
          el,
          order: getElementOrder(el)
        });
      });
    }

    allMessages.sort((a, b) => a.order - b.order);

    const session = AIBridgeCore.getCurrentSession(PROVIDER);
    if (!session) return;

    session.messages = [];

    allMessages.forEach(({ role, el }) => {
      const content = el.innerText.trim();
      if (content.length < 2) return;
      AIBridgeCore.addMessage(role, content, PROVIDER);
    });
  }

  function getElementOrder(el) {
    let order = 0;
    let node = el;
    while (node) {
      order += Array.from(node.parentNode?.children || []).indexOf(node);
      node = node.parentNode;
      if (node === document.body) break;
    }
    return order;
  }

  function handleInjection(e) {
    const { prompt } = e.detail;

    // Claude uses a contenteditable div
    const editor = document.querySelector('[contenteditable="true"][data-placeholder], .ProseMirror, [contenteditable="true"]');
    if (!editor) return;

    editor.focus();

    // Clear existing content
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('delete');

    // Insert new content
    document.execCommand('insertText', false, prompt);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
  }

  window.addEventListener('aibridge_inject', handleInjection);

  AIBridgeCore.setupObserver('[class*="conversation"], main, [class*="chat-window"]', extractMessages);

  setTimeout(extractMessages, 2000);
  setTimeout(extractMessages, 5000);
})();
