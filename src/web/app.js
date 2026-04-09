/**
 * Password Auto-Change Agent — Frontend Application
 */

// ===== State =====
const state = {
  entries: [],
  currentStep: 1,
  filter: 'all',
};

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const dom = {
  uploadZone: $('#upload-zone'),
  csvInput: $('#csv-input'),
  btnSelectFile: $('#btn-select-file'),
  btnExport: $('#btn-export'),
  btnCheckBreaches: $('#btn-check-breaches'),
  btnGeneratePasswords: $('#btn-generate-passwords'),
  btnExecuteChanges: $('#btn-execute-changes'),
  stats: $('#stats'),
  actionBar: $('#action-bar'),
  tableContainer: $('#table-container'),
  workflowNotice: $('#workflow-notice'),
  workflowNoticeEyebrow: $('#workflow-notice-eyebrow'),
  workflowNoticeTitle: $('#workflow-notice-title'),
  workflowNoticeText: $('#workflow-notice-text'),
  workflowNoticeList: $('#workflow-notice-list'),
  entriesTbody: $('#entries-tbody'),
  filterStatus: $('#filter-status'),
  checkAll: $('#check-all'),
  panelUpload: $('#panel-upload'),
  // Stats
  statTotal: $('#stat-total-value'),
  statCompromised: $('#stat-compromised-value'),
  statSafe: $('#stat-safe-value'),
  statChanged: $('#stat-changed-value'),
  // Modal
  modalProgress: $('#modal-progress'),
  modalTitle: $('#modal-title'),
  progressFill: $('#progress-fill'),
  progressText: $('#progress-text'),
  progressLog: $('#progress-log'),
  // Toast
  toastContainer: $('#toast-container'),
};

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
});

function setupEventListeners() {
  // File upload
  dom.btnSelectFile.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.csvInput.click();
  });

  dom.uploadZone.addEventListener('click', () => {
    dom.csvInput.click();
  });

  dom.csvInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFileUpload(e.target.files[0]);
  });

  // Drag & Drop
  dom.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.uploadZone.classList.add('dragging');
  });

  dom.uploadZone.addEventListener('dragleave', () => {
    dom.uploadZone.classList.remove('dragging');
  });

  dom.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.uploadZone.classList.remove('dragging');
    if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
  });

  // Actions
  dom.btnCheckBreaches.addEventListener('click', handleCheckBreaches);
  dom.btnGeneratePasswords.addEventListener('click', handleGeneratePasswords);
  dom.btnExecuteChanges.addEventListener('click', handleExecuteChanges);
  dom.btnExport.addEventListener('click', handleExport);

  // Filter
  dom.filterStatus.addEventListener('change', () => {
    state.filter = dom.filterStatus.value;
    renderTable();
  });

  // Check all
  dom.checkAll.addEventListener('change', (e) => {
    $$('#entries-tbody input[type="checkbox"]').forEach((cb) => {
      cb.checked = e.target.checked;
    });
  });
}

