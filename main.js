// main.js
// -----------------------
// COMPLETE Firebase + Firestore client logic.
// Put placeholders here; GitHub Actions will replace them during deploy.

/////////////////////
// Firebase config //
/////////////////////

const firebaseConfig = {
  apiKey: "${FIREBASE_API_KEY}",
  authDomain: "${FIREBASE_AUTH_DOMAIN}",
  projectId: "${FIREBASE_PROJECT_ID}",
  storageBucket: "${FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${FIREBASE_MESSAGING_SENDER_ID}",
  appId: "${FIREBASE_APP_ID}"
};

// Initialize Firebase
try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  // If firebase already initialized (hot-reload), ignore
}
const auth = (firebase && firebase.auth) ? firebase.auth() : null;
const db = (firebase && firebase.firestore) ? firebase.firestore() : null;

// Helper: safe DOM getter
const $ = id => document.getElementById(id);

// Current user reference
let currentUser = null;

// Chart instances (destroy before re-create)
let weekChart = null;
let monthChart = null;

// Track edit doc id
let editDocId = null;

///////////////
// Utilities //
///////////////

// Parse 'YYYY-MM-DD' into a Date object (local, avoids timezone issues).
function parseISODate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Format Date object to 'YYYY-MM-DD'
function toISODateStr(dt) {
  if (!dt || !(dt instanceof Date)) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Given a date string, return Monday and Sunday of that week (dates and strings)
function getWeekRangeFromDateStr(dateStr) {
  const d = parseISODate(dateStr);
  if (!d) return null;
  // JS: 0 = Sun ... 6 = Sat. We want Monday as start
  const day = d.getDay(); // 0..6
  // compute how many days to subtract to get Monday
  const diffToMonday = (day + 6) % 7; // Sun->6, Mon->0, Tue->1, ...
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    monday,
    sunday,
    mondayStr: toISODateStr(monday),
    sundayStr: toISODateStr(sunday)
  };
}

// Get number of days in month for a given year/month index
function daysInMonth(year, monthIndex) { // monthIndex 0..11
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatCurrency(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

//////////////////////
// Auth & redirects //
//////////////////////

if (auth) {
  auth.onAuthStateChanged(async (user) => {
    const path = window.location.pathname.split('/').pop().toLowerCase();
    currentUser = user;
    if (user) {
      // If we're on index (login) page, redirect to app
      if (path === 'index.html' || path === '' || path === 'login.html') {
        window.location.href = 'app.html';
        return;
      }
      // If we're on app page, perform initial data load
      if (path === 'app.html' || path === 'app') {
        // safety: small delay to allow DOM ready
        setTimeout(() => {
          try { loadHistory(); } catch(e) { /* ignore */ }
        }, 250);
      }
    } else {
      // No user: if in app page, send to index/login
      if (path === 'app.html' || path === 'app') {
        window.location.href = 'index.html';
      }
    }
  });
}

// Attach auth UI listeners only if elements present (index.html)
if ($('login-btn')) {
  $('login-btn').addEventListener('click', () => {
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email || !password) return alert('Enter email & password');
    auth.signInWithEmailAndPassword(email, password).catch(e => alert(e.message));
  });
}
if ($('signup-btn')) {
  $('signup-btn').addEventListener('click', () => {
    const email = $('signup-email').value.trim();
    const password = $('signup-password').value;
    if (!email || !password) return alert('Enter email & password');
    auth.createUserWithEmailAndPassword(email, password).catch(e => alert(e.message));
  });
}
if ($('google-login')) {
  $('google-login').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(e => alert(e.message));
  });
}
if ($('logout-btn')) {
  $('logout-btn').addEventListener('click', () => {
    auth.signOut().catch(e => alert(e.message));
  });
}

////////////////////////
// Firestore features //
////////////////////////

/** addSpend
 * Reads from spend form, writes doc under users/{uid}/spends
 */
