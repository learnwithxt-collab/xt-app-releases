// XT Driver Training website: shows notifications (team alerts, new pupils
// offered, new XT email) when the XT tab or Home Screen app isn't open.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBphWpRkuIzWgIsfRiVKf5Zn5TvwwLc8Wo',
  authDomain: 'xt-driver-training.firebaseapp.com',
  projectId: 'xt-driver-training',
  storageBucket: 'xt-driver-training.firebasestorage.app',
  messagingSenderId: '209037268296',
  appId: '1:209037268296:web:00460636151143d8620f7d',
});

// Notifications sent with a title and text are shown by Firebase itself.
firebase.messaging();
