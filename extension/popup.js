'use strict';
const DEFAULT_SERVER = 'http://localhost:3000';

async function getStoredServer() {
  return new Promise(resolve => {
    chrome.storage.local.get(['pagepulse_server'], r => {
      resolve(r.pagepulse_server || DEFAULT_SERVER);
    });
  });
}

async function init() {
  // Load stored server URL
  const server = await getStoredServer();
  const serverInput = document.getElementById('server-url');
  serverInput.value = server;
  document.getElementById('open-dashboard').href = server;

  // Get current tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  const urlEl = document.getElementById('current-url');
  urlEl.textContent = url || 'No URL available';

  // Pre-fill name from page title
  const nameInput = document.getElementById('monitor-name');
  if (tab?.title && !nameInput.value) {
    nameInput.value = tab.title.slice(0, 100);
  }

  // Save server button
  document.getElementById('save-server').addEventListener('click', () => {
    const val = serverInput.value.trim().replace(/\/$/, '');
    if (!val) return;
    chrome.storage.local.set({ pagepulse_server: val });
    document.getElementById('open-dashboard').href = val;
    showStatus('Server URL saved.', 'ok');
  });

  // Add monitor button
  document.getElementById('add-btn').addEventListener('click', async () => {
    const btn = document.getElementById('add-btn');
    btn.disabled = true;
    btn.textContent = 'Adding…';

    const currentServer = serverInput.value.trim().replace(/\/$/, '') || DEFAULT_SERVER;
    const name = nameInput.value.trim() || tab?.title?.slice(0, 100) || 'New monitor';
    const interval_min = +document.getElementById('monitor-interval').value;

    try {
      const resp = await fetch(`${currentServer}/api/watches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          url,
          interval_min,
          sensitivity: 'balanced',
          watch_selectors: [],
          ignore_selectors: [],
          noise: true,
          channels: [],
          keywords: '',
          digest: false,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to create monitor.');
      showStatus(`Monitor created! Check the dashboard to see it.`, 'ok');
      document.getElementById('open-dashboard').href = `${currentServer}/?watch=${data.id}`;
    } catch (e) {
      showStatus(e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14 M5 12h14"/></svg> Add to PagePulse`;
    }
  });
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
}

init().catch(e => {
  document.getElementById('current-url').textContent = 'Extension error: ' + e.message;
});