async function addSpend() {
  if (!currentUser) return alert('Please login');
  try {
    const date = $('spendDate') ? $('spendDate').value : '';
    const item = $('spendItem') ? $('spendItem').value.trim() : '';
    const priceRaw = $('spendPrice') ? $('spendPrice').value : '';
    const price = parseFloat(priceRaw);
    if (!date || !item || isNaN(price)) return alert('Please fill date, item and price');

    await db.collection('users').doc(currentUser.uid).collection('spends').add({
      date,
      item,
      price,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // clear inputs & refresh
    if ($('spendItem')) $('spendItem').value = '';
    if ($('spendPrice')) $('spendPrice').value = '';
    alert('Saved!');
    await loadHistory();
    // If user had a date selected in home, refresh charts for that date
    const selectedDate = $('homeDate') ? $('homeDate').value : null;
    if (selectedDate) await drawCharts(selectedDate);
  } catch (e) {
    console.error(e);
    alert('Save failed: ' + e.message);
  }
}

/** showDaySpend - shows spend list for selected day + draws charts
 */
async function showDaySpend() {
  if (!currentUser) return;
  if (!$('homeDate')) return;
  const date = $('homeDate').value;
  if (!date) return alert('Please select a date');

  // Render daily items
  const resultDiv = $('homeResult');
  resultDiv.innerHTML = '';

  try {
    // Query spends where date == selected date
    const snap = await db.collection('users').doc(currentUser.uid).collection('spends')
      .where('date', '==', date)
      .orderBy('createdAt', 'asc')
      .get();

    let total = 0;
    if (snap.empty) {
      resultDiv.innerHTML = '<div class="list-item">No records for this date.</div>';
    } else {
      snap.forEach(doc => {
        const data = doc.data();
        total += Number(data.price || 0);
        const node = renderSpendRow(doc.id, data.date, data.item, data.price);
        resultDiv.appendChild(node);
      });
    }
    // Total
    const totDiv = document.createElement('div');
    totDiv.className = 'list-item';
    totDiv.innerHTML = `<b>Total: ${formatCurrency(total)}</b>`;
    resultDiv.appendChild(totDiv);

    // Draw week/month charts for this date
    await drawCharts(date);
  } catch (e) {
    console.error(e);
    alert('Error loading day spends: ' + e.message);
  }
}

/** loadHistory - last 5 spends (desc by createdAt)
 */
async function loadHistory() {
  if (!currentUser) return;
  const list = $('historyList');
  if (!list) return;
  list.innerHTML = '';

  try {
    const snap = await db.collection('users').doc(currentUser.uid).collection('spends')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    if (snap.empty) {
      list.innerHTML = '<div class="list-item">No recent purchases.</div>';
      return;
    }

    snap.forEach(doc => {
      const d = doc.data();
      const node = renderSpendRow(doc.id, d.date, d.item, d.price);
      list.appendChild(node);
    });
  } catch (e) {
    console.error(e);
  }
}

/** renderSpendRow - returns a DOM node (div) for a spend with Edit/Delete buttons
 *  Use programmatic listeners (safe from quoting issues).
 */
function renderSpendRow(docId, date, item, price) {
  const container = document.createElement('div');
  container.className = 'list-item';

  const left = document.createElement('div');
  left.style.display = 'inline-block';
  left.style.width = '70%';
  left.innerText = `${date}: ${item} - ${formatCurrency(price)}`;

  const right = document.createElement('div');
  right.style.display = 'inline-block';
  right.style.width = '28%';
  right.style.textAlign = 'right';

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.style.marginLeft = '8px';
  editBtn.innerText = '✏️';
  editBtn.title = 'Edit';
  editBtn.addEventListener('click', () => openEditModal(docId));

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.style.marginLeft = '6px';
  delBtn.innerText = '🗑️';
  delBtn.title = 'Delete';
  delBtn.addEventListener('click', () => deleteSpend(docId));

  right.appendChild(editBtn);
  right.appendChild(delBtn);

  container.appendChild(left);
  container.appendChild(right);
  return container;
}

//////////////////////////
// Edit + Delete flows  //
//////////////////////////

// Open edit modal and populate fields
async function openEditModal(docId) {
  if (!currentUser || !docId) return;
  try {
    const ref = db.collection('users').doc(currentUser.uid).collection('spends').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return alert('Record not found');
    const d = snap.data();
    editDocId = docId;
    if ($('edit-date')) $('edit-date').value = d.date;
    if ($('edit-item')) $('edit-item').value = d.item;
    if ($('edit-price')) $('edit-price').value = d.price;
    if ($('edit-modal')) $('edit-modal').style.display = 'flex';
  } catch (e) {
    console.error(e);
    alert('Could not open edit: ' + e.message);
  }
}

function closeEditModal() {
  if ($('edit-modal')) $('edit-modal').style.display = 'none';
  editDocId = null;
}

async function saveEdit() {
  if (!currentUser || !editDocId) return alert('No record selected');
  try {
    const date = $('edit-date').value;
    const item = $('edit-item').value.trim();
    const price = parseFloat($('edit-price').value);
    if (!date || !item || isNaN(price)) return alert('Fill all fields');

    const ref = db.collection('users').doc(currentUser.uid).collection('spends').doc(editDocId);
    await ref.update({ date, item, price });
    closeEditModal();
    alert('Updated!');
    // Refresh views
    if ($('homeDate') && $('homeDate').value) await showDaySpend();
    await loadHistory();
  } catch (e) {
    console.error(e);
    alert('Update failed: ' + e.message);
  }
}

async function deleteSpend(docId) {
  if (!currentUser || !docId) return;
  if (!confirm('Delete this record?')) return;
  try {
    await db.collection('users').doc(currentUser.uid).collection('spends').doc(docId).delete();
    alert('Deleted!');
    // Refresh
    if ($('homeDate') && $('homeDate').value) await showDaySpend();
    await loadHistory();
  } catch (e) {
    console.error(e);
    alert('Delete failed: ' + e.message);
  }
}

//////////////////////
// Export to Excel  //
//////////////////////

async function downloadExcel() {
  if (!currentUser) return alert('Please login');
  const from = $('fromDate') ? $('fromDate').value : '';
  const to = $('toDate') ? $('toDate').value : '';
  if (!from || !to) return alert('Select both From and To dates');

  try {
    const snap = await db.collection('users').doc(currentUser.uid).collection('spends')
      .where('date', '>=', from)
      .where('date', '<=', to)
      .orderBy('date')
      .get();

    const rows = [];
    snap.forEach(doc => {
      const d = doc.data();
      rows.push({
        id: doc.id,
        date: d.date,
        item: d.item,
        price: d.price
      });
    });

    if (rows.length === 0) return alert('No records found');

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Spends');
    XLSX.writeFile(wb, `Spends_${from}_to_${to}.xlsx`);
  } catch (e) {
    console.error(e);
    alert('Export failed: ' + e.message);
  }
}

//////////////////////////
// Charts: weekly/month //
//////////////////////////

// Draw both charts for a selected date (weekly & monthly)
async function drawCharts(dateStr) {
  if (!currentUser) return;
  if (!dateStr) return;
  try {
    await drawWeekChart(dateStr);
    await drawMonthChart(dateStr);
  } catch (e) {
    console.error('drawCharts error', e);
  }
}

// Weekly chart: Mon..Sun totals (labels Mon..Sun)
async function drawWeekChart(dateStr) {
  if (!currentUser || !$('weekChart')) return;

  const { mondayStr, sundayStr, monday } = getWeekRangeFromDateStr(dateStr);

  // Query spends between mondayStr and sundayStr inclusive
  const snap = await db.collection('users').doc(currentUser.uid).collection('spends')
    .where('date', '>=', mondayStr)
    .where('date', '<=', sundayStr)
    .get();

  // Initialize map for 7 days
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const totals = new Array(7).fill(0);
  const datesForTooltip = new Array(7).fill(null);
  for (let i = 0; i < 7; ++i) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    datesForTooltip[i] = toISODateStr(d);
  }

  snap.forEach(doc => {
    const d = doc.data();
    const idx = (parseISODate(d.date) - parseISODate(mondayStr)) / (24*3600*1000);
    const i = Math.round(idx);
    if (i >= 0 && i < 7) totals[i] += Number(d.price || 0);
  });

  const ctx = $('weekChart').getContext('2d');
  if (weekChart) weekChart.destroy();
  weekChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dayNames,
      datasets: [{
        label: 'Weekly Spending',
        data: totals,
        backgroundColor: '#4a90e2'
      }]
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            title: (ctxItems) => {
              const idx = ctxItems[0].dataIndex;
              return `${dayNames[idx]} - ${datesForTooltip[idx]}`;
            },
            label: (ctxItem) => `Spending: ${formatCurrency(ctxItem.parsed.y)}`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Amount (₹)' } },
        x: { title: { display: true, text: 'Day' } }
      }
    }
  });
}

