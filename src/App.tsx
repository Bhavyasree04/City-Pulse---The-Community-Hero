import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Landmark, Loader2, ShieldAlert } from 'lucide-react';
import { UserProfile } from './types';
import Login from './components/Login';
import CitizenDashboard from './components/CitizenDashboard';
import VolunteerDashboard from './components/VolunteerDashboard';
import AuthorityDashboard from './components/AuthorityDashboard';

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // 1. Subscribe to Firebase Auth state updates
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setErrorMsg('');
      if (firebaseUser) {
        try {
          // 2. Retrieve supplementary profile from Firestore
          const docRef = doc(db, 'users', firebaseUser.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          } else {
            // Safe fallback profile if doc hasn't propagated
            setUserProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              fullName: firebaseUser.displayName || 'Authorized Resident',
              role: 'citizen',
              createdAt: new Date().toISOString(),
            });
          }
        } catch (err: any) {
          console.error("Failed to synchronise user record from Firestore:", err);
          setErrorMsg("Failed to synchronize your profile details from our secure server. Retrying...");
          handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUserProfile(null);
    } catch (err) {
      console.error("Error standardizing logout sequence:", err);
    } finally {
      setLoading(false);
    }
  };

  // 1. LOADING SCREEN
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg animate-pulse">
            <Landmark className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-sm font-black tracking-widest text-slate-800 uppercase">COMMUNITY HERO</h2>
            <p className="text-xs text-slate-400">Synchronising secure sessions...</p>
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-blue-600 mx-auto" />
        </div>
      </div>
    );
  }

  // 2. ERROR STATE (E.g. firestore rule blocker)
  if (errorMsg) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md bg-white border border-rose-100 p-6 rounded-2xl shadow-md text-center space-y-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 text-center">
            <h3 className="text-sm font-bold text-gray-900">Security Synchronization Warning</h3>
            <p className="text-xs text-gray-500">{errorMsg}</p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            Force Sync Page
          </button>
        </div>
      </div>
    );
  }

  // 3. SECURELY ROUTE BY ROLE
  if (!userProfile) {
    return <Login onLoginSuccess={(profile) => setUserProfile(profile)} />;
  }

  switch (userProfile.role) {
    case 'citizen':
      return <CitizenDashboard user={userProfile} onLogout={handleLogout} />;
    case 'volunteer':
      return <VolunteerDashboard user={userProfile} onLogout={handleLogout} />;
    case 'authority':
      return <AuthorityDashboard user={userProfile} onLogout={handleLogout} />;
    default:
      return <Login onLoginSuccess={(profile) => setUserProfile(profile)} />;
  }
}
