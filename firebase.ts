// 📄 firebase.ts

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth"; 
import { getFirestore } from "firebase/firestore"; 

// Your web app's Firebase configuration (يجب أن تكون هذه المعلومات صحيحة)
const firebaseConfig = {
  apiKey: "AIzaSyCHl5aMnANhKjo37pH454t2-N1Fdyk3tBQ",
  authDomain: "modelapp-production.firebaseapp.com",
  projectId: "modelapp-production",
  storageBucket: "modelapp-production.firebasestorage.app",
  messagingSenderId: "477353084689",
  appId: "1:477353084689:web:60423cb47bf62cbdce2eb0",
  measurementId: "G-80E2T96V0Z"
};

// 1. Initialize Firebase
const app = initializeApp(firebaseConfig);

// 2. Initialize and EXPORT services
export const auth = getAuth(app); // 👈 يجب أن تحتوي على export
export const db = getFirestore(app); // 👈 يجب أن تحتوي على export