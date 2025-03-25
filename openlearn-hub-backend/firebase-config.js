






import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDODk8Pq3lbgeEhdQfbtCVJbWYqapQxad4",
  authDomain: "openlearn-hub.firebaseapp.com",
  projectId: "openlearn-hub",
  storageBucket: "openlearn-hub.firebasestorage.app",
  messagingSenderId: "916886893773",
  appId: "1:916886893773:web:8e9bc74f9d19d39f212584"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
