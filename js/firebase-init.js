import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCIE5btxALhG18hrxMYH64psim3f1QbPrM",
  authDomain: "game222-20b66.firebaseapp.com",
  projectId: "game222-20b66",
  storageBucket: "game222-20b66.firebasestorage.app",
  messagingSenderId: "438347009972",
  appId: "1:438347009972:web:9409a418e99cb4788cece1",
  measurementId: "G-JTKR5MRZRX",
};

const app = initializeApp(firebaseConfig);
window.REAE_FIREBASE_APP = app;

isSupported()
  .then((supported) => {
    if (supported) getAnalytics(app);
  })
  .catch((error) => console.warn("Firebase Analytics 初始化失敗：", error));
