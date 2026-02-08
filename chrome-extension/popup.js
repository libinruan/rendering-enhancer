// Save and load API key from Chrome storage
document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const convertBtn = document.getElementById('convertBtn');
  const status = document.getElementById('status');

  // Load existing API key
  const data = await chrome.storage.local.get('notionApiKey');
  const hasApiKey = data.notionApiKey && data.notionApiKey.startsWith('ntn_');

  if (hasApiKey) {
    // Show convert mode
    apiKeyInput.style.display = 'none';
    document.querySelector('label[for="apiKey"]').style.display = 'none';
    saveBtn.style.display = 'none';
    convertBtn.style.display = 'block';
    showStatus('API key is set! Click Convert to run.', 'success');
  } else {
    // Show setup mode
    apiKeyInput.style.display = 'block';
    document.querySelector('label[for="apiKey"]').style.display = 'block';
    saveBtn.style.display = 'block';
    convertBtn.style.display = 'none';
  }

  // Save API key
  saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus('Please enter your Notion API key', 'error');
      return;
    }

    if (!apiKey.startsWith('ntn_')) {
      showStatus('Invalid API key. Should start with "ntn_"', 'error');
      return;
    }

    await chrome.storage.local.set({ notionApiKey: apiKey });
    showStatus('API key saved! Click Convert to run.', 'success');

    // Switch to convert mode
    setTimeout(() => {
      apiKeyInput.style.display = 'none';
      document.querySelector('label[for="apiKey"]').style.display = 'none';
      saveBtn.style.display = 'none';
      convertBtn.style.display = 'block';
    }, 1500);
  });

  // Convert button - trigger conversion via background script
  convertBtn.addEventListener('click', async () => {
    const keyData = await chrome.storage.local.get('notionApiKey');

    if (!keyData.notionApiKey) {
      showStatus('API key not found', 'error');
      return;
    }

    // Send message to background script to handle conversion
    // Background script has CORS permissions
    chrome.runtime.sendMessage({
      action: 'convertPage',
      apiKey: keyData.notionApiKey
    }, (response) => {
      if (response && response.success) {
        showStatus('Conversion started! Check the page.', 'success');
        setTimeout(() => window.close(), 1500);
      } else {
        showStatus('Error: ' + (response?.error || 'Unknown error'), 'error');
      }
    });
  });

  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
  }
});
