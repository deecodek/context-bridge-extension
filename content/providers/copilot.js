// AI Bridge - Microsoft Copilot Provider
// Handles message capture and injection for Microsoft Copilot

(function() {
  'use strict';

  console.log('[AI Bridge] Copilot provider loaded');

  // Copilot-specific selectors
  const SELECTORS = {
    conversationContainer: 'div.cib-conversation',
    messageContainer: 'div.ac-activity-container',
    message: 'div.ac-card',
    userMessage: 'div.ac-user',
    botMessage: 'div.ac-ai',
    content: 'div.ac-text',
    inputArea: 'div.cib-serp-main-input'
  };

  // Extract messages from Copilot
  function extractMessages() {
    const messages = [];
    const messageElements = document.querySelectorAll(SELECTORS.message);

    messageElements.forEach(el => {
      const contentEl = el.querySelector(SELECTORS.content);
      if (!contentEl) return;

      const content = contentEl.textContent?.trim() || '';
      if (!content) return;

      const isUser = el.classList.contains('ac-user') || 
                     el.querySelector(SELECTORS.userMessage) ||
                     contentEl.closest('.ac-user');

      messages.push({
        role: isUser ? 'user' : 'assistant',
        content: content,
        timestamp: Date.now()
      });
    });

    return messages;
  }

  // Initialize capture
  function init() {
    console.log('[AI Bridge] Copilot capture initialized');

    // Use core module
    if (window.AIBridgeCore) {
      window.AIBridgeCore.setupObserver(
        SELECTORS.conversationContainer,
        () => {
          const messages = extractMessages();
          messages.forEach(msg => {
            window.AIBridgeCore.addMessage(msg.role, msg.content, 'copilot');
          });
        }
      );
    }

    // Listen for injection events
    window.addEventListener('aibridge_inject', (e) => {
      const { prompt } = e.detail;
      injectPrompt(prompt);
    });
  }

  // Inject prompt into Copilot
  function injectPrompt(prompt) {
    const inputArea = document.querySelector(SELECTORS.inputArea);
    if (!inputArea) {
      console.warn('[AI Bridge] Copilot input area not found');
      return;
    }

    // Focus and insert text
    inputArea.focus();
    document.execCommand('insertText', false, prompt);
    
    // Show notification
    showNotification('Context injected! Press Enter to send.');
  }

  // Show notification
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #0078d4;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  // Wait for page to load
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