// Monthly chart: day-of-month sums
async function drawMonthChart(dateStr) {
  if (!currentUser || !$('monthChart')) return;

  const d = parseISODate(dateStr);
  const year = d.getFullYear();
  const monthIndex = d.getMonth(); // 0..11

  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex, daysInMonth(year, monthIndex));
  const firstStr = toISODateStr(firstDay);
  const lastStr = toISODateStr(lastDay);

  const snap = await db.collection('users').doc(currentUser.uid).collection('spends')
    .where('date', '>=', firstStr)
    .where('date', '<=', lastStr)
    .get();

  const daysCount = daysInMonth(year, monthIndex);
  const totals = new Array(daysCount).fill(0);
  // accumulate
  snap.forEach(doc => {
    const e = doc.data();
    const dt = parseISODate(e.date);
    const idx = dt.getDate() - 1; // 0-index
    if (idx >= 0 && idx < daysCount) totals[idx] += Number(e.price || 0);
  });

  // build labels '1','2',...daysCount
  const labels = Array.from({length: daysCount}, (_,i) => String(i+1));

  const ctx = $('monthChart').getContext('2d');
  if (monthChart) monthChart.destroy();
  monthChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Monthly Spending',
        data: totals,
        borderColor: '#2c7be5',
        fill: false,
        tension: 0.2
      }]
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            title: (ctxItems) => {
              const lbl = ctxItems[0].label; // day number
              const dayNum = Number(lbl);
              const dateObj = new Date(year, monthIndex, dayNum);
              return toISODateStr(dateObj);
            },
            label: (ctxItem) => `Spending: ${formatCurrency(ctxItem.parsed.y)}`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Amount (₹)' } },
        x: { title: { display: true, text: 'Date' } }
      }
    }
  });
}

/////////////////////
// Tab wiring (UI) //
/////////////////////

// If page has .tab-btn elements, attach event listeners
document.querySelectorAll('.tab-btn')?.forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('section').forEach(sec => sec.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    if (tab && document.getElementById(tab)) document.getElementById(tab).classList.add('active');
  });
});

/////////////////////
// Edit modal hookup
/////////////////////

// If edit modal save button exists, hook it
if ($('edit-save-btn')) {
  $('edit-save-btn').addEventListener('click', saveEdit);
} else {
  // Some templates use direct inline onclick attributes; also attach safe global fn
  window.saveEdit = saveEdit;
  window.closeEditModal = closeEditModal;
}

// Expose functions to global scope (so HTML onclicks can call them if needed)
window.addSpend = addSpend;
window.showDaySpend = showDaySpend;
window.loadHistory = loadHistory;
window.downloadExcel = downloadExcel;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.deleteSpend = deleteSpend;
window.drawCharts = drawCharts;

// End of main.js
