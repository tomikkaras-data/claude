// Přihlášení přes Google používá Firebase (Authentication + Firestore).
// 1) Vytvoř projekt na https://console.firebase.google.com
// 2) Authentication → Sign-in method → zapni „Google“
// 3) Firestore Database → vytvoř databázi (pravidla viz README)
// 4) Project settings → Your apps → Web app → zkopíruj konfiguraci sem.
// Dokud je apiKey prázdný, funguje jen hra za hosta.
window.FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  appId: '',
};
