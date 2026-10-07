/* ==========================================================
   firebase-config.js — inisialisasi Firebase (dipakai SEMUA file fb-*.js)
   Config Firebase memang boleh publik. Yang melindungi data = firestore.rules.
   Isi dari: Firebase Console > Project settings > Your apps > Web app > Config
   Versi SDK diatur di satu tempat ini saja (ganti angka versi di semua URL bila update).
   ========================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC1FvGyV-HDBxqdoFeStseySBlXlTDkVCM",
  authDomain: "riakata-0610.firebaseapp.com",
  projectId: "riakata-0610",
  storageBucket: "riakata-0610.firebasestorage.app",
  messagingSenderId: "151591115415",
  appId: "1:151591115415:web:57756efa3bf4ee4d6ee7d2",
  measurementId: "G-LCM6TKETYV"
};

/** false selama config masih berisi tulisan "ISI_..." */
export const isConfigured = !firebaseConfig.apiKey.startsWith("ISI_");

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// File lain cukup impor dari sini, tidak perlu menulis URL CDN lagi.
export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

export {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, startAfter, getDocs,
  writeBatch, serverTimestamp, Timestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
