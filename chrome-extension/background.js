// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'convert-equations') {
    await triggerConversion();
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'convertPage') {
    triggerConversion(message.apiKey)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('Conversion error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async
  }
});

// Also handle toolbar button click
chrome.action.onClicked.addListener(async (tab) => {
  const data = await chrome.storage.local.get('notionApiKey');
  if (!data.notionApiKey) {
    // Open popup if no API key set
    chrome.action.openPopup();
  }
  // Otherwise do nothing on toolbar click - popup will show instead
});

async function triggerConversion(apiKey) {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    throw new Error('No active tab found');
  }

  // Check if we're on a Notion page
  if (!tab.url.includes('notion.so')) {
    throw new Error('Not a Notion page');
  }

  // Get API key from parameter or storage
  if (!apiKey) {
    const data = await chrome.storage.local.get('notionApiKey');
    if (!data.notionApiKey) {
      throw new Error('API Key required');
    }
    apiKey = data.notionApiKey;
  }

  // Show loading indicator in the page
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: () => {
      if (document.getElementById('notion-converter-loading')) return;
      const loading = document.createElement('div');
      loading.id = 'notion-converter-loading';
      loading.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #000;
        color: #fff;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        font-family: -apple-system, sans-serif;
        font-size: 14px;
      `;
      loading.textContent = 'Converting equations...';
      document.body.appendChild(loading);
    }
  });

  try {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    };

    // Extract page ID from URL
    const pageIdMatch = tab.url.match(/notion\.so\/(?:[^-]+-)?([a-f0-9]{32})/);
    const pageId = pageIdMatch ? pageIdMatch[1].replace(/-/g, '') : null;

    if (!pageId) {
      throw new Error('Could not extract page ID from URL');
    }

    // Step 1: Get all blocks from the page
    const pageBlocks = await fetchAllBlocks(pageId, headers);
    await updateLoading(tab.id, `Found ${pageBlocks.length} blocks. Converting...`);

    // Step 2: Process blocks to find equations
    const convertedData = processBlocks(pageBlocks);

    if (convertedData.length === 0) {
      await updateLoading(tab.id, 'No equations found!', '#f59e0b');
      setTimeout(() => hideLoading(tab.id), 2000);
      return { message: 'No equations found' };
    }

    // Step 3: Delete old blocks
    await updateLoading(tab.id, `Deleting ${pageBlocks.length} old blocks...`);
    await deleteBlocks(pageBlocks.map(b => b.id), headers);

    // Step 4: Upload new blocks
    await updateLoading(tab.id, `Uploading ${convertedData.length} new blocks...`);
    await uploadBlocks(pageId, convertedData, headers);

    // Success - refresh the page
    await updateLoading(tab.id, 'Done! Refreshing...', '#10b981');
    setTimeout(() => {
      chrome.tabs.reload(tab.id);
    }, 1500);

    return { message: 'Conversion successful', blocksConverted: convertedData.length };

  } catch (err) {
    await updateLoading(tab.id, `Error: ${err.message}`, '#ef4444');
    setTimeout(() => hideLoading(tab.id), 5000);
    throw err;
  }
}

// Update loading text in page
async function updateLoading(tabId, text, bgColor) {
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: (params) => {
      const loading = document.getElementById('notion-converter-loading');
      if (loading) {
        loading.textContent = params.text;
        if (params.bgColor) loading.style.background = params.bgColor;
      }
    },
    args: [{ text, bgColor }]
  });
}

// Hide loading in page
async function hideLoading(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: () => {
      const loading = document.getElementById('notion-converter-loading');
      if (loading) loading.remove();
    }
  });
}

async function fetchAllBlocks(blockId, headers, blocks = [], startCursor = null) {
  let url = `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`;

  if (startCursor) {
    url += `&start_cursor=${startCursor}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch blocks: ${response.status}`);
  }

  const data = await response.json();

  for (const block of data.results) {
    blocks.push(block);

    // Recursively fetch children if present
    if (block.has_children) {
      await fetchAllBlocks(block.id, headers, blocks);
    }
  }

  if (data.has_more) {
    await fetchAllBlocks(blockId, headers, blocks, data.next_cursor);
  }

  return blocks;
}

function processBlocks(blocks) {
  const combinedBlocks = [];

  for (const block of blocks) {
    const blockType = block.type;
    let content = '';

    // Extract content from rich_text
    if (block[blockType]?.rich_text) {
      for (const item of block[blockType].rich_text) {
        if (item.type === 'text') {
          content += item.text.content;
        } else if (item.type === 'equation') {
          content += `$$ ${item.equation.expression} $$`;
        }
      }
    }

    // Skip if no content
    if (!content) continue;

    // Process content to find equations
    const notionContent = formatContentForNotion(content);

    if (notionContent.length === 0) continue;

    // Check if we found any equations
    const hasEquations = notionContent.some(p => p.type === 'equation');
    if (!hasEquations) {
      // Keep original block without equations
      if (blockType === 'paragraph') {
        combinedBlocks.push({
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content } }] }
        });
      } else if (blockType.startsWith('heading')) {
        combinedBlocks.push({
          type: blockType,
          [blockType]: { rich_text: [{ type: 'text', text: { content } }] }
        });
      } else if (blockType === 'quote') {
        combinedBlocks.push({
          type: 'quote',
          quote: { rich_text: [{ type: 'text', text: { content } }] }
        });
      } else if (blockType === 'bulleted_list_item') {
        combinedBlocks.push({
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ type: 'text', text: { content } }] }
        });
      } else if (blockType === 'divider') {
        combinedBlocks.push({ type: 'divider', divider: {} });
      } else if (blockType === 'code') {
        combinedBlocks.push({
          type: 'code',
          code: {
            text: [{ type: 'text', text: { content } }],
            language: block.code?.language || 'python'
          }
        });
      }
      continue;
    }

    // Handle different block types with equations
    if (blockType === 'divider') {
      combinedBlocks.push({ type: 'divider', divider: {} });
    } else if (['heading_1', 'heading_2', 'heading_3'].includes(blockType)) {
      combinedBlocks.push({
        type: blockType,
        [blockType]: { rich_text: notionContent }
      });
    } else if (blockType === 'quote') {
      combinedBlocks.push({
        type: 'quote',
        quote: { rich_text: notionContent }
      });
    } else if (blockType === 'paragraph') {
      combinedBlocks.push({
        type: 'paragraph',
        paragraph: { rich_text: notionContent }
      });
    } else if (blockType === 'bulleted_list_item') {
      combinedBlocks.push({
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: notionContent }
      });
    } else if (blockType === 'code') {
      combinedBlocks.push({
        type: 'code',
        code: {
          text: [{ type: 'text', text: { content } }],
          language: block.code?.language || 'python'
        }
      });
    }
  }

  return combinedBlocks;
}

function formatContentForNotion(blockContent) {
  if (typeof blockContent !== 'string') return blockContent;

  // Pattern for $$...$$ (block) and $...$ (inline)
  const pattern = /(\$\$)(.+?)(\$\$)|(\$)([^$].*?[^$])(\$)/g;
  const formattedParts = [];
  let lastEnd = 0;
  let match;

  while ((match = pattern.exec(blockContent)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;

    // Add text before equation
    if (start > lastEnd) {
      const textContent = blockContent.substring(lastEnd, start);
      if (textContent) {
        formattedParts.push({
          type: 'text',
          text: { content: textContent }
        });
      }
    }

    // Add equation
    if (match[1]) {
      // Block equation $$...$$
      const expression = match[2].trim();
      formattedParts.push({
        type: 'equation',
        equation: { expression: expression }
      });
    } else {
      // Inline equation $...$
      const expression = match[5].trim();
      formattedParts.push({
        type: 'equation',
        equation: { expression: expression }
      });
    }

    lastEnd = end;
  }

  // Add remaining text
  if (lastEnd < blockContent.length) {
    const remaining = blockContent.substring(lastEnd);
    if (remaining) {
      formattedParts.push({
        type: 'text',
        text: { content: remaining }
      });
    }
  }

  return formattedParts;
}

async function deleteBlocks(blockIds, headers) {
  for (const blockId of blockIds) {
    // Remove dashes from block ID for API call
    const cleanId = blockId.replace(/-/g, '');
    const url = `https://api.notion.com/v1/blocks/${cleanId}`;

    try {
      await fetch(url, {
        method: 'DELETE',
        headers: headers
      });
    } catch (err) {
      console.warn(`Failed to delete block ${blockId}:`, err);
    }
  }
}

async function uploadBlocks(pageId, blocks, headers) {
  const url = `https://api.notion.com/v1/blocks/${pageId}/children`;

  // Prepare blocks as proper JSON
  const payload = { children: blocks };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Upload failed: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return await response.json();
}
