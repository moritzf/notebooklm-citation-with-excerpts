# NotebookLM Citation Mapper (Fork)

A Chrome extension for Google NotebookLM that maps citation numbers to source files, extracts answer text with inline citations, captures citation snippets, and exports the result in multiple formats.

## Features

- **Automatic Citation Mapping**: Detects NotebookLM citation markers and maps them to source filenames
- **Snippet Extraction**: Captures citation snippets from the NotebookLM citation hover cards when available
- **Copy Text with Sources**: Copies the extracted NotebookLM answer text with inline `[1]`, `[2]` style citations plus a source legend
- **Copy Text for Word**: Replaces numeric citations with inline source labels like `{SourceName.pdf}` for easier Word workflows
- **Copy Rich Text**: Copies both HTML and plain text so formatted output pastes cleanly into rich editors
- **PDF Export**: Generates a downloadable PDF containing the extracted answer text and source list
- **Citation Mapping Export**: Copies only the citation legend to the clipboard
- **History and Statistics**: Stores recent exports locally and tracks aggregate usage statistics
- **Customizable Formatting**: Includes a settings page for theme, citation formatting, separator text, and source header preferences
- **Smart Page Scanning**: Watches dynamic NotebookLM updates and supports manual rescans

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/moritzf/notebooklm-citation-with-excerpts.git
   cd notebooklm-citation-with-excerpts
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top right corner)

4. Click "Load unpacked" and select the `extension` folder from this repository

## Usage

1. Navigate to [notebooklm.google.com](https://notebooklm.google.com)

2. The extension will automatically:
   - Scan the current NotebookLM page for citations
   - Resolve citation numbers to source names
   - Enrich mappings with source snippets when NotebookLM exposes them
   - Update mappings as the page changes

3. Click the extension icon in Chrome to see:
   - **Citation Mappings**: List of all detected citations
   - **📄 Copy Text with Sources**: Copies the extracted answer text with inline citations and appended sources
   - **📋 Copy Text for Word**: Converts `[1]` style citations into `{Filename}` references for Word-based editing
   - **📝 Copy Rich Text**: Copies formatted HTML plus plain text fallback
   - **📑 Export PDF**: Downloads a PDF export of the answer and source list
   - **📋 Copy Citation Mappings**: Copies just the citation legend
   - **🔄 Rescan Page**: Manually refresh the citation mappings
   - **Settings**: Opens a full settings page with format, theme, history, import/export, and statistics tabs

### Copy Format

When you click "Copy Text with Sources", the extension copies:

```
[Your chat text with citations preserved as [1], [2], etc.]

---
Sources:
[1] → Document1.pdf
[1] → "Relevant excerpt from the source"
[2] → Research_Paper.docx
[3] → Notes.txt
...
```

When you click "Copy Text for Word", the extension converts inline citations into source-tag style references:

```text
The report identifies three major findings {Research_Paper.docx} and a follow-up recommendation {Notes.txt}.
```

## How It Works

The extension uses three main components:

- **content.js**: Scans the page for citation markers (using `aria-label` attributes) and extracts chat text
- **popup.js**: Provides the popup interface when clicking the extension icon
- **background.js**: Handles context menu integration and background tasks

### Technical Details

- Built for **Manifest V3**
- Uses **MutationObserver** to detect dynamic NotebookLM content changes
- Extracts response text directly from NotebookLM answer containers
- Replaces live citation buttons with stable inline citation markers during export
- Attempts to harvest source snippets from NotebookLM citation tooltips
- Uses **jsPDF** for PDF generation inside the extension popup
- Stores settings in `chrome.storage.sync` and export history/statistics in `chrome.storage.local`

## Known Limitations

- The citation mapping relies on NotebookLM's DOM structure, labels, and tooltip behavior
- Snippet extraction depends on NotebookLM rendering citation hover cards in a detectable way
- PDF export uses plain text layout rather than a pixel-perfect NotebookLM rendering
- Chat extraction still uses heuristics and may occasionally miss or reorder some content
- The extension may break if Google substantially changes the NotebookLM UI

## Contributing

Contributions are welcome! If you encounter issues or have ideas for improvements:

1. Open an issue describing the problem or feature request
2. Submit a pull request with your changes

## Credits

- Original concept and implementation: [@nicremo](https://github.com/nicremo)
- Major refactoring and improvements: [@DerSchiman](https://github.com/DerSchiman) (Ron Schimanski) - Huge thanks for making this project possible by completely rewriting the citation extraction logic and making it actually work!

## License

This project is open source and available for anyone to use and modify.
