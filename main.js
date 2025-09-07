// Firebase config (placeholders replaced by GitHub Actions secrets)
const firebaseConfig = {
  apiKey: "${FIREBASE_API_KEY}",
  authDomain: "${FIREBASE_AUTH_DOMAIN}",
  projectId: "${FIREBASE_PROJECT_ID}",
  storageBucket: "${FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${FIREBASE_MESSAGING_SENDER_ID}",
  appId: "${FIREBASE_APP_ID}"
};

// Init Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// ================== AUTH ==================
auth.onAuthStateChanged(user => {
  const path = window.location.pathname;
  if (user) {
    currentUser = user;
    if (path.includes("index.html")) window.location.href = "app.html";
    if (path.includes("app.html")) loadHistory();
  } else {
    currentUser = null;
    if (path.includes("app.html")) window.location.href = "index.html";
  }
});

if (document.getElementById("login-btn")) {
  document.getElementById("login-btn").addEventListener("click", () => {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    auth.signInWithEmailAndPassword(email, password).catch(err => alert(err.message));
  });
}

if (document.getElementById("signup-btn")) {
  document.getElementById("signup-btn").addEventListener("click", () => {
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;
    auth.createUserWithEmailAndPassword(email, password).catch(err => alert(err.message));
  });
}

if (document.getElementById("google-login")) {
  document.getElementById("google-login").addEventListener("click", () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => alert(err.message));
  });
}

if (document.getElementById("logout-btn")) {
  document.getElementById("logout-btn").addEventListener("click", () => {
    auth.signOut();
  });
}

// ================== FIRESTORE LOGIC ==================

// Add Spend
async function addSpend() {
  if (!currentUser) return;
  const date = document.getElementById("spendDate").value;
  const item = document.getElementById("spendItem").value.trim();
  const price = parseFloat(document.getElementById("spendPrice").value);
  if (!date || !item || isNaN(price)) return alert("Fill all fields");

  await db.collection("users").doc(currentUser.uid).collection("spends").add({
    date, item, price,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Saved!");
  document.getElementById("spendItem").value = "";
  document.getElementById("spendPrice").value = "";
  loadHistory();
}

// Show by Date
async function showDaySpend() {
  if (!currentUser) return;
  const date = document.getElementById("homeDate").value;
  const resultDiv = document.getElementById("homeResult");
  resultDiv.innerHTML = "";
  if (!date) return alert("Select a date");

  const snap = await db.collection("users").doc(currentUser.uid).collection("spends")
    .where("date", "==", date).get();

  let total = 0;
  snap.forEach(doc => {
    const e = doc.data();
    total += e.price;
    resultDiv.innerHTML += `<div class="list-item">${e.item} - ₹${e.price}</div>`;
  });
  resultDiv.innerHTML += `<div class="list-item"><b>Total: ₹${total}</b></div>`;
}

// History
async function loadHistory() {
  if (!currentUser) return;
  const snap = await db.collection("users").doc(currentUser.uid).collection("spends")
    .orderBy("createdAt", "desc").limit(5).get();
  const list = document.getElementById("historyList");
  if (!list) return;
  list.innerHTML = "";
  snap.forEach(doc => {
    const e = doc.data();
    list.innerHTML += `<div class="list-item">${e.date}: ${e.item} - ₹${e.price}</div>`;
  });
}

// Export Excel
async function downloadExcel() {
  if (!currentUser) return;
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;
  if (!from || !to) return alert("Select both dates");

  const snap = await db.collection("users").doc(currentUser.uid).collection("spends")
    .where("date", ">=", from).where("date", "<=", to).orderBy("date").get();

  let data = [];
  snap.forEach(doc => data.push(doc.data()));
  if (data.length === 0) return alert("No records found");

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Spends");
  XLSX.writeFile(wb, `Spends_${from}_to_${to}.xlsx`);
}

// Tabs
document.querySelectorAll('.tab-btn')?.forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('section').forEach(sec => sec.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});
