/* Firebase web config for the community tips feature.
   Get this from: Firebase console → Project settings → "Your apps" → SDK setup
   and configuration → Config. It is safe to commit (access is controlled by the
   Firestore security rules, not by hiding these values). Until projectId is
   filled in, the tips form and live tips are disabled gracefully. */
window.FIREBASE_CONFIG = {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
};
