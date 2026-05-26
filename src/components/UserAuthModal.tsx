/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from './Toast';
import { X, User, LogIn, UserPlus, Eye, EyeOff, CheckCircle, AlertCircle, MapPin, Phone, Mail, Lock, ShoppingBag, ChevronRight, Package } from 'lucide-react';
import { Order } from '../types';

interface UserAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'signin' | 'signup';
}

export const UserAuthModal = ({ isOpen, onClose, defaultTab = 'signin' }: UserAuthModalProps) => {
  const { loginUser, loginWithGoogle, registerUser, resetUserPassword, sendPasswordOtp, verifyPasswordOtp, userProfile, logoutUser, isUserLoggedIn, updateUserProfile, adminSettings, orders, siteSettings, updateOrderStatus } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<'signin' | 'signup' | 'profile' | 'forgot'>(isUserLoggedIn ? 'profile' : defaultTab);
  const [fpEmail, setFpEmail] = useState('');
  const [fpOtp, setFpOtp] = useState('');
  const [fpNewPass, setFpNewPass] = useState('');
  const [fpConfPass, setFpConfPass] = useState('');
  const [fpStep, setFpStep] = useState<'email' | 'otp' | 'reset'>('email');
  const [fpVerifiedEmail, setFpVerifiedEmail] = useState('');
  const [profileTab, setProfileTab] = useState<'details' | 'orders'>('details');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [popStatus, setPopStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [cancelConfirmOrderId, setCancelConfirmOrderId] = useState<string | null>(null);
  // OTP resend countdown
  const [resendCountdown, setResendCountdown] = useState(0);
  const [wrongOtpAttempts, setWrongOtpAttempts] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sign in state
  const [siEmail, setSiEmail] = useState('');
  const [siPass, setSiPass] = useState('');

  // Sign up state
  const [suName, setSuName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPhone, setSuPhone] = useState('');
  const [suAddress, setSuAddress] = useState('');
  const [suCity, setSuCity] = useState('');
  const [suPass, setSuPass] = useState('');
  const [suPassConf, setSuPassConf] = useState('');

  // Profile edit state
  const [editName, setEditName] = useState(userProfile?.name || '');
  const [editPhone, setEditPhone] = useState(userProfile?.phone || '');
  const [editAddress, setEditAddress] = useState(userProfile?.address || '');
  const [editCity, setEditCity] = useState(userProfile?.city || '');

  React.useEffect(() => {
    if (isUserLoggedIn) {
      setTab('profile');
      setEditName(userProfile?.name || '');
      setEditPhone(userProfile?.phone || '');
      setEditAddress(userProfile?.address || '');
      setEditCity(userProfile?.city || '');
    } else {
      setTab(defaultTab);
    }
  }, [isUserLoggedIn, defaultTab, userProfile]);

  const showPop = (type: 'success' | 'error', msg: string) => {
    setPopStatus({ type, msg });
    setTimeout(() => setPopStatus(null), 3000);
  };

  const startResendCountdown = () => {
    setResendCountdown(60);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setResendCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await loginUser(siEmail, siPass);
      if (result.success) {
        showPop('success', result.message);
        setTimeout(onClose, 1500);
      } else {
        showPop('error', result.message);
      }
    } catch (err) {
      showPop('error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = fpEmail.trim().toLowerCase();
    if (!email) { showPop('error', 'Please enter your email address.'); return; }
    setLoading(true);
    const result = await sendPasswordOtp(email);
    setLoading(false);
    if (result.success) {
      setFpVerifiedEmail(email);
      setFpStep('otp');
      setWrongOtpAttempts(0);
      startResendCountdown();
      showPop('success', result.message);
    } else {
      showPop('error', result.message);
    }
  };

  const handleForgotVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const result = verifyPasswordOtp(fpVerifiedEmail, fpOtp);
    if (result.success) {
      setFpStep('reset');
      showPop('success', 'OTP verified! Set your new password.');
    } else {
      setWrongOtpAttempts(prev => prev + 1);
      showPop('error', result.message);
    }
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (fpNewPass !== fpConfPass) { showPop('error', 'Passwords do not match.'); return; }
    if (fpNewPass.length < 6) { showPop('error', 'Password must be at least 6 characters.'); return; }
    const result = resetUserPassword(fpVerifiedEmail, fpNewPass);
    if (result.success) {
      showPop('success', result.message);
      setTimeout(() => { setTab('signin'); setFpStep('email'); setFpEmail(''); setFpOtp(''); setFpNewPass(''); setFpConfPass(''); setFpVerifiedEmail(''); }, 2000);
    } else {
      showPop('error', result.message);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const result = await loginWithGoogle();
    setLoading(false);
    if (result.success) {
      showPop('success', result.message);
      setTimeout(onClose, 1200);
    } else {
      showPop('error', result.message);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (suPass !== suPassConf) { showPop('error', 'Passwords do not match.'); return; }
    if (suPass.length < 6) { showPop('error', 'Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const result = await registerUser(
        { name: suName, email: suEmail, phone: suPhone, address: suAddress, city: suCity },
        suPass
      );
      if (result.success) {
        showPop('success', result.message);
        setTimeout(onClose, 1500);
      } else {
        showPop('error', result.message);
      }
    } catch (err) {
      showPop('error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    updateUserProfile({ ...userProfile, name: editName, phone: editPhone, address: editAddress, city: editCity });
    showPop('success', 'Profile updated successfully!');
  };

  const handleLogout = () => {
    logoutUser();
    onClose();
    toast.success('Signed out successfully.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 px-6 pt-8 pb-12 text-white text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
            <X className="w-4 h-4" />
          </button>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
            {isUserLoggedIn ? <User className="w-8 h-8" /> : tab === 'signin' ? <LogIn className="w-8 h-8" /> : <UserPlus className="w-8 h-8" />}
          </div>
          <h2 className="text-xl font-black tracking-tight">
            {isUserLoggedIn ? 'My Account' : tab === 'signin' ? 'Welcome Back!' : 'Create Account'}
          </h2>
          <p className="text-emerald-100 text-xs mt-1">
            {isUserLoggedIn ? userProfile?.email : tab === 'signin' ? 'Sign in to auto-fill your orders' : 'Your info auto-fills at checkout'}
          </p>
        </div>

        {/* Tab switcher (non-logged in) */}
        {!isUserLoggedIn && (
          <div className="flex mx-6 -mt-5 rounded-2xl overflow-hidden shadow-lg border border-white z-10 relative bg-white">
            <button
              onClick={() => setTab('signin')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-1.5 ${tab === 'signin' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <LogIn className="w-3.5 h-3.5" /> Sign In
            </button>
            <button
              onClick={() => setTab('signup')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-1.5 ${tab === 'signup' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <UserPlus className="w-3.5 h-3.5" /> Sign Up
            </button>
          </div>
        )}

        {/* Status popup */}
        {popStatus && (
          <div className={`mx-6 mt-4 rounded-xl px-4 py-3 flex items-center gap-2.5 text-sm font-semibold animate-fade-in ${popStatus.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'}`}>
            {popStatus.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />}
            {popStatus.msg}
          </div>
        )}

        <div className="px-6 py-5 max-h-[65vh] overflow-y-auto">

          {/* SIGN IN FORM */}
          {!isUserLoggedIn && tab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input type="email" required value={siEmail} onChange={e => setSiEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input type={showPassword ? 'text' : 'password'} required value={siPass} onChange={e => setSiPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="text-right mt-1">
                  <button type="button" onClick={() => { setTab('forgot'); setFpStep('email'); setFpEmail(siEmail); }} className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold hover:underline">
                    Forgot password?
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl text-sm shadow-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <LogIn className="w-4 h-4" />}
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              {adminSettings?.googleSignInEnabled && (
                <>
                  {/* Divider */}
                  <div className="flex items-center gap-3 my-1">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">or</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  {/* Google Sign In */}
                  <button type="button" onClick={handleGoogleSignIn} disabled={loading}
                    className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold rounded-xl text-sm shadow-xs transition-all disabled:opacity-60 flex items-center justify-center gap-3 group">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Continue with Google</span>
                  </button>
                </>
              )}

              <p className="text-center text-xs text-slate-400">Don't have an account? <button type="button" onClick={() => setTab('signup')} className="text-emerald-600 font-bold hover:underline">Sign Up</button></p>
            </form>
          )}

          {/* FORGOT PASSWORD PANEL */}
          {!isUserLoggedIn && tab === 'forgot' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <button type="button" onClick={() => { setTab('signin'); setFpStep('email'); }} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
                <span className="text-xs font-bold uppercase text-slate-500">Reset Password</span>
              </div>

              {/* Step 1: Email */}
              {fpStep === 'email' && (
                <form onSubmit={handleForgotVerifyEmail} className="space-y-4">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-700">
                    <p className="font-bold mb-0.5">Enter your account email</p>
                    <p>We'll send a 6-digit OTP to verify it's you.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input type="email" required value={fpEmail} onChange={e => setFpEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                    </div>
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <Mail className="w-4 h-4" />}
                    {loading ? 'Sending OTP...' : 'Send OTP to Email'}
                  </button>
                  <p className="text-center text-xs text-slate-400">Remembered it? <button type="button" onClick={() => setTab('signin')} className="text-emerald-600 font-bold hover:underline">Sign In</button></p>
                </form>
              )}

              {/* Step 2: OTP verification */}
              {fpStep === 'otp' && (
                <form onSubmit={handleForgotVerifyOtp} className="space-y-4">
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] text-amber-700">
                    <p className="font-bold mb-0.5">Check your inbox</p>
                    <p>We sent a 6-digit OTP to <span className="font-mono font-bold">{fpVerifiedEmail}</span>. Enter it below.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">6-Digit OTP</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={fpOtp}
                      onChange={e => setFpOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xl font-mono font-bold text-center tracking-[0.5em] outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all"
                    />
                    {wrongOtpAttempts > 0 && (
                      <p className="text-[10px] text-rose-600 font-semibold mt-1 text-center">
                        {wrongOtpAttempts} incorrect attempt{wrongOtpAttempts !== 1 ? 's' : ''} · {Math.max(0, 5 - wrongOtpAttempts)} remaining
                      </p>
                    )}
                  </div>
                  <button type="submit"
                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl text-sm shadow-sm transition-all flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Verify OTP
                  </button>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <button type="button" onClick={() => setFpStep('email')} className="hover:text-slate-600">← Use different email</button>
                    <button type="button" disabled={loading || resendCountdown > 0} onClick={async () => {
                      setLoading(true);
                      const r = await sendPasswordOtp(fpVerifiedEmail);
                      setLoading(false);
                      if (r.success) { startResendCountdown(); setWrongOtpAttempts(0); }
                      showPop(r.success ? 'success' : 'error', r.message);
                    }} className="text-emerald-600 hover:text-emerald-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? 'Resending...' : resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend OTP'}
                    </button>
                  </div>
                </form>
              )}

              {/* Step 3: New password */}
              {fpStep === 'reset' && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-[11px] text-emerald-700">
                    <p className="font-bold mb-0.5">Identity verified ✓</p>
                    <p className="font-mono">{fpVerifiedEmail}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input type={showPassword ? 'text' : 'password'} required value={fpNewPass} onChange={e => setFpNewPass(e.target.value)}
                        placeholder="Min. 6 characters"
                        className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">Confirm New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input type={showPassword ? 'text' : 'password'} required value={fpConfPass} onChange={e => setFpConfPass(e.target.value)}
                        placeholder="Repeat new password"
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                    </div>
                  </div>
                  <button type="submit"
                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl text-sm shadow-sm transition-all flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Reset Password
                  </button>
                </form>
              )}
            </div>
          )}

          {/* SIGN UP FORM */}
          {!isUserLoggedIn && tab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input type="text" required value={suName} onChange={e => setSuName(e.target.value)} placeholder="Your full name"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input type="email" required value={suEmail} onChange={e => setSuEmail(e.target.value)} placeholder="you@example.com"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input type="tel" required value={suPhone} onChange={e => setSuPhone(e.target.value)} placeholder="+880 17XX XXX XXX"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Delivery Address</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input type="text" required value={suAddress} onChange={e => setSuAddress(e.target.value)} placeholder="Street address"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">City</label>
                  <input type="text" required value={suCity} onChange={e => setSuCity(e.target.value)} placeholder="Dhaka"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input type={showPassword ? 'text' : 'password'} required value={suPass} onChange={e => setSuPass(e.target.value)} placeholder="Min 6 characters"
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-slate-400">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Password strength indicator */}
                  {suPass.length > 0 && (() => {
                    const checks = [suPass.length >= 8, /[A-Z]/.test(suPass), /[0-9]/.test(suPass), /[^A-Za-z0-9]/.test(suPass)];
                    const score = checks.filter(Boolean).length;
                    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
                    const colors = ['', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-500'];
                    const textColors = ['', 'text-red-600', 'text-orange-500', 'text-yellow-600', 'text-emerald-600'];
                    return (
                      <div className="mt-1.5 space-y-1">
                        <div className="flex gap-1">
                          {[1,2,3,4].map(i => (
                            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= score ? colors[score] : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <p className={`text-[10px] font-bold ${textColors[score]}`}>{labels[score]}</p>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input type={showPassword ? 'text' : 'password'} required value={suPassConf} onChange={e => setSuPassConf(e.target.value)} placeholder="Repeat password"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                  </div>
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[10px] text-emerald-700 font-medium">
                💡 Your details auto-fill at checkout — no re-typing needed!
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl text-sm shadow-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {loading ? 'Creating account...' : 'Create Account'}
              </button>

              {adminSettings?.googleSignInEnabled && (
                <>
                  {/* Divider */}
                  <div className="flex items-center gap-3 my-1">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">or</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  {/* Google Sign Up */}
                  <button type="button" onClick={handleGoogleSignIn} disabled={loading}
                    className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold rounded-xl text-sm shadow-xs transition-all disabled:opacity-60 flex items-center justify-center gap-3">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Sign up with Google</span>
                  </button>
                </>
              )}

              <p className="text-center text-xs text-slate-400">Already have an account? <button type="button" onClick={() => setTab('signin')} className="text-emerald-600 font-bold hover:underline">Sign In</button></p>
            </form>
          )}

          {/* PROFILE VIEW */}
          {isUserLoggedIn && userProfile && (() => {
            const currencySymbol = siteSettings?.currencySymbol || '$';
            const currencyPosition = (siteSettings?.currencyPosition || 'before') as 'before' | 'after';
            const fmt = (n: number) => currencyPosition === 'before' ? `${currencySymbol}${n.toFixed(2)}` : `${n.toFixed(2)}${currencySymbol}`;
            const userOrders: Order[] = orders
              .filter(o => userProfile.orderIds?.includes(o.id) || o.email?.toLowerCase() === userProfile.email?.toLowerCase())
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            const statusColor: Record<string, string> = {
              Pending: 'bg-amber-100 text-amber-700', Processing: 'bg-blue-100 text-blue-700',
              Confirmed: 'bg-indigo-100 text-indigo-700', Shipped: 'bg-violet-100 text-violet-700',
              Delivered: 'bg-emerald-100 text-emerald-700', Cancelled: 'bg-rose-100 text-rose-700',
              Refunded: 'bg-slate-100 text-slate-600',
            };

            return (
            <div className="space-y-4">
              {/* Avatar */}
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center text-white font-black text-lg shadow">
                  {userProfile.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-slate-800">{userProfile.name}</div>
                  <div className="text-xs text-slate-500">{userProfile.email}</div>
                </div>
              </div>

              {/* Sub-tabs */}
              <div className="flex rounded-xl overflow-hidden border border-slate-200">
                <button onClick={() => setProfileTab('details')}
                  className={`flex-1 py-2 text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer ${profileTab === 'details' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                  <User className="w-3.5 h-3.5" /> Profile
                </button>
                <button onClick={() => setProfileTab('orders')}
                  className={`flex-1 py-2 text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer ${profileTab === 'orders' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                  <ShoppingBag className="w-3.5 h-3.5" /> Orders {userOrders.length > 0 && <span className="bg-white/30 text-current rounded-full px-1.5 py-0.5 text-[9px] font-black">{userOrders.length}</span>}
                </button>
              </div>

              {/* Profile details tab */}
              {profileTab === 'details' && (
                <form onSubmit={handleProfileSave} className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Edit Your Details</h4>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Name</label>
                    <input type="text" required value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Phone</label>
                    <input type="tel" required value={editPhone} onChange={e => setEditPhone(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Delivery Address</label>
                    <input type="text" required value={editAddress} onChange={e => setEditAddress(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">City</label>
                    <input type="text" required value={editCity} onChange={e => setEditCity(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
                  </div>
                  <button type="submit" className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all cursor-pointer">
                    Save Changes
                  </button>
                </form>
              )}

              {/* Orders history tab */}
              {profileTab === 'orders' && (
                <div className="space-y-3">
                  {userOrders.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto">
                        <Package size={20} className="text-slate-400" />
                      </div>
                      <p className="font-bold text-slate-600 text-sm">No orders yet</p>
                      <p className="text-xs text-slate-400">Your order history will appear here after you place an order.</p>
                    </div>
                  ) : (
                    userOrders.map(order => (
                      <div key={order.id} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                        {/* Cancel confirmation dialog */}
                        {cancelConfirmOrderId === order.id && (
                          <div className="bg-rose-50 border-b border-rose-200 px-3 py-2.5">
                            <p className="text-xs font-bold text-rose-800 mb-2">Cancel order <span className="font-mono">{order.orderNumber}</span>?</p>
                            <div className="flex gap-2">
                              <button
                                onClick={async () => {
                                  await updateOrderStatus(order.id, 'Cancelled');
                                  setCancelConfirmOrderId(null);
                                  showPop('success', `Order ${order.orderNumber} has been cancelled.`);
                                }}
                                className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                              >
                                Yes, Cancel
                              </button>
                              <button
                                onClick={() => setCancelConfirmOrderId(null)}
                                className="flex-1 py-1.5 bg-white border border-slate-200 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                Keep Order
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between px-3 py-2.5 bg-white border-b border-slate-100">
                          <div>
                            <p className="font-extrabold text-slate-800 text-xs">{order.orderNumber}</p>
                            <p className="text-[9px] text-slate-400">{new Date(order.createdAt).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusColor[order.orderStatus] || 'bg-slate-100 text-slate-600'}`}>
                              {order.orderStatus}
                            </span>
                            {order.orderStatus === 'Pending' && (
                              <button
                                onClick={() => setCancelConfirmOrderId(order.id)}
                                className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            )}
                            <button
                              onClick={() => { onClose(); window.location.href = `/tracker?order=${order.orderNumber}`; }}
                              className="text-emerald-600 hover:text-emerald-700 cursor-pointer"
                            >
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="px-3 py-2 flex items-center justify-between text-xs text-slate-600">
                          <span>{order.items.length} item{order.items.length !== 1 ? 's' : ''} · {order.paymentMethod}</span>
                          <span className="font-extrabold text-slate-900">{fmt(order.total)}</span>
                        </div>
                      </div>
                    ))
                  )}
                  {siteSettings?.orderTrackerEnabled !== false && (
                    <button
                      onClick={() => { onClose(); window.location.href = '/tracker'; }}
                      className="w-full py-2 border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl hover:bg-emerald-100 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Package size={13} /> Open Order Tracker
                    </button>
                  )}
                </div>
              )}

              <button onClick={handleLogout}
                className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold rounded-xl text-sm transition-all cursor-pointer">
                Sign Out
              </button>
            </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
