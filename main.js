// Firebase config (placeholders will be replaced by GitHub Actions secrets)
const firebaseConfig = {
  apiKey: "${FIREBASE_API_KEY}",
  authDomain: "${FIREBASE_AUTH_DOMAIN}",
  projectId: "${FIREBASE_PROJECT_ID}",
  storageBucket: "${FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${FIREBASE_MESSAGING_SENDER_ID}",
  appId: "${FIREBASE_APP_ID}"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// Show/hide sections
function showSection(section) {
  alert("Switching to " + section + " section (UI coming soon)");
}

// Toggle Login / Signup popup
document.getElementById('show-login').addEventListener('click', () => {
  document.getElementById('login-popup').classList.toggle('hidden');
  document.getElementById('signup-popup').classList.add('hidden');
});

document.getElementById('show-signup').addEventListener('click', () => {
  document.getElementById('signup-popup').classList.toggle('hidden');
  document.getElementById('login-popup').classList.add('hidden');
});

// Sign Up
document.getElementById('signup-btn').addEventListener('click', () => {
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;

  auth.createUserWithEmailAndPassword(email, password)
    .then(userCredential => {
      alert('Sign up successful!');
    })
    .catch(error => {
      alert('Error: ' + error.message);
    });
});

// Login
document.getElementById('login-btn').addEventListener('click', () => {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  auth.signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      alert('Login successful!');
    })
    .catch(error => {
      alert('Error: ' + error.message);
    });
});

// Google Login
document.getElementById('google-login').addEventListener('click', () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(result => {
      alert("Signed in as " + result.user.email);
    })
    .catch(error => {
      alert('Error: ' + error.message);
    });
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
  auth.signOut().then(() => {
    alert("Logged out!");
  });
});

// Track auth state
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('user-info').classList.remove('hidden');
    document.getElementById('logout-btn').classList.remove('hidden');
    document.getElementById('user-email').innerText = user.email;
  } else {
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('user-info').classList.add('hidden');
    document.getElementById('logout-btn').classList.add('hidden');
  }
});