// ===== File Upload =====
async function handleFileUpload(file) {
  if (!file.name.endsWith('.csv')) {
    showToast('CSVファイルを選択してください', 'error');
    return;
  }

  showModal('CSV読み込み中...', '解析しています...');

  const formData = new FormData();
  formData.append('csvFile', file);

  try {
    const res = await fetch('/api/upload-csv', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.entries = data.entries;
    hideModal();

    // UI更新
    dom.panelUpload.hidden = true;
    dom.stats.hidden = false;
    dom.actionBar.hidden = false;
    dom.tableContainer.hidden = false;
    dom.btnCheckBreaches.disabled = false;
    dom.btnExport.disabled = false;

    updateStats();
    renderTable();
    renderWorkflowNotice();
    setStep(2);

    showToast(`${data.count}件のアカウントを読み込みました`, 'success');
  } catch (err) {
    hideModal();
    showToast(`CSVの読み込みに失敗: ${err.message}`, 'error');
  }
}

// ===== Breach Check =====
async function handleCheckBreaches() {
  dom.btnCheckBreaches.disabled = true;
  showModal('漏洩チェック中...', 'Have I Been Pwned API に問い合わせています...');

  try {
    const res = await fetch('/api/check-breaches', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.entries = data.entries;
    hideModal();

    updateStats();
    renderTable();
    renderWorkflowNotice();
    setStep(2, true);

    dom.btnGeneratePasswords.disabled = false;

    if (data.compromised > 0) {
      showToast(`⚠️ ${data.compromised}件の漏洩が検出されました`, 'error');
    } else {
      showToast('✅ 漏洩は検出されませんでした', 'success');
    }
  } catch (err) {
    hideModal();
    dom.btnCheckBreaches.disabled = false;
    showToast(`漏洩チェックエラー: ${err.message}`, 'error');
  }
}

// ===== Generate Passwords =====
async function handleGeneratePasswords() {
  dom.btnGeneratePasswords.disabled = true;

  try {
    const res = await fetch('/api/generate-passwords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: 'compromised', options: { length: 24 } }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.entries = data.entries;
    updateStats();
    renderTable();
    renderWorkflowNotice();
    setStep(3, true);

    dom.btnExecuteChanges.disabled = false;

    const generated = data.entries.filter((e) => e.hasNewPassword).length;
    showToast(`🎲 ${generated}件の新しいパスワードを生成しました`, 'success');
  } catch (err) {
    dom.btnGeneratePasswords.disabled = false;
    showToast(`パスワード生成エラー: ${err.message}`, 'error');
  }
}

// ===== Execute Changes =====
async function handleExecuteChanges() {
  const checked = $$('#entries-tbody input[type="checkbox"]:checked')
    .map((cb) => cb.dataset.id)
    .filter(Boolean);

  if (checked.length === 0) {
    showToast('変更するアカウントを選択してください', 'error');
    return;
  }

  const selectedEntries = state.entries.filter((entry) => checked.includes(entry.id));
  const manualCandidates = selectedEntries.filter((entry) => !entry.hasRecipe).length;

  const confirmMessage = manualCandidates > 0
    ? `${checked.length}件のパスワードを変更します。\n\nレシピがない ${manualCandidates}件は、ブラウザで手動対応待ちになる場合があります。手動で変更したあと、そのタブを閉じると続行します。\n\n続行しますか？`
    : `${checked.length}件のパスワードを変更します。続行しますか？`;

  if (!confirm(confirmMessage)) {
    return;
  }

  dom.btnExecuteChanges.disabled = true;
  showExecutionModal(manualCandidates);

  try {
    const res = await fetch('/api/execute-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryIds: checked }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.entries = data.entries;
    hideModal();

    updateStats();
    renderTable();
    renderWorkflowNotice();
    setStep(4, true);

    const successCount = data.results.filter((r) => r.success).length;
    const manualCount = data.entries.filter((entry) => entry.changeStatus === 'skipped').length;

    if (manualCount > 0) {
      showToast(
        `完了: ${successCount}件成功、${manualCount}件は手動対応待ちです`,
        'info'
      );
    } else {
      showToast(
        `完了: ${successCount}/${data.results.length}件のパスワードを変更しました`,
        successCount === data.results.length ? 'success' : 'info'
      );
    }
  } catch (err) {
    hideModal();
    dom.btnExecuteChanges.disabled = false;
    showToast(`変更エラー: ${err.message}`, 'error');
  }
}

// ===== Export =====
async function handleExport() {
  try {
    const res = await fetch('/api/export-csv');
    if (!res.ok) throw new Error('エクスポート失敗');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'passwords-updated.csv';
    a.click();
    URL.revokeObjectURL(url);

    showToast('📤 CSVをエクスポートしました', 'success');
  } catch (err) {
    showToast(`エクスポートエラー: ${err.message}`, 'error');
  }
}

// ===== UI Rendering =====
function updateStats() {
  const entries = state.entries;
  dom.statTotal.textContent = entries.length;
  dom.statCompromised.textContent = entries.filter(
    (e) => e.breachStatus === 'compromised'
  ).length;
  dom.statSafe.textContent = entries.filter(
    (e) => e.breachStatus === 'safe'
  ).length;
  dom.statChanged.textContent = entries.filter(
    (e) => e.changeStatus === 'success'
  ).length;
}

function renderTable() {
  let entries = state.entries;

  // Apply filter
  if (state.filter !== 'all') {
    entries = entries.filter((e) => e.breachStatus === state.filter);
  }

  dom.entriesTbody.innerHTML = entries.map((entry) => `
    <tr>
      <td class="table__check">
        <input type="checkbox" data-id="${entry.id}">
      </td>
      <td>
        <div class="cell-site">
          <span class="cell-site__name">${escapeHtml(entry.name || '-')}</span>
          <span class="cell-site__url">${escapeHtml(entry.domain || entry.url)}</span>
        </div>
      </td>
      <td>${escapeHtml(entry.username)}</td>
      <td><span class="cell-password">${entry.passwordMasked}</span></td>
      <td>${renderBreachBadge(entry)}</td>
      <td>${renderModeBadge(entry)}</td>
      <td>${entry.hasNewPassword
        ? `<span class="cell-password">${entry.newPasswordMasked}</span>`
        : '<span style="color:var(--text-muted)">—</span>'
      }</td>
      <td>${renderStatusBadge(entry)}</td>
      <td>
        <button class="btn btn--ghost btn--sm" onclick="regeneratePassword('${entry.id}')">
          🎲
        </button>
      </td>
    </tr>
  `).join('');
}

function renderWorkflowNotice() {
  if (!state.entries.length) {
    dom.workflowNotice.hidden = true;
    dom.workflowNoticeList.innerHTML = '';
    return;
  }

  const manualEntries = state.entries.filter((entry) => entry.changeStatus === 'skipped');
  const readyEntries = state.entries.filter((entry) => entry.hasNewPassword);

  if (manualEntries.length > 0) {
    dom.workflowNotice.hidden = false;
    dom.workflowNotice.dataset.variant = 'warning';
    dom.workflowNoticeEyebrow.textContent = 'Manual Handoff';
    dom.workflowNoticeTitle.textContent = '手動対応が必要なアカウントがあります';
    dom.workflowNoticeText.textContent =
      '自動変更できなかったサイトはブラウザで変更し、完了後に開いたタブを閉じてください。新しいパスワードは保持されたままなので、そのまま再確認できます。';
    dom.workflowNoticeList.innerHTML = manualEntries
      .map((entry) => `
        <div class="workflow-notice__item">
          <span class="workflow-notice__item-name">${escapeHtml(entry.name || entry.domain || entry.url)}</span>
          <span class="workflow-notice__item-meta">${escapeHtml(entry.errorMessage || '手動対応待ち')}</span>
        </div>
      `)
      .join('');
    return;
  }

  if (readyEntries.length > 0) {
    const manualCandidates = readyEntries.filter((entry) => !entry.hasRecipe).length;
    dom.workflowNotice.hidden = false;
    dom.workflowNotice.dataset.variant = 'info';
    dom.workflowNoticeEyebrow.textContent = 'Before Execute';
    dom.workflowNoticeTitle.textContent = '一括変更の前に確認';
    dom.workflowNoticeText.textContent = manualCandidates > 0
      ? `変更対象のうち ${manualCandidates}件はレシピ未登録です。自動化できない場合はブラウザのタブが開いたまま待機するので、手動で変更してからタブを閉じてください。`
      : 'レシピがあるサイトはそのまま自動変更されます。ブラウザ操作が始まったら、ログインや2FAが必要な場面だけ補助してください。';
    dom.workflowNoticeList.innerHTML = '';
    return;
  }

  dom.workflowNotice.hidden = true;
  dom.workflowNoticeList.innerHTML = '';
}

function renderBreachBadge(entry) {
  switch (entry.breachStatus) {
    case 'compromised':
      return `<span class="badge badge--compromised">⚠️ 漏洩 ${entry.breachCount ? `(${formatNumber(entry.breachCount)}回)` : ''}</span>`;
    case 'safe':
      return '<span class="badge badge--safe">✅ 安全</span>';
    default:
      return '<span class="badge badge--unchecked">⏳ 未チェック</span>';
  }
}

function renderModeBadge(entry) {
  if (entry.hasRecipe) {
    return '<span class="badge badge--safe">📝 レシピ</span>';
  }
  return '<span class="badge badge--pending">🤖 AI解析</span>';
}

function renderStatusBadge(entry) {
  switch (entry.changeStatus) {
    case 'success':
      return '<span class="badge badge--success">✅ 変更済み</span>';
    case 'in-progress':
      return '<span class="badge badge--in-progress">🔄 変更中</span>';
    case 'failed':
      return `<span class="badge badge--failed" title="${escapeHtml(entry.errorMessage || '')}">❌ 失敗</span>`;
    case 'skipped':
      return `<span class="badge badge--manual" title="${escapeHtml(entry.errorMessage || '')}">🖐️ 手動対応</span>`;
    default:
      return '<span class="badge badge--pending">⏳ 待機中</span>';
  }
}

// ===== Step Navigation =====
function setStep(stepNumber, markPreviousComplete = false) {
  state.currentStep = stepNumber;

  $$('.step').forEach((el) => {
    const step = parseInt(el.dataset.step);
    el.classList.remove('active', 'completed');
    if (step === stepNumber) {
      el.classList.add('active');
    } else if (step < stepNumber || (markPreviousComplete && step < stepNumber)) {
      el.classList.add('completed');
    }
  });
}

// ===== Regenerate single password =====
async function regeneratePassword(entryId) {
  try {
    const res = await fetch('/api/generate-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId, options: { length: 24 } }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const entriesRes = await fetch('/api/entries');
    const entriesData = await entriesRes.json();
    if (entriesRes.ok) {
      state.entries = entriesData.entries;
      renderTable();
      renderWorkflowNotice();
    }

    showToast('🎲 新しいパスワードを生成しました', 'success');
  } catch (err) {
    showToast(`エラー: ${err.message}`, 'error');
  }
}

// ===== Modal =====
function showModal(title, text) {
  dom.modalTitle.textContent = title;
  dom.progressText.textContent = text;
  dom.progressFill.style.width = '0%';
  dom.progressLog.innerHTML = '';
  dom.modalProgress.hidden = false;
}

function showExecutionModal(manualCandidates) {
  showModal(
    'パスワード変更中...',
    manualCandidates > 0
      ? 'ブラウザを起動しています。自動化できないサイトは手動対応へ切り替わります。'
      : 'ブラウザを起動して自動操作します...'
  );

  const messages = [
    '自動変更を開始しています。',
    'ログインや2FAが必要な場合は、開いたブラウザで補助してください。',
  ];

  if (manualCandidates > 0) {
    messages.push(
      `レシピ未登録の ${manualCandidates}件は、手動で変更後にタブを閉じると続行します。`
    );
  }

  dom.progressLog.innerHTML = messages
    .map((message) => `<p>${escapeHtml(message)}</p>`)
    .join('');
}

function hideModal() {
  dom.modalProgress.hidden = true;
}

function updateProgress(percent, text) {
  dom.progressFill.style.width = `${percent}%`;
  if (text) dom.progressText.textContent = text;
}

// ===== Toast =====
function showToast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${icons[type]}</span>
    <span class="toast__message">${escapeHtml(message)}</span>
    <button class="toast__close" onclick="this.parentElement.remove()">✕</button>
  `;

  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('exit');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ===== Helpers =====
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatNumber(num) {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
