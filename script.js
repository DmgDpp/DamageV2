// ==========================================================================
// KONFIGURASI UTAMA KONEKSI SPREADSHEET & APPS SCRIPT
// ==========================================================================
const SPREADSHEET_ID = "10BcwxXBWk2xmTZYl_pRrmEnaljClQ0z6UxdJKKZlUHc"; // ID Spreadsheet Anda
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby230i3SBh-woI0VpHmGaiVKJbxv-pDccMHRnDjOUL059pQOJW-YbN1FMC_tOXn6yGA/exec";   // URL Web App Apps Script Anda

let allReports = [];
let isAdminLoggedIn = false;
let trendChartInstance = null;
let ratioChartInstance = null;

function switchTab(tabName) {
  const dashboardView = document.getElementById('dashboardView');
  const analyticsView = document.getElementById('analyticsView');
  const formView = document.getElementById('formView');
  const btnDashboard = document.getElementById('btnTabDashboard');
  const btnAnalytics = document.getElementById('btnTabAnalytics');
  const btnForm = document.getElementById('btnTabForm');

  dashboardView.classList.add('hidden');
  analyticsView.classList.add('hidden');
  formView.classList.add('hidden');
  btnDashboard.classList.remove('active');
  btnAnalytics.classList.remove('active');
  btnForm.classList.remove('active');

  if (tabName === 'dashboard') {
    dashboardView.classList.remove('hidden');
    btnDashboard.classList.add('active');
  } else if (tabName === 'analytics') {
    analyticsView.classList.remove('hidden');
    btnAnalytics.classList.add('active');
    renderAnalytics();
  } else {
    formView.classList.remove('hidden');
    btnForm.classList.add('active');
  }
}

function togglePenyelesaian(selectId, groupContainerId) {
  const statusVal = document.getElementById(selectId).value;
  const group = document.getElementById(groupContainerId);
  if (statusVal === 'Close') {
    group.classList.remove('hidden');
  } else {
    group.classList.add('hidden');
  }
}

function toggleAdminLogin() {
  if (isAdminLoggedIn) {
    isAdminLoggedIn = false;
    document.getElementById('btnAdminToggle').classList.remove('active');
    document.getElementById('btnAdminToggle').textContent = "🔑 Mode Admin";
    showToast("Mode Admin Dinonaktifkan.");
    renderCards(allReports);
  } else {
    const password = prompt("Masukkan Password Admin:");
    if (password === "admin123" || password === "admin") {
      isAdminLoggedIn = true;
      document.getElementById('btnAdminToggle').classList.add('active');
      document.getElementById('btnAdminToggle').textContent = "🔒 Admin (Aktif - Logout)";
      showToast("Berhasil Login sebagai Admin!");
      renderCards(allReports);
    } else if (password !== null) {
      alert("Password Admin Salah!");
    }
  }
}

