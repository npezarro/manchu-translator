(function () {
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  const loading = document.getElementById('loading');
  const loadingStep = document.getElementById('loading-step');
  const loadingImage = document.getElementById('loading-image');
  const results = document.getElementById('results');
  const resultImg = document.getElementById('result-img');
  const resultMeta = document.getElementById('result-meta');
  const error = document.getElementById('error');
  const errorMsg = document.getElementById('error-msg');
  const examples = document.querySelectorAll('.example-btn');

  // Drag and drop
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) submitImage(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) submitImage(fileInput.files[0]);
  });

  // Example buttons
  examples.forEach(btn => {
    btn.addEventListener('click', async () => {
      const src = btn.dataset.src;
      try {
        const resp = await fetch(src);
        const blob = await resp.blob();
        const file = new File([blob], src.split('/').pop(), { type: blob.type });
        submitImage(file);
      } catch {
        showError('Failed to load example image.');
      }
    });
  });

  // Reset
  document.getElementById('reset-btn').addEventListener('click', resetUI);
  document.getElementById('retry-btn').addEventListener('click', resetUI);

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  function resetUI() {
    uploadZone.classList.remove('hidden');
    uploadZone.closest('main').querySelector('.examples').classList.remove('hidden');
    loading.classList.add('hidden');
    results.classList.add('hidden');
    error.classList.add('hidden');
    fileInput.value = '';
  }

  function showError(msg) {
    loading.classList.add('hidden');
    error.classList.remove('hidden');
    errorMsg.textContent = msg;
  }

  async function submitImage(file) {
    // Validate
    if (file.size > 10 * 1024 * 1024) return showError('File too large. Maximum size is 10MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return showError('Only JPEG, PNG, and WebP images are accepted.');

    // Show loading
    uploadZone.classList.add('hidden');
    uploadZone.closest('main').querySelector('.examples').classList.add('hidden');
    results.classList.add('hidden');
    error.classList.add('hidden');
    loading.classList.remove('hidden');
    loadingStep.textContent = 'Step 1: Reading Manchu text (OCR)...';

    // Preview image
    const previewUrl = URL.createObjectURL(file);
    loadingImage.src = previewUrl;

    // Upload
    const formData = new FormData();
    formData.append('image', file);

    // Simulate step update
    const stepTimer = setTimeout(() => {
      loadingStep.textContent = 'Step 2: Translating with dictionary context...';
    }, 15000);

    try {
      const resp = await fetch('api/translate', { method: 'POST', body: formData });
      clearTimeout(stepTimer);

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${resp.status})`);
      }

      const data = await resp.json();
      showResults(data, previewUrl);
    } catch (err) {
      clearTimeout(stepTimer);
      showError(err.message || 'Translation failed. Please try again.');
    }
  }

  function showResults(data, imageUrl) {
    loading.classList.add('hidden');
    results.classList.remove('hidden');
    resultImg.src = imageUrl;

    // Populate panels
    document.getElementById('panel-translation').innerHTML = formatSection(data.translation) || 'No translation available.';
    document.getElementById('panel-charmap').innerHTML = formatCharMap(data.charactermap) || 'No character map available.';
    document.getElementById('panel-romanization').textContent = data.romanization || 'No romanization available.';
    document.getElementById('panel-wordbyword').textContent = data.wordbyword || 'No word-by-word analysis available.';
    document.getElementById('panel-ocr').innerHTML = data.ocr
      ? '<span class="manchu-text">' + escapeHtml(data.ocr) + '</span>'
      : 'No OCR text extracted.';
    document.getElementById('panel-chinese').innerHTML = formatSection(data.chinesetext) || 'No Chinese text detected.';
    document.getElementById('panel-notes').textContent = data.notes || 'No notes.';

    // Meta
    const parts = [];
    if (data.wordsFound) parts.push(`${data.wordsFound} words extracted`);
    if (data.dictionaryMatches) parts.push(`${data.dictionaryMatches} dictionary matches`);
    resultMeta.textContent = parts.length ? parts.join(' · ') : '';

    // Reset to translation tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.tab[data-tab="translation"]').classList.add('active');
    document.getElementById('panel-translation').classList.add('active');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSection(text) {
    if (!text) return '';
    // Convert **bold** to <strong>, preserve newlines
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function formatCharMap(text) {
    if (!text) return '';
    // Parse character map lines into a table
    const lines = text.trim().split('\n').filter(l => l.trim());
    const arrowLines = lines.filter(l => l.includes('→'));

    if (arrowLines.length === 0) return '<pre>' + escapeHtml(text) + '</pre>';

    let html = '<table class="charmap-table"><thead><tr><th>Manchu</th><th>Romanization</th><th>Chinese</th><th>English</th></tr></thead><tbody>';
    for (const line of lines) {
      const parts = line.split('→').map(s => s.trim());
      if (parts.length >= 2) {
        const manchu = parts[0] || '';
        const roman = parts[1] || '';
        const chinese = parts[2] || '';
        const english = parts.slice(3).join(' → ') || '';
        html += '<tr>'
          + '<td class="manchu-text">' + escapeHtml(manchu) + '</td>'
          + '<td>' + escapeHtml(roman) + '</td>'
          + '<td>' + escapeHtml(chinese) + '</td>'
          + '<td>' + escapeHtml(english) + '</td>'
          + '</tr>';
      } else {
        // Non-arrow line (header, separator, etc.)
        html += '<tr><td colspan="4" class="charmap-header">' + escapeHtml(line) + '</td></tr>';
      }
    }
    html += '</tbody></table>';
    return html;
  }
})();
