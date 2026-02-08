# Notion Equation Converter

A tool to convert LaTeX-style equations (`$...$` and `$$...$$`) into native Notion equation blocks using the Notion API.

## Overview

This repository provides multiple ways to convert LaTeX equations in Notion:
- **Python Script** (`Main.py`) - Command-line batch conversion
- **Chrome Extension** (`chrome-extension/`) - Browser-based one-click conversion

## Features

- Convert **inline equations** (`$...$`) to Notion inline equation blocks
- Convert **block equations** (`$$...$$`) to Notion block equation blocks  
- **Batch processing** - converts all equations at once
- **Replaces source** - deletes old LaTeX text, adds new equation blocks (clean output)
- **Preservation** - maintains headings, lists, quotes, code blocks, and other content

## Installation

### Python Script

1. Install dependencies:
```bash
pip install requests pandas python-dotenv
```

2. Create `.env` file:
```
NOTION_API_KEY="ntn_your_api_key_here"
PAGE_ID="your_page_id_here"
```

### Chrome Extension

#### Option A: Using the Pre-built ZIP (Easiest)

1. Download `notion-equation-converter.zip`
2. Extract the ZIP file to a folder
3. Open Chrome and go to `chrome://extensions/`
4. Enable **Developer mode** (toggle in top right)
5. Click **Load unpacked**
6. Select the extracted folder
7. Click the extension icon → enter your Notion API key

#### Option B: Use the Source Files

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder
5. Click the extension icon → enter your Notion API key

## Usage

### Python Script

```bash
python Main.py
```

### Chrome Extension

1. Navigate to any Notion page with LaTeX equations
2. Press **Alt+Shift+E** (or click extension icon)
3. Equations are automatically converted and page refreshes

## Getting Notion API Key

1. Go to https://www.notion.so/my-integrations
2. Click **New integration**
3. Name it and select workspace
4. Copy the **Internal Integration Token**
5. Share your Notion page with the integration

## Credits

- **Idea & inspiration**: [notion-inline-equation](https://github.com) - A Chrome extension that uses keystroke simulation for equation conversion

## License

GNU General Public License v3.0

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

## Contributing

Feel free to open issues or submit pull requests!
