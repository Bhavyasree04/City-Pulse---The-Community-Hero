import React, { useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Shield, User, Users, MapPin, Phone, Lock, Mail, Landmark, CheckCircle, ArrowRight, HelpCircle, Loader2 } from 'lucide-react';
import { UserRole, UserProfile } from '../types';

interface LoginProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [activeRole, setActiveRole] = useState<UserRole>('citizen');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  // Location Hierarchy for Authority / Volunteer profiles
  const [country, setCountry] = useState('India');
  const [state, setState] = useState('Maharashtra');
  const [district, setDistrict] = useState('Mumbai');
  const [area, setArea] = useState('Andheri West');

  // Status/Error States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Auto-fetch location on success to pre-configure browser coordinates
  const requestGeolocationOnLogin = (profile: UserProfile) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("GPS Location set:", position.coords.latitude, position.coords.longitude);
          onLoginSuccess(profile);
        },
        (err) => {
          console.warn("Geolocation denied, proceeding with manual setup:", err);
          onLoginSuccess(profile);
        },
        { timeout: 5000 }
      );
    } else {
      onLoginSuccess(profile);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    if (!email || !password) {
      setErrorMsg('Please fill in all mandatory fields.');
      setIsLoading(false);
      return;
    }

    try {
      if (isForgotPassword) {
        await sendPasswordResetEmail(auth, email);
        setSuccessMsg('Simulated reset email sent. In a live portal, citizens click the link to configure a new password.');
        setIsForgotPassword(false);
      } else if (isRegistering) {
        if (!fullName) {
          setErrorMsg('Full Name is required.');
          setIsLoading(false);
          return;
        }

        // 1. Create firebase user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Prepare user profile
        const userProfile: UserProfile = {
          uid: user.uid,
          email,
          fullName,
          role: activeRole,
          phone,
          createdAt: new Date().toISOString(),
          ...(activeRole !== 'citizen' ? { country, state, district, area } : {}),
        };

        // 3. Store profile in Firestore
        try {
          await setDoc(doc(db, 'users', user.uid), userProfile);
        } catch (fErr) {
          handleFirestoreError(fErr, OperationType.WRITE, `users/${user.uid}`);
        }
        setSuccessMsg('Registration successful! Launching secure session...');
        requestGeolocationOnLogin(userProfile);
      } else {
        // Sign In
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Fetch profile
        let userDoc;
        try {
          userDoc = await getDoc(doc(db, 'users', user.uid));
        } catch (fErr) {
          handleFirestoreError(fErr, OperationType.GET, `users/${user.uid}`);
        }
        if (userDoc.exists()) {
          const profile = userDoc.data() as UserProfile;
          
          // Verify role matches selected tab to prevent cross-portal access
          if (profile.role !== activeRole) {
            setErrorMsg(`This account is registered as a ${profile.role.toUpperCase()}. Please sign in on the correct tab.`);
            setIsLoading(false);
            return;
          }

          setSuccessMsg(`Welcome back, ${profile.fullName}!`);
          requestGeolocationOnLogin(profile);
        } else {
          // Fallback if document doesn't exist
          const fallbackProfile: UserProfile = {
            uid: user.uid,
            email: user.email || email,
            fullName: user.displayName || 'Anonymous Citizen',
            role: activeRole,
            createdAt: new Date().toISOString(),
          };
          try {
            await setDoc(doc(db, 'users', user.uid), fallbackProfile);
          } catch (fErr) {
            handleFirestoreError(fErr, OperationType.WRITE, `users/${user.uid}`);
          }
          requestGeolocationOnLogin(fallbackProfile);
        }
      }
    } catch (err: any) {
      if (err && err.code && err.code.startsWith('auth/')) {
        console.warn('Firebase Auth Warning:', err.code, err.message);
      } else {
        console.error(err);
      }
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMsg('Invalid email or password credentials.');
      } else if (err.code === 'auth/invalid-email') {
        setErrorMsg('Please enter a valid email address.');
      } else if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('This email address is already registered.');
      } else if (err.code === 'auth/weak-password') {
        setErrorMsg('Password should be at least 6 characters.');
      } else {
        setErrorMsg(err.message || 'An unexpected error occurred during authorization.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans">
      {/* Header Emblem */}
      <header className="bg-white border-b border-slate-200 py-4 px-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-1.5">
                COMMUNITY HERO - The City Pulse
                <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded uppercase tracking-wider">CIVIC PORTAL</span>
              </h1>
              <p className="text-xs text-gray-500">Government Municipal & Public Resolution Network</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-500">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span>Secure 256-bit SSL encrypted connection</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col lg:flex-row items-center justify-center gap-12">
        {/* Editorial Left Side */}
        <div className="w-full lg:w-1/2 space-y-6 max-w-lg lg:max-w-none text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">
            <Shield className="w-3.5 h-3.5" />
            Empowering Citizen-Municipal Collaboration
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
            Building Better Neighborhoods, <span className="text-indigo-600">Together.</span>
          </h2>
          <p className="text-gray-600 leading-relaxed text-sm md:text-base">
            Community Hero serves as the official administrative interface connecting residents directly to civic departments and local volunteers. Report infrastructure concerns, track resolution workflows, and help maintain civic standards in your township.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
              <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">AI-Powered Routing</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">Gemini instantly analyzes report severity and recommends specialized municipal departments.</p>
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
              <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">On-Site Verification</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">Enlisted volunteers perform physical checks to speed up administrative approvals.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Auth Card Right Side */}
        <div className="w-full lg:w-[480px] shrink-0">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            {/* Tab Selection */}
            {!isRegistering && !isForgotPassword && (
              <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 p-1.5 gap-1">
                <button
                  onClick={() => setActiveRole('citizen')}
                  className={`py-2.5 px-1 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                    activeRole === 'citizen'
                      ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-slate-100/50'
                  }`}
                >
                  <User className="w-4 h-4" />
                  Citizen Portal
                </button>
                <button
                  onClick={() => setActiveRole('volunteer')}
                  className={`py-2.5 px-1 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                    activeRole === 'volunteer'
                      ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-slate-100/50'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Volunteer Alliance
                </button>
                <button
                  onClick={() => setActiveRole('authority')}
                  className={`py-2.5 px-1 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                    activeRole === 'authority'
                      ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-slate-100/50'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Municipal Board
                </button>
              </div>
            )}

            <div className="p-6 md:p-8 space-y-6">
              {/* Form title based on role and mode */}
              <div className="text-center space-y-1.5">
                <h3 className="text-xl font-bold text-gray-900">
                  {isForgotPassword
                    ? 'Reset Secure Password'
                    : isRegistering
                    ? `Join as ${activeRole === 'citizen' ? 'Citizen' : activeRole === 'volunteer' ? 'Volunteer' : 'Authority'}`
                    : `Log In to ${activeRole === 'citizen' ? 'Citizen' : activeRole === 'volunteer' ? 'Volunteer' : 'Authority'} Portal`}
                </h3>
                <p className="text-xs text-gray-500">
                  {isForgotPassword
                    ? 'Enter your registered email to request a secure link.'
                    : activeRole === 'citizen'
                    ? 'Report civic hazards and track repair resolutions.'
                    : activeRole === 'volunteer'
                    ? 'Assist municipalities by verifying local reports.'
                    : 'Dispatch municipal work crews and audit workflows.'}
                </p>
              </div>

              {/* Status Notifications */}
              {errorMsg && (
                <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-xl font-medium">
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl font-medium">
                  {successMsg}
                </div>
              )}

              {/* Actual Authorization Form */}
              <form onSubmit={handleAuth} className="space-y-4 text-left">
                {isRegistering && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-gray-400" /> Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Inspector Rajendra Patil"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-gray-800"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-gray-400" /> Official Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. official@municipality.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-gray-800"
                  />
                </div>

                {!isForgotPassword && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-gray-400" /> Account Password *
                      </label>
                      {!isRegistering && (
                        <button
                          type="button"
                          onClick={() => setIsForgotPassword(true)}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-gray-800"
                    />
                  </div>
                )}

                {isRegistering && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-gray-400" /> Contact Mobile Number
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. +91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-gray-800"
                    />
                  </div>
                )}

                {/* Authority/Volunteer Hierarchical Jurisdiction (Only shown on signup) */}
                {isRegistering && activeRole !== 'citizen' && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2">
                    <h4 className="text-xs font-bold text-gray-700 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                      Configure Your Assigned Jurisdiction
                    </h4>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5 uppercase">Country</label>
                        <input
                          type="text"
                          required
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5 uppercase">State</label>
                        <input
                          type="text"
                          required
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5 uppercase">District / City</label>
                        <input
                          type="text"
                          required
                          value={district}
                          onChange={(e) => setDistrict(e.target.value)}
                          className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5 uppercase">Local Area / Sector</label>
                        <input
                          type="text"
                          required
                          value={area}
                          onChange={(e) => setArea(e.target.value)}
                          className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-4 text-sm disabled:bg-indigo-400 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing Authorization...
                    </>
                  ) : (
                    <>
                      {isForgotPassword ? 'Reset Password' : isRegistering ? 'Register Account' : 'Authenticate Credentials'}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Toggle register / login / forgot passwords */}
              <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                {isForgotPassword ? (
                  <button
                    onClick={() => {
                      setIsForgotPassword(false);
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                    className="text-indigo-600 font-semibold hover:underline cursor-pointer"
                  >
                    Back to Log In
                  </button>
                ) : (
                  <>
                    <span className="text-gray-500">
                      {isRegistering ? 'Already have an account?' : 'Need a municipal profile?'}
                    </span>
                    <button
                      onClick={() => {
                        setIsRegistering(!isRegistering);
                        setErrorMsg('');
                        setSuccessMsg('');
                      }}
                      className="text-indigo-600 font-semibold hover:underline cursor-pointer"
                    >
                      {isRegistering ? 'Log In Instead' : 'Register Profile'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Credentials */}
      <footer className="bg-slate-900 text-slate-400 py-6 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left space-y-1">
            <p className="font-bold text-slate-200">Community Hero © 2026. All Rights Reserved.</p>
            <p className="text-slate-500">Designated platform for verified municipal complaint routing & public civic transparency.</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hover:text-white transition-colors cursor-pointer">Security Standards</span>
            <span className="hover:text-white transition-colors cursor-pointer">Privacy Policy</span>
            <span className="hover:text-white transition-colors cursor-pointer font-bold text-indigo-400 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" /> Emergency Support: 112
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
