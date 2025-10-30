// popup.js - Popup script for NotebookLM Citation Mapper

document.addEventListener('DOMContentLoaded', function() {
  const statusText = document.getElementById('status-text');
  const mappingsContainer = document.getElementById('mappings-container');
  const copyBtn = document.getElementById('copy-btn');
  const copyChatBtn = document.getElementById('copy-chat-btn');
  const rescanBtn = document.getElementById('rescan-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const errorMessage = document.getElementById('error-message');

  let currentMappings = [];

  // Storage helper functions
  function saveToHistory(text, mappings, type) {
    chrome.storage.local.get(['citationHistory'], (result) => {
      const history = result.citationHistory || [];

      // Create preview (first 100 characters)
      const preview = text.substring(0, 100).replace(/\n/g, ' ');

      const historyItem = {
        timestamp: new Date().toISOString(),
        preview: preview,
        count: mappings.length,
        type: type, // 'chat' or 'mappings'
        fullText: text,
        mappings: mappings
      };

      // Add to beginning of array
      history.unshift(historyItem);

      // Keep only last 100 entries
      const trimmedHistory = history.slice(0, 100);

      chrome.storage.local.set({ citationHistory: trimmedHistory });
    });
  }

  function updateStatistics(mappings) {
    chrome.storage.local.get(['statistics'], (result) => {
      const stats = result.statistics || {
        totalCitations: 0,
        totalCopies: 0,
        uniqueDocs: 0,
        sessions: 0,
        topSources: []
      };

      // Update counts
      stats.totalCitations += mappings.length;
      stats.totalCopies += 1;

      // Track unique documents
      const docSet = new Set();
      mappings.forEach(m => docSet.add(m.filename));

      // Update top sources
      const sourceCount = {};
      mappings.forEach(m => {
        sourceCount[m.filename] = (sourceCount[m.filename] || 0) + 1;
      });

      // Merge with existing top sources
      const existingTopSources = stats.topSources || [];
      existingTopSources.forEach(source => {
        sourceCount[source.filename] = (sourceCount[source.filename] || 0) + source.count;
      });

      // Convert to array and sort
      stats.topSources = Object.entries(sourceCount).map(([filename, count]) => ({
        filename,
        count
      })).sort((a, b) => b.count - a.count);

      // Update unique docs (all time)
      const allDocs = new Set(stats.topSources.map(s => s.filename));
      stats.uniqueDocs = allDocs.size;

      chrome.storage.local.set({ statistics: stats });
    });
  }

  function incrementSessionCount() {
    chrome.storage.local.get(['statistics'], (result) => {
      const stats = result.statistics || {
        totalCitations: 0,
        totalCopies: 0,
        uniqueDocs: 0,
        sessions: 0,
        topSources: []
      };

      stats.sessions += 1;
      chrome.storage.local.set({ statistics: stats });
    });
  }

  // Increment session count on popup open
  incrementSessionCount();

  // Load and apply theme
  function applyTheme(theme) {
    if (theme === 'auto') {
      // Use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else if (theme === 'dark') {
      document.body.setAttribute('data-theme', 'dark');
    } else {
      document.body.removeAttribute('data-theme');
    }
  }

  // Load theme from storage
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || { theme: 'light' };
    applyTheme(settings.theme);
  });

  // Listen for theme changes from settings page
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.settings) {
      const newSettings = changes.settings.newValue;
      if (newSettings && newSettings.theme) {
        applyTheme(newSettings.theme);
      }
    }
  });

  // Listen for system theme changes (for auto mode)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    chrome.storage.sync.get(['settings'], (result) => {
      const settings = result.settings || { theme: 'light' };
      if (settings.theme === 'auto') {
        document.body.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    });
  });

  // Check if we're on NotebookLM
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];

    if (!currentTab.url.includes('notebooklm.google.com')) {
      statusText.textContent = 'Please open Google NotebookLM';
      statusText.style.color = '#d93025';
      mappingsContainer.innerHTML = '<div class="loading">This extension only works on notebooklm.google.com</div>';
      copyBtn.disabled = true;
      copyChatBtn.disabled = true;
      rescanBtn.disabled = true;
      return;
    }

    // Request mappings from content script
    loadMappings();
  });

  // Load mappings from content script
  function loadMappings() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getMappings'}, function(response) {
        if (chrome.runtime.lastError) {
          statusText.textContent = 'Error connecting to page';
          statusText.style.color = '#d93025';
          mappingsContainer.innerHTML = '<div class="loading">Could not connect to NotebookLM. Please refresh the page.</div>';
          return;
        }

        if (response && response.mappings) {
          currentMappings = response.mappings;
          displayMappings(response.mappings);
        }
      });
    });
  }

  // Display mappings in the popup
  function displayMappings(mappings) {
    if (mappings.length === 0) {
      statusText.textContent = 'No citations found';
      statusText.style.color = '#ea8600';
      mappingsContainer.innerHTML = '<div class="loading">No citations detected on the page yet.</div>';
      copyBtn.disabled = true;
      return;
    }

    statusText.textContent = `Found ${mappings.length} citation${mappings.length > 1 ? 's' : ''}`;
    statusText.style.color = '#188038';

    // Sort mappings by citation number
    mappings.sort((a, b) => parseInt(a.citation) - parseInt(b.citation));

    // Build HTML
    let html = '';
    mappings.forEach(mapping => {
      html += `
        <div class="mapping-item">
          <span class="citation-num">Citation ${mapping.citation}</span> → 
          ${mapping.filename}
        </div>
      `;
    });

    mappingsContainer.innerHTML = html;
    copyBtn.disabled = false;
    copyChatBtn.disabled = false;
  }

  // Copy mappings to clipboard
  copyBtn.addEventListener('click', function() {
    if (currentMappings.length === 0) return;

    let text = 'NotebookLM Citation Mappings\n';
    text += '===========================\n\n';

    currentMappings.forEach(mapping => {
      text += `Citation ${mapping.citation} → ${mapping.filename}\n`;
    });

    // Use Chrome API to copy to clipboard
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);

    // Save to history and update statistics
    saveToHistory(text, currentMappings, 'mappings');
    updateStatistics(currentMappings);

    // Show feedback
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    copyBtn.style.background = '#188038';

    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.style.background = '#4285f4';
    }, 2000);
  });

  // Rescan the page
  rescanBtn.addEventListener('click', function() {
    rescanBtn.disabled = true;
    rescanBtn.textContent = 'Rescanning...';

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'rescan'}, function(response) {
        if (chrome.runtime.lastError) {
          showError('Failed to rescan. Please refresh the page.');
          rescanBtn.disabled = false;
          rescanBtn.textContent = 'Rescan Page';
          return;
        }

        // Reload mappings after rescan
        setTimeout(() => {
          loadMappings();
          rescanBtn.disabled = false;
          rescanBtn.textContent = 'Rescan Page';
        }, 500);
      });
    });
  });

  // Copy chat text with citations
  copyChatBtn.addEventListener('click', function() {
    if (currentMappings.length === 0) {
      showError('No citations found. Please rescan.');
      return;
    }

    copyChatBtn.disabled = true;
    copyChatBtn.textContent = 'Extracting text...';

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getChatText'}, function(response) {
        if (chrome.runtime.lastError || !response) {
          showError('Error extracting chat text.');
          copyChatBtn.disabled = false;
          copyChatBtn.textContent = '📄 Copy Text with Sources';
          return;
        }

        if (!response.chatText) {
          showError('No chat text found.');
          copyChatBtn.disabled = false;
          copyChatBtn.textContent = '📄 Copy Text with Sources';
          return;
        }

        // Build the full text with citations at the end
        let fullText = response.chatText;
        fullText += '\n\n─────────────────────\n';
        fullText += 'Sources:\n';

        // Add citation mappings
        currentMappings.forEach(mapping => {
          fullText += `[${mapping.citation}] → ${mapping.filename}\n`;
        });

        // Copy to clipboard
        const textArea = document.createElement('textarea');
        textArea.value = fullText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        // Save to history and update statistics
        saveToHistory(fullText, currentMappings, 'chat');
        updateStatistics(currentMappings);

        // Show feedback
        copyChatBtn.textContent = '✓ Copied!';
        copyChatBtn.style.background = '#188038';

        setTimeout(() => {
          copyChatBtn.textContent = '📄 Copy Text with Sources';
          copyChatBtn.style.background = '#34a853';
          copyChatBtn.disabled = false;
        }, 2000);
      });
    });
  });

  // Show error message
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';

    setTimeout(() => {
      errorMessage.style.display = 'none';
    }, 5000);
  }

  // Open settings page
  settingsBtn.addEventListener('click', function() {
    chrome.tabs.create({ url: 'settings.html' });
  });
});
