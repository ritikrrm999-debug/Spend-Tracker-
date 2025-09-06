// Firebase config using environment variables
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

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
      document.getElementById('auth-section').style.display = 'none';
      document.getElementById('user-info').style.display = 'block';
      document.getElementById('user-email').innerText = userCredential.user.email;
    })
    .catch(error => {
      alert('Error: ' + error.message);
    });
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
  auth.signOut().then(() => {
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('user-info').style.display = 'none';
  });
});

// Track auth state
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('user-info').style.display = 'block';
    document.getElementById('user-email').innerText = user.email;
  } else {
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('user-info').style.display = 'none';
  }
});
