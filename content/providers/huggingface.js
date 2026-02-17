// AI Bridge - HuggingFace Chat Provider
// Handles message capture and injection for HuggingFace Chat

(function() {
  'use strict';

  console.log('[AI Bridge] HuggingFace provider loaded');

  // HuggingFace-specific selectors
  const SELECTORS = {
    conversationContainer: 'div[class*="conversation"]',
    messageContainer: 'div[class*="messages"]',
    message: 'div[class*="message"]',
    userMessage: 'div[class*="user"]',
    botMessage: 'div[class*="assistant"]',
    content: 'div[class*="content"] p',
    inputArea: 'textarea[placeholder*="message"]'
  };

  // Extract messages from HuggingFace Chat
  function extractMessages() {
    const messages = [];
    const messageElements = document.querySelectorAll(SELECTORS.message);

    messageElements.forEach(el => {
      const contentEl = el.querySelector(SELECTORS.content);
      const content = contentEl?.textContent?.trim() || el.textContent?.trim() || '';
      if (!content || content.length < 2) return;

      const isUser = el.classList.toString().toLowerCase().includes('user') || 
                     el.querySelector(SELECTORS.userMessage);

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
    console.log('[AI Bridge] HuggingFace capture initialized');

    // Use core module
    if (window.AIBridgeCore) {
      window.AIBridgeCore.setupObserver(
        SELECTORS.conversationContainer,
        () => {
          const messages = extractMessages();
          messages.forEach(msg => {
            window.AIBridgeCore.addMessage(msg.role, msg.content, 'huggingface');
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

  // Inject prompt into HuggingFace Chat
  function injectPrompt(prompt) {
    const inputArea = document.querySelector(SELECTORS.inputArea);
    if (!inputArea) {
      console.warn('[AI Bridge] HuggingFace input area not found');
      return;
    }

    // Focus and insert text
    inputArea.focus();
    
    // Use native input event for React compatibility
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 
      'value'
    ).set;
    
    nativeInputValueSetter.call(inputArea, prompt);
    inputArea.dispatchEvent(new Event('input', { bubbles: true }));
    
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
      background: #fbbf24;
      color: #1f2937;
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