// HELPER PARSER TANGGAL UNIVERSAL (ANTI "LAINNYA")
function parseCustomDate(rawDate) {
  const indoMonths = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  // Jika data tanggal kosong/null, gunakan bulan & tahun saat ini sebagai default
  if (!rawDate || rawDate.toString().trim() === "" || rawDate === null) {
    const now = new Date();
    return `${indoMonths[now.getMonth()]} ${now.getFullYear()}`;
  }

  const strDate = rawDate.toString().trim();

  // 1. Cek format khas gviz "Date(2026,8,21)" atau "Date(2026,8,21,14,30,0)"
  const gvizMatch = strDate.match(/Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/i);
  if (gvizMatch) {
    const year = parseInt(gvizMatch[1], 10);
    const monthIndex = parseInt(gvizMatch[2], 10);
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${indoMonths[monthIndex]} ${year}`;
    }
  }

  // 2. Ekstraksi Angka Bulan & Tahun dari String (misal "21/09/2026 10:00" atau "21-09-2026")
  // Mencari pola DD/MM/YYYY atau YYYY-MM-DD
  const dmyMatch = strDate.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    let day = parseInt(dmyMatch[1], 10);
    let month = parseInt(dmyMatch[2], 10);
    let year = parseInt(dmyMatch[3], 10);

    // Jika format YYYY-MM-DD
    if (day > 1000) {
      const tempYear = day;
      day = year;
      year = tempYear;
    }

    if (month >= 1 && month <= 12) {
      return `${indoMonths[month - 1]} ${year}`;
    }
  }

  // 3. Cek Teks Bulan Indonesia dalam String (misal "21 September 2026")
  const lowerStr = strDate.toLowerCase();
  for (let i = 0; i < indoMonths.length; i++) {
    if (lowerStr.includes(indoMonths[i].toLowerCase())) {
      const yearMatch = strDate.match(/\b(20\d{2})\b/);
      const yearStr = yearMatch ? yearMatch[1] : new Date().getFullYear();
      return `${indoMonths[i]} ${yearStr}`;
    }
  }

  // 4. Fallback Standar JS Date
  const stdDate = new Date(strDate);
  if (!isNaN(stdDate.getTime())) {
    return `${indoMonths[stdDate.getMonth()]} ${stdDate.getFullYear()}`;
  }

  // 5. Fallback Akhir: Mengambil bulan & tahun dari sistem jika format tanggal unik
  const currentNow = new Date();
  return `${indoMonths[currentNow.getMonth()]} ${currentNow.getFullYear()}`;
}

// FUNGSI LOAD DATA
async function loadReports() {
  const loading = document.getElementById('loadingCards');

  if (!SPREADSHEET_ID || SPREADSHEET_ID.includes("PASTE_SPREADSHEET")) {
    loading.innerHTML = `<p style="color:#d97706;">Silakan isi <b>SPREADSHEET_ID</b> pada file script.js.</p>`;
    return;
  }

  const gvisUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json`;

  try {
    const res = await fetch(gvisUrl);
    const text = await res.text();
    const jsonString = text.substring(47, text.length - 2);
    const json = JSON.parse(jsonString);

    const rows = json.table.rows;
    allReports = [];

    rows.forEach((r, idx) => {
      const c = r.c;
      if (!c || !c[1]) return; // Skip jika baris kosong

      let photoUrls = [];
      if (c[9] && c[9].v) {
        photoUrls = c[9].v.toString().split(",");
      }

      // Ambil nilai tanggal dari Kolom A (Timestamp/Tanggal)
      let rawDate = "";
      if (c[0]) {
        rawDate = c[0].f ? c[0].f : (c[0].v ? c[0].v : "");
      }

      // Parse nama bulan
      let monthKey = parseCustomDate(rawDate);

      allReports.push({
        rowIndex: idx + 2,
        timestamp: rawDate,
        monthKey: monthKey, // Terisi nama bulan Bahasa Indonesia
        project: c[1] ? c[1].v : "",
        noBa: c[2] ? c[2].v : "",
        tipeDamage: c[3] ? c[3].v : "",
        sku: c[4] ? c[4].v : "",
        qty: c[5] ? c[5].v : "",
        keterangan: c[6] ? c[6].v : "",
        folderLink: c[7] ? c[7].v : "#",
        pdfLink: c[8] ? c[8].v : "#",
        photos: photoUrls,
        statusBap: (c[10] && c[10].v) ? c[10].v : "Open",
        penyelesaian: (c[11] && c[11].v) ? c[11].v : "-"
      });
    });

    populateMonthFilter();
    loading.classList.add('hidden');
    
    renderCards(allReports);
    updateSummary(allReports);

    // Refresh grafik/tabel jika sedang di tab Analisis
    const analyticsView = document.getElementById('analyticsView');
    if (analyticsView && !analyticsView.classList.contains('hidden')) {
      renderAnalytics();
    }

  } catch (err) {
    console.error("Error reading sheets:", err);
    loading.innerHTML = `<p style="color:#dc2626;">Gagal memuat data Google Sheets.</p>`;
  }
}



function populateMonthFilter() {
  const monthFilter = document.getElementById('monthFilter');
  const months = [...new Set(allReports.map(item => item.monthKey))];
  
  monthFilter.innerHTML = `<option value="ALL">Semua Bulan</option>`;
  months.forEach(m => {
    if (m && m !== "Lainnya") {
      monthFilter.innerHTML += `<option value="${m}">${m}</option>`;
    }
  });
}

function renderCards(reports) {
  const grid = document.getElementById('cardGrid');
  grid.innerHTML = '';

  if (!reports || reports.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 48px; color: #64748b;"><p>Belum ada data laporan barang damage.</p></div>`;
    return;
  }

  reports.forEach(item => {
    const photoSrc = (item.photos && item.photos.length > 0 && item.photos[0] !== "") 
      ? item.photos[0] 
      : 'https://via.placeholder.com/400x200?text=Foto+Kerusakan';

    const typeClass = item.tipeDamage ? item.tipeDamage.toLowerCase() : 'inbound';
    const currentStatus = item.statusBap && item.statusBap !== "" ? item.statusBap : "Open";
    const statusClass = currentStatus.toLowerCase();

    // Quick Resolution Buttons
    let quickActions = '';
    if (currentStatus === 'Open') {
      quickActions = `
        <div class="card-actions-quick">
          <button onclick="quickSetResolution(${item.rowIndex}, 'Close', 'Tarik Pabrik')" class="btn-quick tarik">🏭 Tarik Pabrik</button>
          <button onclick="quickSetResolution(${item.rowIndex}, 'Close', 'Klaim')" class="btn-quick klaim">📝 Klaim</button>
        </div>
      `;
    } else {
      quickActions = `
        <div class="card-actions-quick">
          <button onclick="quickSetResolution(${item.rowIndex}, 'Open', '-')" class="btn-quick reopen">🔓 Reopen BAP</button>
        </div>
      `;
    }

    let actionButtons = '';
    if (isAdminLoggedIn) {
      actionButtons = `
        <button onclick="openEditModal(${item.rowIndex})" class="card-btn edit">✏️ Edit</button>
        <button onclick="deleteReport(${item.rowIndex})" class="card-btn delete">🗑️ Hapus</button>
      `;
    } else {
      actionButtons = `
        ${(item.pdfLink && item.pdfLink !== "#") ? `<a href="${item.pdfLink}" target="_blank" class="card-btn pdf">📄 PDF BA</a>` : ''}
        ${(item.folderLink && item.folderLink !== "#") ? `<a href="${item.folderLink}" target="_blank" class="card-btn drive">📁 Google Drive</a>` : ''}
      `;
    }

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-media">
        <img src="${photoSrc}" alt="${item.sku}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x200?text=Foto+Gagal+Dimuat'">
        <span class="badge-status ${statusClass}">BAP: ${currentStatus}</span>
        <span class="badge-type ${typeClass}">${item.tipeDamage}</span>
      </div>
      <div class="card-body">
        <div class="card-project">📌 ${item.project}</div>
        <h3 class="card-title">${item.sku}</h3>
        <div class="card-meta">
          <span><strong>Qty:</strong> ${item.qty} Pcs</span>
          <span><strong>BA:</strong> ${item.noBa}</span>
        </div>
        
        ${currentStatus === 'Close' ? `<div class="card-resolution">🤝 Penyelesaian: <u>${item.penyelesaian || 'Tarik Pabrik'}</u></div>` : ''}

        <div class="card-keterangan">
          <strong>Kronologi / Keterangan:</strong><br>
          ${item.keterangan}
        </div>

        ${quickActions}

        <div class="card-footer">
          ${actionButtons}
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Aksi Cepat Penyelesaian BAP (Tarik Pabrik / Klaim / Reopen)
function quickSetResolution(rowIndex, newStatus, newPenyelesaian) {
  showToast(`⏳ Memperbarui Status BAP ke ${newStatus}...`);

  const statusBap = encodeURIComponent(newStatus);
  const penyelesaian = encodeURIComponent(newPenyelesaian);

  const updateUrl = `${SCRIPT_URL}?action=UPDATE&rowIndex=${rowIndex}&statusBap=${statusBap}&penyelesaian=${penyelesaian}&callback=onQuickUpdateComplete`;

  window.onQuickUpdateComplete = function(response) {
    if (response && response.result === 'success') {
      showToast(`Status BAP Berhasil Diperbarui (${newStatus})!`);
      setTimeout(loadReports, 1000);
    } else {
      alert("Gagal memperbarui status BAP.");
    }
  };

  const script = document.createElement('script');
  script.src = updateUrl;
  document.body.appendChild(script);
}

function updateSummary(reports) {
  const totalBa = reports.length;
  let totalQty = 0;
  let totalOpen = 0;
  let totalClose = 0;

  reports.forEach(item => {
    let qtyNum = 0;
    if (item.qty) {
      const match = item.qty.toString().match(/\d+/);
      if (match) qtyNum = parseInt(match[0], 10);
    }
    totalQty += qtyNum;

    const status = (item.statusBap || "Open").toString().trim().toLowerCase();
    if (status === "close") {
      totalClose++;
    } else {
      totalOpen++;
    }
  });

  document.getElementById('statTotalBa').textContent = totalBa;
  document.getElementById('statTotalQty').textContent = `${totalQty} Pcs`;
  document.getElementById('statTotalOpen').textContent = totalOpen;
  document.getElementById('statTotalClose').textContent = totalClose;
}

function applyFilters() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const selectedMonth = document.getElementById('monthFilter').value;
  const selectedType = document.getElementById('typeFilter').value;
  const selectedStatus = document.getElementById('statusFilter').value;

  const filtered = allReports.filter(item => {
    const matchesSearch = 
      (item.project && item.project.toLowerCase().includes(searchTerm)) ||
      (item.sku && item.sku.toLowerCase().includes(searchTerm)) ||
      (item.noBa && item.noBa.toLowerCase().includes(searchTerm)) ||
      (item.keterangan && item.keterangan.toLowerCase().includes(searchTerm));

    const matchesMonth = (selectedMonth === 'ALL') || (item.monthKey === selectedMonth);
    const matchesType = (selectedType === 'ALL') || (item.tipeDamage === selectedType);
    const matchesStatus = (selectedStatus === 'ALL') || ((item.statusBap || "Open") === selectedStatus);

    return matchesSearch && matchesMonth && matchesType && matchesStatus;
  });

  renderCards(filtered);
  updateSummary(filtered);
}

function renderAnalytics() {
  const matrixBody = document.getElementById('projectMatrixBody');
  matrixBody.innerHTML = '';

  const groups = {};
  let totalInbound = 0;
  let totalHandling = 0;
  const monthGroup = {};

  allReports.forEach(item => {
    const p = item.project || "Unassigned";
    const m = item.monthKey || "Lainnya";
    const type = item.tipeDamage || "Inbound";
    const key = `${p}_${m}`;

    let qtyNum = 0;
    if (item.qty) {
      const match = item.qty.toString().match(/\d+/);
      if (match) qtyNum = parseInt(match[0], 10);
    }

    if (!groups[key]) {
      groups[key] = { project: p, month: m, inboundQty: 0, handlingQty: 0, totalBa: 0 };
    }

    if (type.toLowerCase() === 'inbound') {
      groups[key].inboundQty += qtyNum;
      totalInbound += qtyNum;
    } else {
      groups[key].handlingQty += qtyNum;
      totalHandling += qtyNum;
    }
    groups[key].totalBa += 1;

    if (!monthGroup[m]) monthGroup[m] = 0;
    monthGroup[m] += qtyNum;
  });

  Object.values(groups).forEach(g => {
    const totalQty = g.inboundQty + g.handlingQty;
    matrixBody.innerHTML += `
      <tr>
        <td><strong>${g.project}</strong></td>
        <td>${g.month}</td>
        <td><span style="color:#34d399; font-weight:600;">${g.inboundQty} Pcs</span></td>
        <td><span style="color:#fbbf24; font-weight:600;">${g.handlingQty} Pcs</span></td>
        <td><strong>${totalQty} Pcs</strong></td>
        <td>${g.totalBa} BA</td>
      </tr>
    `;
  });

  renderTrendChart(Object.keys(monthGroup), Object.values(monthGroup));
  renderRatioChart(totalInbound, totalHandling);
}

function renderTrendChart(labels, data) {
  const ctx = document.getElementById('monthlyTrendChart').getContext('2d');
  if (trendChartInstance) trendChartInstance.destroy();

  trendChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total Qty Damage',
        data: data,
        backgroundColor: '#3b82f6',
        borderRadius: 6
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

function renderRatioChart(inboundQty, handlingQty) {
  const ctx = document.getElementById('typeRatioChart').getContext('2d');
  if (ratioChartInstance) ratioChartInstance.destroy();

  ratioChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Inbound', 'Handling'],
      datasets: [{
        data: [inboundQty, handlingQty],
        backgroundColor: ['#10b981', '#f59e0b']
      }]
    },
    options: { responsive: true }
  });
}

function openEditModal(rowIndex) {
  const item = allReports.find(r => r.rowIndex === rowIndex);
  if (!item) return;

  document.getElementById('editRowIndex').value = item.rowIndex;
  document.getElementById('editProject').value = item.project;
  document.getElementById('editTipe').value = item.tipeDamage;
  document.getElementById('editSku').value = item.sku;
  document.getElementById('editQty').value = item.qty;
  document.getElementById('editKeterangan').value = item.keterangan;
  document.getElementById('editStatusBap').value = item.statusBap || "Open";
  document.getElementById('editPenyelesaian').value = (item.penyelesaian && item.penyelesaian !== "-") ? item.penyelesaian : "Tarik Pabrik";

  togglePenyelesaian('editStatusBap', 'editPenyelesaianGroup');
  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
}

function handleEditSubmit(event) {
  event.preventDefault();
  const btnSave = document.getElementById('btnSaveEdit');
  btnSave.disabled = true;
  btnSave.textContent = '⏳ Menyimpan...';

  const rowIndex = document.getElementById('editRowIndex').value;
  const project = encodeURIComponent(document.getElementById('editProject').value);
  const tipeDamage = encodeURIComponent(document.getElementById('editTipe').value);
  const sku = encodeURIComponent(document.getElementById('editSku').value);
  const qty = encodeURIComponent(document.getElementById('editQty').value);
  const keterangan = encodeURIComponent(document.getElementById('editKeterangan').value);
  const statusBap = encodeURIComponent(document.getElementById('editStatusBap').value);
  const penyelesaian = encodeURIComponent(document.getElementById('editPenyelesaian').value);

  const editUrl = `${SCRIPT_URL}?action=UPDATE&rowIndex=${rowIndex}&project=${project}&tipeDamage=${tipeDamage}&sku=${sku}&qty=${qty}&keterangan=${keterangan}&statusBap=${statusBap}&penyelesaian=${penyelesaian}&callback=onEditComplete`;

  window.onEditComplete = function(response) {
    btnSave.disabled = false;
    btnSave.textContent = 'Simpan Perubahan';
    closeEditModal();

    if (response && response.result === 'success') {
      showToast("Data laporan berhasil diperbarui!");
      setTimeout(loadReports, 1200);
    } else {
      alert("Gagal memperbarui data.");
    }
  };

  const script = document.createElement('script');
  script.src = editUrl;
  document.body.appendChild(script);
}

function deleteReport(rowIndex) {
  if (!confirm("Apakah Anda yakin ingin menghapus laporan barang damage ini?")) return;

  showToast("⏳ Menghapus data laporan...");

  const deleteUrl = `${SCRIPT_URL}?action=DELETE&rowIndex=${rowIndex}&callback=onDeleteComplete`;

  window.onDeleteComplete = function(response) {
    if (response && response.result === 'success') {
      showToast("Data berhasil dihapus!");
      setTimeout(loadReports, 1200);
    } else {
      alert("Gagal menghapus data.");
    }
  };

  const script = document.createElement('script');
  script.src = deleteUrl;
  document.body.appendChild(script);
}

const fileToBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
  reader.onerror = error => reject(error);
});

