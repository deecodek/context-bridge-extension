// AI Bridge - Keyboard Shortcuts Handler
// Adds keyboard shortcuts for quick actions

const KeyboardShortcuts = (function() {
  const shortcuts = {
    // Main view
    's': 'focus_search',
    'n': 'new_session',
    'e': 'export_session',
    't': 'transfer_session',
    'f': 'toggle_favorite',
    'd': 'delete_session',
    '?': 'show_help',
    
    // Navigation
    'j': 'next_session',
    'k': 'prev_session',
    'g': 'go_to_top',
    'G': 'go_to_bottom',
    
    // Global
    'Escape': 'close_modal',
    'Enter': 'confirm_action'
  };

  let activeShortcuts = true;

  function init() {
    document.addEventListener('keydown', handleKeyDown);
  }

  function handleKeyDown(e) {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      // Except for Escape
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }

    // Don't trigger when modifier keys are pressed (except for specific combos)
    if (e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }

    const key = e.key.toLowerCase();
    const action = shortcuts[key];

    if (action) {
      e.preventDefault();
      executeAction(action);
    }
  }

  function executeAction(action) {
    console.log('[AI Bridge] Keyboard shortcut:', action);

    switch (action) {
      case 'focus_search':
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
          searchInput.focus();
        }
        break;

      case 'export_session':
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn && !exportBtn.disabled) {
          exportBtn.click();
        }
        break;

      case 'transfer_session':
        const transferBtn = document.getElementById('transferBtn');
        if (transferBtn && !transferBtn.disabled) {
          transferBtn.click();
        }
        break;

      case 'toggle_favorite':
        const favBtn = document.querySelector('[data-fav]');
        if (favBtn) {
          favBtn.click();
        }
        break;

      case 'delete_session':
        const delBtn = document.querySelector('[data-del]');
        if (delBtn) {
          delBtn.click();
        }
        break;

      case 'next_session':
        navigateSessions(1);
        break;

      case 'prev_session':
        navigateSessions(-1);
        break;

      case 'show_help':
        showHelpModal();
        break;

      case 'close_modal':
        closeModals();
        break;
    }
  }

  function navigateSessions(direction) {
    const cards = document.querySelectorAll('.session-card');
    if (cards.length === 0) return;

    const selectedCard = document.querySelector('.session-card.selected');
    let currentIndex = -1;

    if (selectedCard) {
      currentIndex = Array.from(cards).indexOf(selectedCard);
    }

    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = cards.length - 1;
    if (newIndex >= cards.length) newIndex = 0;

    cards[newIndex].click();
    cards[newIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showHelpModal() {
    const helpContent = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 15px; color: var(--text-primary);">Keyboard Shortcuts</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div><kbd style="background: var(--bg-elevated); padding: 4px 8px; border-radius: 4px;">s</kbd> Focus search</div>
          <div><kbd style="background: var(--bg-elevated); padding: 4px 8px; border-radius: 4px;">e</kbd> Export session</div>
          <div><kbd style="background: var(--bg-elevated); padding: 4px 8px; border-radius: 4px;">t</kbd> Transfer session</div>
          <div><kbd style="background: var(--bg-elevated); padding: 4px 8px; border-radius: 4px;">f</kbd> Toggle favorite</div>
          <div><kbd style="background: var(--bg-elevated); padding: 4px 8px; border-radius: 4px;">d</kbd> Delete session</div>
          <div><kbd style="background: var(--bg-elevated); padding: 4px 8px; border-radius: 4px;">j/k</kbd> Navigate sessions</div>
          <div><kbd style="background: var(--bg-elevated); padding: 4px 8px; border-radius: 4px;">?</kbd> Show this help</div>
          <div><kbd style="background: var(--bg-elevated); padding: 4px 8px; border-radius: 4px;">Esc</kbd> Close modal</div>
        </div>
        <p style="margin-top: 15px; font-size: 11px; color: var(--text-muted);">Press any key to close</p>
      </div>
    `;

    // Simple toast-style help
    const helpDiv = document.createElement('div');
    helpDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      z-index: 3000;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      max-width: 400px;
    `;
    helpDiv.innerHTML = helpContent;
    document.body.appendChild(helpDiv);

    const closeHandler = () => {
      helpDiv.remove();
      document.removeEventListener('keydown', closeHandler);
    };
    setTimeout(() => {
      document.addEventListener('keydown', closeHandler);
    }, 100);
  }

  function closeModals() {
    // Close any open modals
    const modals = document.querySelectorAll('.modal-overlay, .toast');
    modals.forEach(modal => {
      modal.classList.remove('show', 'active');
      setTimeout(() => modal.remove(), 300);
    });

    // Go back to main view
    const mainView = document.getElementById('viewMain');
    if (mainView) {
      const views = document.querySelectorAll('.view');
      views.forEach(view => view.classList.remove('active'));
      mainView.classList.add('active');
    }
  }

  return { init };
})();

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    KeyboardShortcuts.init();
  });
}
