// NotebookLM Citation Source Mapper Content Script (v3)

(function () {
  let isMapping = false;
  let currentMappings = [];
  const HOVER_WAIT_INTERVALS_MS = [140, 280, 520];
  const CLICK_FALLBACK_WAIT_INTERVALS_MS = [220, 500, 900];

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeWhitespace(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function cleanSnippet(snippet) {
    if (!snippet) return '';
    return normalizeWhitespace(snippet)
      .replace(/^["'`]+/, '')
      .replace(/["'`]+$/, '');
  }

  function normalizeSentenceSpacing(text) {
    return cleanSnippet(text)
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([([])\s+/g, '$1')
      .replace(/\s+([\])])/g, '$1');
  }

  function parseCitationPayload(payload) {
    const raw = normalizeWhitespace(payload);
    let filename = raw;
    let snippet = '';

    // NotebookLM sometimes includes quoted excerpt text in the aria-label payload.
    const quotedMatch = raw.match(/[“"']([^"”']{8,})[”"']/);
    if (quotedMatch) {
      snippet = cleanSnippet(quotedMatch[1]);
      filename = normalizeWhitespace(raw.replace(quotedMatch[0], ''));
      filename = filename.replace(/[–—-]\s*$/, '').replace(/,\s*$/, '').trim();
    }

    return {
      filename: filename || raw,
      snippet,
    };
  }

  function mergeCitationData(existing, incoming) {
    if (!existing) return incoming;
    return {
      citation: incoming.citation || existing.citation,
      filename: incoming.filename || existing.filename,
      snippet: incoming.snippet || existing.snippet || '',
    };
  }

  function getCitationButtonsByNumber() {
    const map = new Map();
    const buttons = Array.from(document.querySelectorAll('button.citation-marker'));
    buttons.forEach(button => {
      const span = button.querySelector('span[aria-label]');
      if (!span) return;
      const label = span.getAttribute('aria-label') || '';
      const match = label.match(/^(\d+):\s*(.+)$/);
      if (!match) return;
      const citation = match[1];
      if (!map.has(citation)) {
        map.set(citation, button);
      }
    });
    return map;
  }

  function clickElement(element) {
    if (!element) return;
    element.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    element.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    element.click();
  }

  function isVisibleElement(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function extractSnippetFromText(rawText, filename) {
    if (!rawText) return '';
    const rawLines = String(rawText)
      .split('\n')
      .map(line => cleanSnippet(line))
      .filter(Boolean);

    const normalizedFilename = normalizeWhitespace(filename);
    const lowerFilename = normalizedFilename.toLowerCase();
    const contentLines = rawLines.filter(line => {
      const normalizedLine = normalizeWhitespace(line);
      const lowerLine = normalizedLine.toLowerCase();
      if (!normalizedLine) return false;
      if (lowerFilename && lowerLine === lowerFilename) return false;
      if (/\.pdf$/i.test(normalizedLine)) return false;
      return true;
    });

    const proseStartIndex = contentLines.findIndex(line => {
      if (line.length < 60) return false;
      if (!/[a-z]/.test(line)) return false;
      return /[.!?;:]|—/.test(line);
    });

    if (proseStartIndex >= 0) {
      const proseLines = contentLines.slice(proseStartIndex);
      const excerpt = normalizeSentenceSpacing(proseLines.join(' '));
      if (excerpt) return excerpt;
    }

    const normalizedText = normalizeWhitespace(rawText);
    if (!normalizedText) return '';

    const withoutFilename = normalizedFilename
      ? normalizedText.replaceAll(normalizedFilename, ' ')
      : normalizedText;

    const quoteMatch = withoutFilename.match(/[“"']([^"”']{20,})[”"']/);
    if (quoteMatch) {
      return cleanSnippet(quoteMatch[1]);
    }

    const chunks = withoutFilename
      .split(/\s{2,}|\n+/)
      .map(cleanSnippet)
      .filter(Boolean)
      .filter(chunk => chunk.length >= 25)
      .filter(chunk => !/\.pdf$/i.test(chunk))
      .filter(chunk => !/^details?\s+(zum\s+)?zitat$/i.test(chunk))
      .filter(chunk => !/^klicken.*öffnen$/i.test(chunk))
      .filter(chunk => !/^sources?$/i.test(chunk));

    return normalizeSentenceSpacing(chunks[0] || '');
  }

  function getTooltipCandidates() {
    const selectors = [
      '.citation-tooltip',
      'xap-dialog-layout.citation-tooltip',
      'xap-inline-dialog-container',
      '[role="tooltip"]',
      '[aria-live="polite"]',
      '[class*="tooltip"]',
      '[class*="popover"]',
      '[class*="overlay"]'
    ];
    const unique = new Set();
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => unique.add(el));
    });
    return Array.from(unique).filter(el => {
      if (!isVisibleElement(el)) return false;
      const text = normalizeWhitespace(el.innerText || el.textContent || '');
      if (text.length < 20 || text.length > 1500) return false;
      const className = (el.className || '').toString();
      if (className.includes('emoji-keyboard')) return false;
      return true;
    });
  }

  function getTooltipPayload(element) {
    if (!element) return null;
    const footer = element.querySelector('.citation-tooltip-footer');
    return {
      rawText: (element.innerText || element.textContent || '').trim(),
      footerText: footer ? normalizeWhitespace(footer.innerText || footer.textContent || '') : '',
    };
  }

  function findBestTooltipPayload(filename) {
    const normalizedFilename = normalizeWhitespace(filename).toLowerCase();
    const candidates = getTooltipCandidates()
      .map(el => getTooltipPayload(el))
      .filter(Boolean)
      .filter(payload => normalizeWhitespace(payload.rawText).length > 0);
    if (!candidates.length) return '';

    const scored = candidates.map(payload => {
      const normalizedText = normalizeWhitespace(payload.rawText);
      const lower = normalizedText.toLowerCase();
      let score = 0;
      if (normalizedFilename && lower.includes(normalizedFilename)) score += 12;
      if (normalizedFilename && payload.footerText.toLowerCase() === normalizedFilename) score += 8;
      if (lower.includes('zitat') || lower.includes('citation')) score += 2;
      if (lower.includes('seite') || lower.includes('page')) score += 2;
      score += Math.min(normalizedText.length / 160, 6);
      return { payload, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].payload;
  }

  async function collectTooltipTextForCitation(filename) {
    let bestPayload = null;
    let elapsed = 0;

    for (const waitMs of HOVER_WAIT_INTERVALS_MS) {
      const delay = Math.max(waitMs - elapsed, 0);
      if (delay > 0) {
        await sleep(delay);
        elapsed = waitMs;
      }

      const payload = findBestTooltipPayload(filename);
      if (!payload) continue;

      if (!bestPayload || payload.rawText.length > bestPayload.rawText.length) {
        bestPayload = payload;
      }
    }

    return bestPayload ? bestPayload.rawText : '';
  }

  function getNotebookTabByName(name) {
    return Array.from(document.querySelectorAll('[role="tab"]'))
      .find(tab => normalizeWhitespace(tab.textContent || '') === name);
  }

  function isNotebookTabSelected(name) {
    const tab = getNotebookTabByName(name);
    if (!tab) return false;
    return tab.getAttribute('aria-selected') === 'true' || tab.matches('[aria-selected="true"], .selected');
  }

  function getVisibleHighlightedTexts() {
    return Array.from(document.querySelectorAll('.highlighted'))
      .filter(isVisibleElement)
      .map(el => cleanSnippet(el.innerText || el.textContent || ''))
      .filter(Boolean)
      .filter(text => text.length >= 20);
  }

  async function collectSnippetFromClickFallback(button, filename) {
    const wasChatSelected = isNotebookTabSelected('Chat');
    let bestSnippet = '';
    let elapsed = 0;

    clickElement(button);

    for (const waitMs of CLICK_FALLBACK_WAIT_INTERVALS_MS) {
      const delay = Math.max(waitMs - elapsed, 0);
      if (delay > 0) {
        await sleep(delay);
        elapsed = waitMs;
      }

      const highlightedText = getVisibleHighlightedTexts().join('\n');
      const snippet = extractSnippetFromText(highlightedText, filename);
      if (snippet.length > bestSnippet.length) {
        bestSnippet = snippet;
      }
    }

    if (wasChatSelected) {
      const chatTab = getNotebookTabByName('Chat');
      if (chatTab) {
        clickElement(chatTab);
        await sleep(120);
      }
    }

    return bestSnippet;
  }

  function hoverCitationButton(button) {
    if (!button) return;
    button.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
    ['pointerenter', 'pointerover', 'mouseenter', 'mouseover', 'mousemove'].forEach(type => {
      button.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    });
    button.focus();
  }

  function unhoverCitationButton(button) {
    if (!button) return;
    ['mouseleave', 'mouseout'].forEach(type => {
      button.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    });
    button.blur();
  }

  async function enrichSnippetsFromCitationHover(mappingsByCitation) {
    const buttonsByCitation = getCitationButtonsByNumber();
    const citations = Object.keys(mappingsByCitation)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    for (const citation of citations) {
      const mapping = mappingsByCitation[citation];
      if (!mapping || mapping.snippet) continue;
      const button = buttonsByCitation.get(citation);
      if (!button) continue;

      hoverCitationButton(button);
      const tooltipText = await collectTooltipTextForCitation(mapping.filename);
      let snippet = extractSnippetFromText(tooltipText, mapping.filename);
      if (!snippet) {
        snippet = await collectSnippetFromClickFallback(button, mapping.filename);
      }
      if (snippet) {
        mappingsByCitation[citation] = {
          ...mapping,
          snippet,
        };
      }

      unhoverCitationButton(button);
      await sleep(90);
    }
  }


  async function expandAllCitationEllipses() {
    const ellipses = Array.from(document.querySelectorAll('span[aria-label]')).filter(
      span => span.textContent.trim() === '...'
    );
    ellipses.forEach(span => span.click());
    if (ellipses.length) {
      await new Promise(res => setTimeout(res, 200));
    }
  }

  async function mapCitations(options = {}) {
    const { extractSnippets = false } = options;
    if (isMapping) return;
    isMapping = true;
    try {
      await expandAllCitationEllipses();
      const spans = Array.from(document.querySelectorAll('span[aria-label]'));
      const uniqueCitations = {};
      const previousMappings = new Map(currentMappings.map(mapping => [mapping.citation, mapping]));
      spans.forEach(span => {
        const label = span.getAttribute('aria-label');
        const match = label && label.match(/^(\d+):\s*(.+)$/);
        if (match) {
          const citation = match[1];
          const parsed = parseCitationPayload(match[2]);
          uniqueCitations[citation] = mergeCitationData(uniqueCitations[citation], {
            citation,
            filename: parsed.filename,
            snippet: parsed.snippet,
          });
        }
      });

      if (extractSnippets) {
        await enrichSnippetsFromCitationHover(uniqueCitations);
      }

      const sortedCitationNumbers = Object.keys(uniqueCitations)
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      currentMappings = sortedCitationNumbers.map(n => {
        const current = uniqueCitations[n];
        const previous = previousMappings.get(n);
        return mergeCitationData(previous, current);
      });
    } finally {
      isMapping = false;
    }
  }

  function observeCitations() {
    const observer = new MutationObserver((mutations) => {
      const shouldRun = mutations.some(m => {
        return Array.from(m.addedNodes).some(n => n.nodeType === 1);
      });
      if (!shouldRun) return;
      if (window.__notebooklmCitationMapTimeout) {
        clearTimeout(window.__notebooklmCitationMapTimeout);
      }
      window.__notebooklmCitationMapTimeout = setTimeout(() => {
        if (!isMapping) {
          mapCitations();
        }
      }, 500);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function scoreAnswerContainer(container) {
    if (!container) return -Infinity;

    const classText = normalizeWhitespace(container.className || '').toLowerCase();
    const text = normalizeWhitespace(container.textContent || '');
    if (!text) return -Infinity;

    let score = text.length;
    const citationCount = container.querySelectorAll('button.citation-marker, .citation-marker').length;
    score += citationCount * 250;

    const assistantControls = container.querySelectorAll(
      'button[aria-label*="Zwischenablage kopieren"], button[aria-label*="Notiz speichern"], button[aria-label*="Antwort als gut"], button[aria-label*="Antwort als schlecht"], button[aria-label*="copy"], button[aria-label*="save"]'
    ).length;
    score += assistantControls * 400;

    if (classText.includes('to-user-message-inner-content')) score += 8000;
    if (classText.includes('to-user-message-card-content')) score += 7000;
    if (classText.includes('message-text-content')) score += 6000;
    if (classText.includes('individual-message')) score += 2500;

    if (classText.includes('from-user')) score -= 5000;
    if (classText.includes('user-message')) score -= 5000;
    if (classText.includes('prompt')) score -= 2000;
    if (classText.includes('summary-content')) score -= 8000;
    if (classText.includes('chat-panel')) score -= 6000;
    if (classText.includes('chat-message-pair')) score -= 3500;
    if (classText.includes('empty-state')) score -= 6000;
    if (classText.includes('response')) score += 600;
    if (classText.includes('model')) score += 600;
    if (classText.includes('assistant')) score += 600;

    return score;
  }

  function findBestAnswerContainer() {
    const prioritySelectors = [
      '[class*="to-user-message-inner-content"]',
      '[class*="to-user-message-card-content"]',
      '.message-text-content',
      '.individual-message',
      '[class*="response"]',
      '[class*="message"]',
      '[class*="chat"]',
      'mat-card',
      '[class*="card"]'
    ];
    const unique = new Set();
    prioritySelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => unique.add(el));
    });

    const preferredCandidates = Array.from(unique)
      .filter(el => {
        const classText = normalizeWhitespace(el.className || '').toLowerCase();
        return (
          classText.includes('to-user-message-inner-content') ||
          classText.includes('to-user-message-card-content') ||
          classText.includes('message-text-content')
        );
      })
      .filter(el => normalizeWhitespace(el.textContent || '').length > 0)
      .sort((a, b) => scoreAnswerContainer(b) - scoreAnswerContainer(a));

    if (preferredCandidates.length > 0) {
      return preferredCandidates[0];
    }

    const candidates = Array.from(unique)
      .filter(el => normalizeWhitespace(el.textContent || '').length > 0)
      .sort((a, b) => scoreAnswerContainer(b) - scoreAnswerContainer(a));

    return candidates[0] || null;
  }

  function extractChatText() {
    const mainContainer = findBestAnswerContainer();

    if (!mainContainer) {
      console.error('No answer container found');
      return null;
    }

    // Clone to avoid modifying the actual DOM
    const clone = mainContainer.cloneNode(true);

    // Remove unwanted elements
    clone.querySelectorAll(
      'script, style, button:not(.citation-marker), [class*="input"], [class*="footer"], [class*="toolbar"], [class*="from-user"], [class*="user-message"], [class*="prompt"]'
    ).forEach(el => el.remove());

    // Replace citation buttons with [N] format
    // Based on debug: <button class="xap-inline-dialog citation-marker"><span>1</span></button>
    const citationButtons = clone.querySelectorAll('button.citation-marker, .citation-marker');
    citationButtons.forEach(button => {
      const span = button.querySelector('span');
      if (span) {
        const citationNum = span.textContent.trim();
        if (/^\d+$/.test(citationNum)) {
          // Replace the button with [N] text
          const textNode = document.createTextNode(`[${citationNum}]`);
          button.replaceWith(textNode);
        }
      }
    });

    // Extract text from paragraphs
    // Based on debug: <div class="paragraph normal ng-star-inserted">
    const paragraphs = clone.querySelectorAll('.paragraph.normal, .paragraph, div[class*="text"], p');

    let text = '';

    if (paragraphs.length > 0) {
      // Extract text from each paragraph
      paragraphs.forEach(para => {
        const paraText = para.textContent.trim();
        if (paraText && paraText.length > 0) {
          text += paraText + '\n\n';
        }
      });
    } else {
      // Fallback: get all text content
      text = clone.textContent;
    }

    // Clean up the text
    text = text
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
      .replace(/\s+\[/g, ' [') // Clean space before citations
      .replace(/\]\s+/g, '] ') // Clean space after citations
      .trim();

    return text.length > 0 ? text : null;
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'getMappings') {
      if (request.includeSnippets) {
        mapCitations({ extractSnippets: true }).then(() => {
          sendResponse({ mappings: currentMappings });
        });
        return true;
      }
      sendResponse({ mappings: currentMappings });
    } else if (request.action === 'rescan') {
      mapCitations({ extractSnippets: true }).then(() => {
        sendResponse({ mappings: currentMappings });
      });
      return true;
    } else if (request.action === 'getChatText') {
      const chatText = extractChatText();
      sendResponse({ chatText: chatText });
      return true;
    }
  });

  setTimeout(() => {
    mapCitations();
  }, 2000);
  observeCitations();
})();