async function handleFormSubmit(event) {
  event.preventDefault();

  const btnSubmit = document.getElementById('btnSubmit');
  btnSubmit.disabled = true;
  btnSubmit.textContent = '⏳ Mengunggah ke Drive...';

  try {
    const pdfInput = document.getElementById('pdfFileInput').files[0];
    const pdfData = pdfInput ? await fileToBase64(pdfInput) : null;

    const photoInputs = document.getElementById('photosInput').files;
    const photoPromises = Array.from(photoInputs).map(file => fileToBase64(file));
    const photosData = await Promise.all(photoPromises);

    const payload = {
      action: "CREATE",
      project: document.getElementById('projectInput').value,
      noBa: document.getElementById('noBaInput').value,
      tipeDamage: document.getElementById('typeInput').value,
      qty: document.getElementById('qtyInput').value,
      sku: document.getElementById('skuInput').value,
      keterangan: document.getElementById('keteranganInput').value,
      statusBap: document.getElementById('statusBapInput').value,
      penyelesaian: document.getElementById('penyelesaianInput').value,
      pdfFile: pdfData,
      photos: photosData
    };

    await fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    showToast("Laporan terkirim! Memperbarui data...");
    document.getElementById('damageForm').reset();
    switchTab('dashboard');
    setTimeout(loadReports, 3000);

  } catch (err) {
    console.error(err);
    alert('Terjadi kesalahan saat mengunggah data.');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Kirim & Buat Folder Drive';
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => { toast.classList.add('hidden'); }, 3500);
}

document.addEventListener('DOMContentLoaded', () => {
  loadReports();
});
