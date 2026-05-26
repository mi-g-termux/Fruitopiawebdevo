/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fruitopia — Adaptive State Hub (AppContext.tsx)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT'S NEW IN THIS VERSION
 * ──────────────────────────
 * 1. `databaseEngine` state — tracks the currently active backend
 *    ('local' | 'firebase' | 'supabase') and exposes it to all consumers.
 *
 * 2. `switchDatabaseEngine(engine, credentials)` — the admin-facing action
 *    that hot-swaps the backend without a page reload.  It:
 *      a. Calls `switchActiveDatabaseEngine` from db.ts
 *      b. Tears down old real-time listeners
 *      c. Attaches new real-time listeners for the chosen engine
 *      d. Reloads all data from the new backend
 *      e. Returns a { success, message } result for toast feedback
 *
 * 3. Listener lifecycle management — all active Firebase / Supabase real-time
 *    subscriptions are tracked in module-level refs.  `_destroyAllListeners()`
 *    unsubscribes everything before mounting new ones, preventing memory leaks.
 *
 * 4. `reinitializeFirebase` is retained for backward compatibility with
 *    AdminPanel's existing Firebase section and switches the engine to
 *    'firebase' on success.
 *
 * CHANGES IN THIS REVISION
 * ────────────────────────
 * C1. Firebase Auth sign-in on admin login — after credentials pass, attempts
 *     signInWithEmailAndPassword / createUserWithEmailAndPassword using a
 *     synthetic <username>@fruitopia-admin.internal address.  Failure only
 *     warns — local credentials still work.
 *
 * C2. Firebase Auth sign-out on admin logout — fbSignOut(auth) is called
 *     before clearing the local session.
 *
 * C3. `refreshOrders` — re-fetches orders from the active backend and pushes
 *     them into state.  Exposed on the context type and value.
 *
 * C4. `isFirebaseReady` is now driven by both useState(getIsFirebaseConfigured)
 *     AND a dedicated useEffect that subscribes to onFirebaseReadyChange, so
 *     it updates reactively even when Firebase boots asynchronously after mount.
 *
 * C5. `activeDbEngine` — convenience alias for getActiveEngine() exposed on
 *     the context so consumers can read the raw string without importing db.ts.
 *
 * EXISTING LOGIC UNCHANGED: all cart ops, OTP flows, user auth, email
 * verification, coupon logic, delivery zones, and BroadcastChannel sync
 * are preserved verbatim.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  Product,
  Category,
  Order,
  Coupon,
  NewsletterSubscriber,
  Review,
  SiteSettings,
  SMTPSettings,
  PaymentSettings,
  AdminCredentials,
  SupportSettings,
  CartItem,
  UserProfile,
  SMSSettings,
  EmailVerificationSettings,
  DeliveryZone,
  DatabaseEngine,
  EngineCredentials,
} from '../types';
import {
  dbService,
  DEFAULT_SITE_SETTINGS,
  DEFAULT_SMTP_SETTINGS,
  DEFAULT_PAYMENT_SETTINGS,
  DEFAULT_ADMIN_CREDENTIALS,
  DEFAULT_SUPPORT_SETTINGS,
  DEFAULT_SMS_SETTINGS,
  DEFAULT_EMAIL_VERIFICATION_SETTINGS,
  DEFAULT_PRODUCTS,
  DEFAULT_CATEGORIES,
  DEFAULT_COUPONS,
  DEFAULT_REVIEWS,
  getCurrentUserProfile,
  saveUserProfile,
  setCurrentUserSession,
  getUserProfiles,
  simpleHash,
  getDeliveryZones,
  saveDeliveryZones,
  switchActiveDatabaseEngine,
  getActiveEngine,
  onEngineChange,
  saveUserToFirestore,
  getUserByEmailFromFirestore,
} from '../db';
import {
  reinitializeDynamicFirebase,
  onFirebaseReadyChange,
  getIsFirebaseConfigured,
  FirebaseRuntimeConfig,
  auth,
  getDb,
} from '../firebase';
import {
  collection,
  writeBatch,
  doc,
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
} from 'firebase/auth';
import {
  onSupabaseReadyChange,
  onSupabaseSettingsChange,
} from '../supabase';

// ─────────────────────────────────────────────────────────────────────────────
//  CONTEXT TYPE DEFINITION
// ─────────────────────────────────────────────────────────────────────────────

interface AppContextType {
  // Data collections
  products: Product[];
  categories: Category[];
  orders: Order[];
  coupons: Coupon[];
  newsletterSubscribers: NewsletterSubscriber[];
  reviews: Review[];
  siteSettings: SiteSettings;
  smtpSettings: SMTPSettings;
  paymentSettings: PaymentSettings;
  adminSettings: AdminCredentials;
  supportSettings: SupportSettings;
  smsSettings: SMSSettings;
  emailVerificationSettings: EmailVerificationSettings;
  cart: CartItem[];
  appliedCoupon: Coupon | null;
  isAdminLoggedIn: boolean;
  isLoading: boolean;

  // ── NEW: Polymorphic engine API ────────────────────────────────────────────
  /** Currently active database engine */
  databaseEngine: DatabaseEngine;
  /** Hot-swap the backend engine. Returns { success, message } for toast feedback. */
  switchDatabaseEngine: (
    engine: DatabaseEngine,
    credentials: EngineCredentials,
  ) => Promise<{ success: boolean; message: string }>;

  // Product actions
  addProduct: (product: Product) => Promise<void>;
  editProduct: (product: Product) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  updateProductStock: (productId: string, newStock: number) => Promise<void>;

  // Category actions
  addCategory: (category: Category) => Promise<void>;
  editCategory: (category: Category) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;

  // Order actions
  placeOrder: (orderData: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'orderStatus' | 'paymentStatus'>) => Promise<Order>;
  updateOrderStatus: (orderId: string, status: Order['orderStatus']) => Promise<void>;
  updateOrderPaymentStatus: (orderId: string, status: Order['paymentStatus']) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
  editOrderNumber: (orderId: string, newNumber: string) => Promise<void>;
  /** C3: Re-fetch orders from the active backend and push into state. */
  refreshOrders: () => Promise<void>;

  // Coupon actions
  addCoupon: (coupon: Coupon) => Promise<void>;
  deleteCoupon: (couponId: string) => Promise<void>;

  // Newsletter actions
  subscribeNewsletter: (email: string) => Promise<{ success: boolean; message: string }>;
  deleteSubscriber: (id: string) => Promise<void>;

  // Review actions
  addReview: (productId: string, name: string, rating: number, comment: string) => Promise<void>;
  approveReview: (reviewId: string, approve: boolean) => Promise<void>;
  deleteReview: (reviewId: string) => Promise<void>;

  // Settings savers
  saveSiteSettings: (settings: SiteSettings) => Promise<void>;
  saveSMTPSettings: (settings: SMTPSettings) => Promise<void>;
  savePaymentSettings: (settings: PaymentSettings) => Promise<void>;
  saveAdminSettings: (settings: AdminCredentials) => Promise<void>;
  saveSupportSettings: (settings: SupportSettings) => Promise<void>;
  saveSMSSettings: (settings: SMSSettings) => Promise<void>;
  saveEmailVerificationSettings: (settings: EmailVerificationSettings) => Promise<void>;

  // OTP / verification
  sendSmsOtp: (phone: string, email: string) => Promise<{ success: boolean; message: string }>;
  verifySmsOtp: (phone: string, otp: string) => { success: boolean; message: string };
  sendEmailVerification: (email: string) => Promise<{ success: boolean; message: string }>;
  verifyEmailToken: (email: string, token: string) => { success: boolean; message: string };
  isEmailVerified: (email: string) => boolean;

  // Delivery zones
  deliveryZones: DeliveryZone[];
  getZoneForCity: (city: string) => DeliveryZone;
  saveDeliveryZonesCtx: (zones: DeliveryZone[]) => Promise<void>;

  // Cart actions
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  applyCouponCode: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;

  // Admin auth
  setAdminLoggedIn: (loggedIn: boolean) => void;
  triggerTawkToLoader: () => void;

  // User state
  currentUserEmail: string | null;
  setCurrentUserEmail: (email: string) => void;
  formatPrice: (amount: number) => string;

  // Firebase (retained for backward compat with existing AdminPanel code)
  /** C4: Reactive — updates whenever Firebase boots or is reconfigured. */
  isFirebaseReady: boolean;
  reinitializeFirebase: (config: FirebaseRuntimeConfig) => Promise<{ success: boolean; message: string }>;

  // C5: Raw active engine string for consumers that don't want to import db.ts
  activeDbEngine: string;

  // User auth
  userProfile: UserProfile | null;
  isUserLoggedIn: boolean;
  loginUser: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; message: string }>;
  registerUser: (profile: UserProfile, password: string) => Promise<{ success: boolean; message: string }>;
  resetUserPassword: (email: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  sendPasswordOtp: (email: string) => Promise<{ success: boolean; message: string }>;
  verifyPasswordOtp: (email: string, otp: string) => { success: boolean; message: string };
  logoutUser: () => void;
  updateUserProfile: (profile: UserProfile) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
//  APP PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

export const AppProvider = ({ children }: { children: React.ReactNode }) => {

  // ── Data state ─────────────────────────────────────────────────────────────
  const [products, setProducts]         = useState<Product[]>([]);
  const [categories, setCategories]     = useState<Category[]>([]);
  const [orders, setOrders]             = useState<Order[]>([]);
  const [coupons, setCoupons]           = useState<Coupon[]>([]);
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [reviews, setReviews]           = useState<Review[]>([]);
  const [smtpSettings, setSmtpSettings] = useState<SMTPSettings | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [adminSettings, setAdminSettings]     = useState<AdminCredentials>(() => {
    // Hydrate immediately from localStorage so the login form never falls back
    // to DEFAULT_ADMIN_CREDENTIALS while loadData() is still in flight.
    try {
      const raw = localStorage.getItem('qf_adminSettings');
      if (raw) {
        const parsed: AdminCredentials = JSON.parse(raw);
        if (parsed?.username && parsed?.password) return parsed;
      }
    } catch { /* ignore */ }
    return DEFAULT_ADMIN_CREDENTIALS;
  });
  const [supportSettings, setSupportSettings] = useState<SupportSettings | null>(null);
  const [smsSettings, setSMSSettings]         = useState<SMSSettings | null>(null);
  const [emailVerificationSettings, setEmailVerificationSettings] = useState<EmailVerificationSettings | null>(null);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>(() => getDeliveryZones());

  const [cart, setCart] = useState<CartItem[]>(() => {
    try { const s = localStorage.getItem('qf_cart'); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    try {
      const s = JSON.parse(localStorage.getItem('qf_admin_session') || 'null');
      return !!(s?.token && s?.expiresAt && Date.now() < s.expiresAt);
    } catch { return false; }
  });

  const [currentUserEmail, setCurrentUserEmailState] = useState<string | null>(() =>
    localStorage.getItem('qf_user_email') || null,
  );
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(() => getCurrentUserProfile());

  // Pre-load siteSettings synchronously from localStorage so settings are
  // available instantly on page load (before any cloud backend responds).
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(() => {
    try { const c = localStorage.getItem('qf_siteSettings'); return c ? JSON.parse(c) : null; }
    catch { return null; }
  });

  // Only show the loading spinner if we have NO cached settings at all
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    try { return !localStorage.getItem('qf_siteSettings'); } catch { return true; }
  });

  // ── Database engine state ──────────────────────────────────────────────────
  /**
   * `databaseEngine` reflects the CURRENTLY ACTIVE and CONNECTED engine.
   * It is initialised from localStorage on mount and updated whenever
   * `switchDatabaseEngine` completes successfully.
   */
  const [databaseEngine, setDatabaseEngine] = useState<DatabaseEngine>(() => getActiveEngine());

  // ── C4: Firebase ready state — reactive via onFirebaseReadyChange ──────────
  const [isFirebaseReady, setIsFirebaseReady] = useState<boolean>(() => getIsFirebaseConfigured());

  // C4: Subscribe to Firebase boot/reconfigure events so isFirebaseReady
  // updates even when Firebase initialises asynchronously after mount.
  useEffect(() => {
    return onFirebaseReadyChange((ready) => setIsFirebaseReady(ready));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  //  LISTENER LIFECYCLE MANAGEMENT
  //  We track all active unsubscribe functions so we can tear them all down
  //  cleanly before mounting listeners for a new engine.
  // ─────────────────────────────────────────────────────────────────────────

  /** Holds all active unsubscribe / cleanup functions for real-time listeners */
  const activeListenersRef = useRef<Array<() => void>>([]);

  /** Tear down every active listener immediately */
  const _destroyAllListeners = () => {
    activeListenersRef.current.forEach((unsub) => {
      try { unsub(); } catch { /* ignore */ }
    });
    activeListenersRef.current = [];
    console.log('[AppContext] All real-time listeners destroyed.');
  };

  /**
   * Attach a Firestore `onSnapshot` listener for siteSettings.
   * When the document changes, update React state so currency and other
   * settings broadcast instantly to all browser clients.
   */
  const _attachFirebaseSettingsListener = async () => {
    try {
      const { db } = await import('../firebase');
      if (!db) return;
      const { doc, onSnapshot } = await import('firebase/firestore');
      const unsub = onSnapshot(
        doc(db, 'settings', 'siteSettings'),
        (snap) => {
          if (snap.exists()) {
            // Firestore is always source of truth — kill stale localStorage cache
            try { localStorage.removeItem('qf_siteSettings'); } catch {}
            const updated = snap.data() as SiteSettings;
            setSiteSettings({ ...DEFAULT_SITE_SETTINGS, ...updated });
          }
        },
        (err) => console.warn('[Firebase onSnapshot] siteSettings error:', err),
      );
      activeListenersRef.current.push(unsub);
      console.log('[AppContext] Firebase siteSettings listener attached.');
    } catch (err) {
      console.warn('[AppContext] Firebase listener setup failed:', err);
    }
  };

  /**
   * Attach Firestore onSnapshot listeners for products and categories.
   * Pushes live data into React state and updates localStorage cache on every change.
   */
  const _attachFirebaseCatalogListeners = async () => {
    try {
      const { db } = await import('../firebase');
      if (!db) return;
      const { collection, onSnapshot } = await import('firebase/firestore');
      // Products listener
      const unsubProducts = onSnapshot(
        collection(db, 'products'),
        (snap) => {
          const list: import('../types').Product[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as import('../types').Product));
          setProducts(list);
          try { localStorage.setItem('qf_products', JSON.stringify(list)); } catch {}
          console.log('[AppContext] Firebase products live update:', list.length, 'items');
        },
        (err) => console.warn('[Firebase onSnapshot] products error:', err),
      );
      activeListenersRef.current.push(unsubProducts);
      // Categories listener
      const unsubCategories = onSnapshot(
        collection(db, 'categories'),
        (snap) => {
          const list: import('../types').Category[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as import('../types').Category));
          setCategories(list);
          try { localStorage.setItem('qf_categories', JSON.stringify(list)); } catch {}
          console.log('[AppContext] Firebase categories live update:', list.length, 'items');
        },
        (err) => console.warn('[Firebase onSnapshot] categories error:', err),
      );
      activeListenersRef.current.push(unsubCategories);
      console.log('[AppContext] Firebase catalog listeners attached.');
    } catch (err) {
      console.warn('[AppContext] Firebase catalog listener setup failed:', err);
    }
  };

  /**
   * Attach a Supabase Realtime listener for siteSettings changes.
   * The `onSupabaseSettingsChange` callback fires whenever the `settings`
   * table row with key='siteSettings' is updated via postgres_changes.
   */
  const _attachSupabaseSettingsListener = () => {
    const unsub = onSupabaseSettingsChange((newRow: Partial<SiteSettings>) => {
      if (newRow) {
        setSiteSettings((prev) => ({ ...DEFAULT_SITE_SETTINGS, ...(prev || {}), ...newRow }));
        console.log('[AppContext] Supabase siteSettings real-time update received.');
      }
    });
    activeListenersRef.current.push(unsub);
    console.log('[AppContext] Supabase siteSettings listener attached.');
  };

  /**
   * Mount the appropriate real-time listeners for a given engine.
   * Always calls `_destroyAllListeners` first to prevent double-subscription.
   */
  const _mountListenersForEngine = async (engine: DatabaseEngine) => {
    _destroyAllListeners();
    if (engine === 'firebase' && getIsFirebaseConfigured()) {
      await _attachFirebaseSettingsListener();
      await _attachFirebaseCatalogListeners();
    } else if (engine === 'supabase') {
      _attachSupabaseSettingsListener();
    }
    // 'local' engine: no real-time listeners needed; BroadcastChannel handles cross-tab sync
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  FIREBASE / SUPABASE READY LISTENERS + ENGINE-CHANGE REGISTRY
  //  Note: the dedicated C4 useEffect above handles isFirebaseReady updates.
  //  This effect handles data reloads and listener remounting on ready events.
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Firebase ready-state changes — reload data and remount listeners
    const unsubFb = onFirebaseReadyChange((ready) => {
      if (ready && databaseEngine === 'firebase') {
        console.log('[AppContext] Firebase is now live — reloading data...');
        loadData();
        _mountListenersForEngine('firebase');
      }
    });

    // Supabase ready-state changes
    const unsubSb = onSupabaseReadyChange((ready) => {
      if (ready && databaseEngine === 'supabase') {
        console.log('[AppContext] Supabase is now live — reloading data...');
        loadData();
        _mountListenersForEngine('supabase');
      }
    });

    // Engine change events emitted by switchActiveDatabaseEngine in db.ts
    const unsubEngine = onEngineChange((newEngine) => {
      setDatabaseEngine(newEngine);
    });

    return () => {
      unsubFb();
      unsubSb();
      unsubEngine();
      _destroyAllListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  //  DATA LOADING
  // ─────────────────────────────────────────────────────────────────────────

  async function loadData() {
    try {
      const [
        prods, cats, ords, coups, subs, revs,
        site, smtp, pay, adm, supp, smsSet, evSet,
      ] = await Promise.all([
        dbService.getProducts(),
        dbService.getCategories(),
        dbService.getOrders(),
        dbService.getCoupons(),
        dbService.getNewsletterSubscribers(),
        dbService.getReviews(),
        dbService.getSiteSettings(),
        dbService.getSMTPSettings(),
        dbService.getPaymentSettings(),
        dbService.getAdminSettings(),
        dbService.getSupportSettings(),
        dbService.getSMSSettings(),
        dbService.getEmailVerificationSettings(),
      ]);
      setProducts(prods);
      setCategories(cats);
      setOrders(ords);
      setCoupons(coups);
      setNewsletterSubscribers(subs);
      setReviews(revs);
      setSiteSettings(site);
      setSmtpSettings(smtp);
      setPaymentSettings(pay);
      setAdminSettings(adm);
      setSupportSettings(supp);
      setSMSSettings(smsSet);
      setEmailVerificationSettings(evSet);
    } catch (err) {
      console.error('[AppContext] Critical error in loadData:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Mount: initial data load + attach listeners for the persisted engine
  useEffect(() => {
    loadData();
    // Attach listeners for whatever engine was persisted at startup
    const engine = getActiveEngine();
    if (engine !== 'local') {
      _mountListenersForEngine(engine);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Silent Firebase Auth re-sign-in on page refresh ───────────────────────
  // Problem: admin has a valid localStorage session (isAdminLoggedIn=true) but
  // Firebase Auth token is gone after refresh. Firestore rules require a valid
  // Firebase Auth token (isAdmin() check), so every write fails with
  // PERMISSION_DENIED until the admin logs out and back in.
  // Fix: whenever Firebase becomes ready (on boot or reinit), if admin has a
  // valid session, silently re-sign-in to Firebase Auth.
  useEffect(() => {
    async function reAuthIfNeeded() {
      const currentAuth = auth; // read current module-level auth
      if (!currentAuth) return;

      // Check if Firebase Auth already has a current user (persisted across
      // refreshes via Firebase's own IndexedDB persistence)
      if (currentAuth.currentUser) return; // already signed in, nothing to do

      try {
        const session = JSON.parse(localStorage.getItem('qf_admin_session') || 'null');
        const username = localStorage.getItem('qf_admin_username');
        if (session?.token && session?.expiresAt && Date.now() < session.expiresAt && username) {
          const adminEmail = username + '@fruitopia-admin.internal';
          const stablePassword = 'ftp_' + btoa(adminEmail).replace(/[^a-zA-Z0-9]/g, '') + '_auth';
          await signInWithEmailAndPassword(currentAuth, adminEmail, stablePassword).catch((e) => {
            console.warn('[Auth] Silent re-auth failed:', e?.code);
            // Session is stale — clear it so admin gets redirected to login
            setIsAdminLoggedIn(false);
            try { localStorage.removeItem('qf_admin_session'); } catch {}
            try { localStorage.removeItem('qf_admin_username'); } catch {}
          });
        }
      } catch { /* ignore */ }
    }

    // Run immediately in case Firebase is already ready on mount
    reAuthIfNeeded();

    // Also re-run whenever Firebase reinitializes (config change, etc.)
    const unsubscribe = onFirebaseReadyChange((ready) => {
      if (ready) reAuthIfNeeded();
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  //  C3: refreshOrders
  //  Re-fetches orders from the active backend and updates React state.
  // ─────────────────────────────────────────────────────────────────────────

  const refreshOrders = async (): Promise<void> => {
    const fresh = await dbService.getOrders();
    setOrders(fresh);
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  POLYMORPHIC ENGINE SWITCHER
  //  The primary new action exposed to AdminPanel.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Hot-swap the active database engine.
   *
   * Steps:
   *  1. Call `switchActiveDatabaseEngine` in db.ts — handles credential
   *     validation, driver boot, fallback, and localStorage persistence.
   *  2. Update React state with the resulting active engine.
   *  3. Destroy old listeners, mount new ones for the new engine.
   *  4. Reload all data from the new backend.
   *  5. Return { success, message } for toast feedback in AdminPanel.
   */
  const switchDatabaseEngine = useCallback(
    async (
      engine: DatabaseEngine,
      credentials: EngineCredentials,
    ): Promise<{ success: boolean; message: string }> => {
      console.log(`[AppContext] Switching engine → ${engine}`);

      const result = await switchActiveDatabaseEngine(engine, credentials);

      // Update the reactive engine state regardless (result.activeEngine reflects fallback)
      setDatabaseEngine(result.activeEngine);

      // Keep isFirebaseReady in sync
      if (result.activeEngine === 'firebase') {
        setIsFirebaseReady(getIsFirebaseConfigured());
      }

      // Tear down old listeners and attach new ones for the resolved engine
      await _mountListenersForEngine(result.activeEngine);

      // ── AUTO-SEED: If Firebase is empty, upload default products/categories ──
      // This handles the case where admin connects Firebase after initial local
      // setup — the Firebase DB is blank so we seed it with defaults automatically.
      if (result.success && result.activeEngine === 'firebase') {
        try {
          const [existingProducts, existingCategories] = await Promise.all([
            dbService.getProducts(),
            dbService.getCategories(),
          ]);
          const firebaseIsEmpty =
            existingProducts.length === 0 && existingCategories.length === 0;
          if (firebaseIsEmpty) {
            console.log('[AppContext] Firebase is empty — seeding default store data...');
            const database = getDb();
            if (database) {
              const batch = writeBatch(database);
              for (const p of DEFAULT_PRODUCTS)
                batch.set(doc(database, 'products', p.id), p);
              for (const c of DEFAULT_CATEGORIES)
                batch.set(doc(database, 'categories', c.id), c);
              for (const c of DEFAULT_COUPONS)
                batch.set(doc(database, 'coupons', c.id), c);
              for (const r of DEFAULT_REVIEWS)
                batch.set(doc(database, 'reviews', r.id), r);
              await batch.commit();
              console.log('[AppContext] Default store data seeded to Firebase successfully.');
            }
          }
        } catch (seedErr) {
          console.warn('[AppContext] Auto-seed to Firebase failed (non-fatal):', seedErr);
        }
      }

      // Reload data from the new backend (picks up seeded data if applicable)
     await loadData();
setProducts([...products]);

      return { success: result.success, message: result.message };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  USER AUTH (unchanged from original)
  // ─────────────────────────────────────────────────────────────────────────

  const setCurrentUserEmail = (email: string) => {
    const normalized = email.trim().toLowerCase();
    localStorage.setItem('qf_user_email', normalized);
    setCurrentUserEmailState(normalized);
  };

  const loginUser = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    const hash = simpleHash(password);
    // Try Firestore first
    try {
      const firestoreProfile = await getUserByEmailFromFirestore(email);
      if (firestoreProfile) {
        if (firestoreProfile.passwordHash !== hash) return { success: false, message: 'Incorrect password.' };
        saveUserProfile(firestoreProfile); // refresh cache
        setCurrentUserSession(email);
        setUserProfileState(firestoreProfile);
        setCurrentUserEmail(email);
        return { success: true, message: 'Welcome back, ' + firestoreProfile.name + '!' };
      }
    } catch { /* Firestore unavailable — fall through to localStorage */ }
    // Fallback: localStorage cache
    const profiles = getUserProfiles();
    const profile = profiles[email.toLowerCase()];
    if (!profile) return { success: false, message: 'No account found with this email.' };
    if (profile.passwordHash !== hash) return { success: false, message: 'Incorrect password.' };
    setCurrentUserSession(email);
    setUserProfileState(profile);
    setCurrentUserEmail(email);
    return { success: true, message: 'Welcome back, ' + profile.name + '!' };
  };

  const loginWithGoogle = async (): Promise<{ success: boolean; message: string }> => {
    try {
      if (!adminSettings?.googleSignInEnabled) {
        return { success: false, message: 'Google Sign-In is not enabled. Please contact the administrator.' };
      }
      const { auth: firebaseAuth, isFirebaseConfigured: fbConfigured } = await import('../firebase');
      if (!fbConfigured || !firebaseAuth) {
        return { success: false, message: 'Google Sign-In requires Firebase to be configured.' };
      }
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      if (adminSettings?.googleClientId?.trim()) {
        provider.setCustomParameters({ client_id: adminSettings.googleClientId.trim() });
      }
      provider.addScope('profile');
      provider.addScope('email');
      const result = await signInWithPopup(firebaseAuth, provider);
      const firebaseUser = result.user;
      const email = firebaseUser.email || '';
      const name = firebaseUser.displayName || email.split('@')[0];
      const profiles = getUserProfiles();
      let profile: UserProfile = profiles[email.toLowerCase()] || {
        id: firebaseUser.uid || Date.now().toString(36),
        name, email, phone: firebaseUser.phoneNumber || '', address: '', city: '', passwordHash: '',
      };
      if (!profiles[email.toLowerCase()]) await saveUserToFirestore(profile);
      setCurrentUserSession(email);
      setUserProfileState(profile);
      setCurrentUserEmail(email);
      return { success: true, message: 'Welcome, ' + name + '!' };
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === 'auth/popup-closed-by-user') return { success: false, message: 'Sign-in cancelled.' };
      return { success: false, message: e?.message || 'Google sign-in failed.' };
    }
  };

  const registerUser = async (profile: UserProfile, password: string): Promise<{ success: boolean; message: string }> => {
    const profiles = getUserProfiles();
    if (profiles[profile.email.toLowerCase()]) return { success: false, message: 'An account already exists with this email.' };
    const newProfile = { ...profile, id: profile.id || Date.now().toString(36), passwordHash: simpleHash(password) };
    await saveUserToFirestore(newProfile); // writes to Firestore + localStorage cache
    setCurrentUserSession(profile.email);
    setUserProfileState(newProfile);
    setCurrentUserEmail(profile.email);
    return { success: true, message: 'Account created! Welcome, ' + profile.name + '!' };
  };

  const resetUserPassword = async (email: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    const profiles = getUserProfiles();
    const key = email.trim().toLowerCase();
    const profile = profiles[key];
    if (!profile) return { success: false, message: 'No account found with this email.' };
    if (newPassword.length < 6) return { success: false, message: 'Password must be at least 6 characters.' };
    const updated = { ...profile, passwordHash: simpleHash(newPassword) };
    await saveUserToFirestore(updated);
    if (userProfile?.email?.toLowerCase() === key) setUserProfileState(updated);
    deleteOtpEntry(key);
    return { success: true, message: 'Password reset successfully!' };
  };

  const logoutUser = () => {
    setCurrentUserSession(null);
    setUserProfileState(null);
    setCurrentUserEmailState(null);
    localStorage.removeItem('qf_user_email');
  };

  const updateUserProfile = async (profile: UserProfile) => {
    await saveUserToFirestore(profile); // writes to Firestore + localStorage cache
    setUserProfileState(profile);
  };

  // ── OTP store (localStorage-backed) ────────────────────────────────────────
  const OTP_STORAGE_KEY = 'qf_otp_store';
  const getOtpStore = (): Record<string, { code: string; expiresAt: number }> => {
    try { return JSON.parse(localStorage.getItem(OTP_STORAGE_KEY) || '{}'); } catch { return {}; }
  };
  const setOtpEntry = (key: string, entry: { code: string; expiresAt: number }) => {
    try {
      const st = getOtpStore();
      st[key] = entry;
      localStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(st));
    } catch {}
  };
  const deleteOtpEntry = (key: string) => {
    try {
      const st = getOtpStore();
      delete st[key];
      localStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(st));
    } catch {}
  };

  const sendPasswordOtp = async (email: string): Promise<{ success: boolean; message: string }> => {
    const profiles = getUserProfiles();
    const key = email.trim().toLowerCase();
    if (!profiles[key]) return { success: false, message: 'No account found with this email.' };
    if (smtpSettings?.otpEnabled === false) return { success: false, message: 'OTP password reset is disabled.' };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiryMinutes = smtpSettings?.otpExpiryMinutes || 10;
    setOtpEntry(key, { code, expiresAt: Date.now() + expiryMinutes * 60_000 });
    const storeName = siteSettings?.websiteName || 'E-Shop';
    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: smtpSettings?.otpSubject || `Your ${storeName} Password Reset OTP`,
          html: `<p>Your OTP is: <strong>${code}</strong>. Valid for ${expiryMinutes} minutes.</p>`,
          smtpSettings: smtpSettings ? { ...smtpSettings, fromName: smtpSettings.fromName || storeName } : null,
        }),
      });
    } catch { console.log(`[OTP DEV] Code for ${email}: ${code}`); }
    return { success: true, message: `OTP sent to ${email}. Check your inbox.` };
  };

  const verifyPasswordOtp = (email: string, otp: string): { success: boolean; message: string } => {
    const key = email.trim().toLowerCase();
    const entry = getOtpStore()[key];
    if (!entry) return { success: false, message: 'No OTP found. Please request a new one.' };
    if (Date.now() > entry.expiresAt) { deleteOtpEntry(key); return { success: false, message: 'OTP expired. Request a new one.' }; }
    if (entry.code !== otp.trim()) return { success: false, message: 'Incorrect OTP.' };
    return { success: true, message: 'OTP verified!' };
  };

  // ── Email Verification (unchanged) ─────────────────────────────────────────
  const EV_KEY = 'qf_ev_tokens';
  const getEvStore = (): Record<string, { token: string; expiresAt: number; verified: boolean }> => {
    try { return JSON.parse(localStorage.getItem(EV_KEY) || '{}'); } catch { return {}; }
  };

  const isEmailVerified = (email: string): boolean => {
    const st = getEvStore();
    const entry = st[email.toLowerCase()];
    return !!(entry && entry.verified);
  };

  const sendEmailVerification = async (email: string): Promise<{ success: boolean; message: string }> => {
    const evCfg = emailVerificationSettings;
    if (!evCfg?.isEnabled) return { success: true, message: 'Email verification not required.' };
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
    const expiryHours = evCfg.tokenExpiryHours || 24;
    const evStore = getEvStore();
    evStore[email.toLowerCase()] = { token, expiresAt: Date.now() + expiryHours * 3600_000, verified: false };
    localStorage.setItem(EV_KEY, JSON.stringify(evStore));
    try {
      await fetch('/api/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, storeName: siteSettings?.websiteName || 'E-Shop', smtpSettings }),
      });
    } catch { console.log(`[EMAIL VERIFY DEV] Token for ${email}: ${token}`); }
    return { success: true, message: `Verification email sent to ${email}.` };
  };

  const verifyEmailToken = (email: string, token: string): { success: boolean; message: string } => {
    const evStore = getEvStore();
    const entry = evStore[email.toLowerCase()];
    if (!entry) return { success: false, message: 'No verification pending for this email.' };
    if (Date.now() > entry.expiresAt) return { success: false, message: 'Verification link expired.' };
    if (entry.token !== token.trim()) return { success: false, message: 'Invalid verification token.' };
    evStore[email.toLowerCase()] = { ...entry, verified: true };
    localStorage.setItem(EV_KEY, JSON.stringify(evStore));
    return { success: true, message: 'Email verified successfully!' };
  };

  // ── SMS OTP (unchanged) ─────────────────────────────────────────────────────
  const SMS_OTP_KEY = 'qf_sms_otp_store';
  const getSmsOtpStore = (): Record<string, { code: string; expiresAt: number; attempts: number }> => {
    try { return JSON.parse(localStorage.getItem(SMS_OTP_KEY) || '{}'); } catch { return {}; }
  };

  const sendSmsOtp = async (phone: string, email: string): Promise<{ success: boolean; message: string }> => {
    const smsCfg = smsSettings;
    if (!smsCfg?.isEnabled) return { success: false, message: 'SMS gateway is not configured.' };
    if (!smsCfg.otpEnabled) return { success: false, message: 'SMS OTP is disabled.' };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiryMinutes = smsCfg.otpExpiryMinutes || 10;
    const smsStore = getSmsOtpStore();
    const phoneKey = phone.replace(/\s/g, '');
    smsStore[phoneKey] = { code, expiresAt: Date.now() + expiryMinutes * 60_000, attempts: 0 };
    localStorage.setItem(SMS_OTP_KEY, JSON.stringify(smsStore));
    const storeName = siteSettings?.websiteName || 'E-Shop';
    const message = (smsCfg.otpMessageTemplate || '{{code}} is your {{store}} code. Valid for {{expiry}} min.')
      .replace('{{code}}', code).replace('{{store}}', storeName).replace('{{expiry}}', String(expiryMinutes));
    try {
      const res = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phoneKey, message, twilioSettings: smsCfg }),
      });
      const data = await res.json();
      if (data.success) { if (data.simulated) console.log(`[SMS OTP DEV] Code for ${phoneKey}: ${code}`); return { success: true, message: `OTP sent to ${phoneKey}.` }; }
      if (res.status === 429) return { success: false, message: 'Too many requests. Please wait.' };
      return { success: false, message: data.error || 'SMS delivery failed.' };
    } catch { return { success: false, message: 'SMS service unavailable.' }; }
  };

  const verifySmsOtp = (phone: string, otp: string): { success: boolean; message: string } => {
    const smsStore = getSmsOtpStore();
    const phoneKey = phone.replace(/\s/g, '');
    const entry = smsStore[phoneKey];
    if (!entry) return { success: false, message: 'No OTP found. Request a new one.' };
    if (Date.now() > entry.expiresAt) { delete smsStore[phoneKey]; localStorage.setItem(SMS_OTP_KEY, JSON.stringify(smsStore)); return { success: false, message: 'OTP expired.' }; }
    if (entry.attempts >= 5) return { success: false, message: 'Too many attempts. Request a new OTP.' };
    if (entry.code !== otp.trim()) { entry.attempts++; localStorage.setItem(SMS_OTP_KEY, JSON.stringify(smsStore)); return { success: false, message: `Incorrect OTP. ${5 - entry.attempts} attempts remaining.` }; }
    delete smsStore[phoneKey];
    localStorage.setItem(SMS_OTP_KEY, JSON.stringify(smsStore));
    return { success: true, message: 'OTP verified!' };
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  PRODUCT / CATEGORY / ORDER ACTIONS (engine-agnostic via dbService)
  // ─────────────────────────────────────────────────────────────────────────

  const addProduct = async (product: Product) => {
    await dbService.saveProduct(product);
    setProducts(prev => [...prev.filter(p => p.id !== product.id), product]);
  };

  const editProduct = async (product: Product) => {
    await dbService.saveProduct(product);
    setProducts(prev => prev.map(p => p.id === product.id ? product : p));
  };

  const deleteProduct = async (productId: string) => {
    await dbService.deleteProduct(productId);
    setProducts(prev => prev.filter(p => p.id !== productId));
  };

  const updateProductStock = async (productId: string, newStock: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const updated = { ...product, stock: newStock };
    await dbService.saveProduct(updated);
    setProducts(prev => prev.map(p => p.id === productId ? updated : p));
  };

  const addCategory = async (category: Category) => {
    await dbService.saveCategory(category);
    setCategories(prev => [...prev.filter(c => c.id !== category.id), category]);
  };

  const editCategory = async (category: Category) => {
    await dbService.saveCategory(category);
    setCategories(prev => prev.map(c => c.id === category.id ? category : c));
  };

  const deleteCategory = async (categoryId: string) => {
    await dbService.deleteCategory(categoryId);
    setCategories(prev => prev.filter(c => c.id !== categoryId));
  };

  const placeOrder = async (
    orderData: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'orderStatus' | 'paymentStatus'>,
  ): Promise<Order> => {
    const newOrder: Order = {
      ...orderData,
      id: 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      orderNumber: 'QF-' + Math.floor(10000 + Math.random() * 90000),
      createdAt: new Date().toISOString(),
      orderStatus: 'Pending',
      paymentStatus: 'Pending',
    };
    await dbService.saveOrder(newOrder);
    setOrders(prev => [newOrder, ...prev]);
    // Deduct stock for each item
    for (const item of newOrder.items) {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const updated = { ...product, stock: Math.max(0, product.stock - item.quantity) };
        await dbService.saveProduct(updated);
        setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
      }
    }
    return newOrder;
  };

  const updateOrderStatus = async (orderId: string, status: Order['orderStatus']) => {
    await dbService.updateOrderStatus(orderId, status);
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      const updated = { ...o, orderStatus: status };
      if (status === 'Delivered') updated.paymentStatus = 'Paid';
      return updated;
    }));
  };

  const updateOrderPaymentStatus = async (orderId: string, status: Order['paymentStatus']) => {
    await dbService.updateOrderPaymentStatus(orderId, status);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, paymentStatus: status } : o));
  };

  const deleteOrder = async (orderId: string) => {
    await dbService.deleteOrder(orderId);
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  const editOrderNumber = async (orderId: string, newNumber: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const updated = { ...order, orderNumber: newNumber };
    await dbService.saveOrder(updated);
    setOrders(prev => prev.map(o => o.id === orderId ? updated : o));
  };

  const addCoupon    = async (coupon: Coupon)   => { 
    await dbService.saveCoupon(coupon);
    // Reload coupons from database to avoid duplication - database is source of truth
    const updated = await dbService.getCoupons();
    setCoupons(updated);
  };
  const deleteCoupon = async (couponId: string) => { 
    await dbService.deleteCoupon(couponId); 
    // Reload coupons from database to stay in sync
    const updated = await dbService.getCoupons();
    setCoupons(updated);
  };

  const subscribeNewsletter = async (email: string) => {
    const success = await dbService.subscribeNewsletter(email);
    if (success) {
      setNewsletterSubscribers(prev => [...prev, { id: 'sub_' + Math.random().toString(36).substr(2, 9), email: email.trim().toLowerCase(), subscribedAt: new Date().toISOString() }]);
      try {
        fetch('/api/send-email', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email, subject: `Welcome to ${siteSettings?.websiteName || 'Quirky Fruity'} Newsletter!`,
            html: `<div style="font-family:sans-serif;background:#fcf3e3;padding:40px;text-align:center;border-radius:12px;max-width:600px;margin:auto;"><div style="font-size:50px;">🎉</div><h1 style="color:#ff5c35;">Awesome, you are subscribed!</h1><p>Get ready for exciting product launches, healthy organic recipes, and exclusive promo codes directly in your inbox.</p><p style="font-size:13px;color:#9ca3af;">${siteSettings?.trademarkText || ''}</p></div>`,
            smtpSettings: smtpSettings ? { ...smtpSettings, fromName: smtpSettings.fromName || siteSettings?.websiteName || 'Store' } : null,
          }),
        });
      } catch {}
      return { success: true, message: '🎉 Hurray! You registered successfully.' };
    }
    return { success: false, message: 'This email is already subscribed!' };
  };

  const deleteSubscriber = async (id: string) => {
    await dbService.deleteSubscriber(id);
    setNewsletterSubscribers(prev => prev.filter(s => s.id !== id));
  };

  const addReview = async (productId: string, name: string, rating: number, comment: string) => {
    await dbService.addReview(productId, name, rating, comment);
    const [updatedRevs, updatedProds] = await Promise.all([dbService.getReviews(), dbService.getProducts()]);
    setReviews(updatedRevs);
    setProducts(updatedProds);
  };

  const approveReview = async (reviewId: string, approve: boolean) => {
    await dbService.approveReview(reviewId, approve);
    setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, isApproved: approve } : r));
  };

  const deleteReview = async (reviewId: string) => {
    await dbService.deleteReview(reviewId);
    setReviews(prev => prev.filter(r => r.id !== reviewId));
  };

  // ── Settings savers ────────────────────────────────────────────────────────
  const saveSiteSettings = async (settings: SiteSettings) => {
    await dbService.saveSiteSettings(settings);
    setSiteSettings(settings);
    try {
      const bc = new BroadcastChannel('qf_settings_sync');
      bc.postMessage({ type: 'siteSettings', payload: settings });
      bc.close();
    } catch {}
  };

  const saveSMTPSettings              = async (s: SMTPSettings)              => { await dbService.saveSMTPSettings(s);              setSmtpSettings(s); };
  const savePaymentSettings           = async (s: PaymentSettings)           => { await dbService.savePaymentSettings(s);           setPaymentSettings(s); };
  const saveAdminSettings             = async (s: AdminCredentials)          => { await dbService.saveAdminSettings(s);             setAdminSettings(s); };
  const saveSupportSettings           = async (s: SupportSettings)           => { await dbService.saveSupportSettings(s);           setSupportSettings(s); triggerTawkToLoader(); };
  const saveSMSSettings               = async (s: SMSSettings)               => { await dbService.saveSMSSettings(s);               setSMSSettings(s); };
  const saveEmailVerificationSettings = async (s: EmailVerificationSettings) => { await dbService.saveEmailVerificationSettings(s); setEmailVerificationSettings(s); };

  // ── Cart operations ────────────────────────────────────────────────────────
  const addToCart = (product: Product) => {
    if (product.stock === 0) return;
    setCart(prev => {
      const idx = prev.findIndex(item => item.id === product.id);
      let updated: CartItem[];
      if (idx > -1) {
        if (prev[idx].quantity >= product.stock) return prev;
        updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: prev[idx].quantity + 1 };
      } else {
        updated = [...prev, { id: product.id, product, quantity: 1 }];
      }
      try { localStorage.setItem('qf_cart', JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => { const u = prev.filter(i => i.id !== productId); try { localStorage.setItem('qf_cart', JSON.stringify(u)); } catch {} return u; });
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    const maxStock = products.find(p => p.id === productId)?.stock ?? 999;
    setCart(prev => {
      const u = quantity <= 0 ? prev.filter(i => i.id !== productId) : prev.map(i => i.id === productId ? { ...i, quantity: Math.min(quantity, maxStock) } : i);
      try { localStorage.setItem('qf_cart', JSON.stringify(u)); } catch {} return u;
    });
  };

  const clearCart    = () => { try { localStorage.removeItem('qf_cart'); } catch {} setCart([]); setAppliedCoupon(null); };
  const removeCoupon = () => { setAppliedCoupon(null); };

  const applyCouponCode = (code: string): { success: boolean; message: string } => {
    const match = coupons.find(c => c.code.trim().toUpperCase() === code.trim().toUpperCase());
    if (!match) return { success: false, message: 'Invalid coupon code!' };
    if (match.expiryDate < new Date().toISOString().split('T')[0]) return { success: false, message: 'Coupon has expired!' };
    if (match.usedCount >= match.usageLimit) return { success: false, message: 'Coupon usage limit reached!' };
    setAppliedCoupon(match);
    return { success: true, message: `🎉 Applied ${match.discountPercentage}% Discount!` };
  };

  // ── Delivery Zones ─────────────────────────────────────────────────────────
  const getZoneForCity = (city: string): DeliveryZone => {
    const cl = city.toLowerCase().trim();
    return deliveryZones.find(z => z.isEnabled && z.keywords.some(k => cl.includes(k)))
        || deliveryZones.find(z => z.isEnabled && z.keywords.length === 0)
        || deliveryZones[0];
  };
  const saveDeliveryZonesCtx = async (zones: DeliveryZone[]) => { saveDeliveryZones(zones); setDeliveryZones(zones); };

  // ── Tawk.to Live Chat ──────────────────────────────────────────────────────
  const triggerTawkToLoader = () => {
    if (!supportSettings?.isEnabled || !supportSettings.tawkToId) return;
    document.querySelector('script[src*="tawk.to"]')?.remove();
    document.querySelector('[class*="tawk-"]')?.remove();
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://embed.tawk.to/${supportSettings.tawkToId}/default`;
    s.charset = 'UTF-8';
    s.setAttribute('crossorigin', '*');
    document.head.appendChild(s);
  };

  useEffect(() => { if (supportSettings?.isEnabled) triggerTawkToLoader(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [supportSettings]);

  // ── BroadcastChannel / StorageEvent sync ────────────────────────────────────
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('qf_settings_sync');
      bc.onmessage = (e) => {
        if (e.data?.type === 'siteSettings' && e.data?.payload) setSiteSettings(e.data.payload as SiteSettings);
      };
    } catch {}
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'qf_siteSettings' && e.newValue) {
        try { setSiteSettings(JSON.parse(e.newValue) as SiteSettings); } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => { bc?.close(); window.removeEventListener('storage', handleStorage); };
  }, []);

  // ── Tab title + favicon + settings persistence ─────────────────────────────
  useEffect(() => {
    if (siteSettings?.siteTitle) document.title = siteSettings.siteTitle;
    else if (siteSettings?.websiteName) document.title = siteSettings.websiteName;
    if (siteSettings?.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = siteSettings.faviconUrl;
    }
    if (siteSettings) { try { localStorage.setItem('qf_siteSettings', JSON.stringify(siteSettings)); } catch {} }
  }, [siteSettings]);

  useEffect(() => { localStorage.setItem('qf_cart', JSON.stringify(cart)); }, [cart]);

  const formatPrice = useCallback((amount: number): string => {
    const sym = siteSettings?.currencySymbol || '$';
    const pos = siteSettings?.currencyPosition || 'before';
    const formatted = amount.toFixed(2);
    return pos === 'after' ? `${formatted}${sym}` : `${sym}${formatted}`;
  }, [siteSettings?.currencySymbol, siteSettings?.currencyPosition]);

  // ── reinitializeFirebase — backward-compat wrapper ─────────────────────────
  /**
   * Retained so existing AdminPanel Firebase section code continues to work.
   * Internally it now delegates to `switchDatabaseEngine('firebase', ...)`
   */
  const reinitializeFirebase = useCallback(
    async (config: FirebaseRuntimeConfig): Promise<{ success: boolean; message: string }> => {
      const result = await switchDatabaseEngine('firebase', config);
      // Keep isFirebaseReady in sync
      if (result.success) setIsFirebaseReady(getIsFirebaseConfigured());
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [switchDatabaseEngine],
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  C1 + C2: ADMIN SESSION WITH FIREBASE AUTH
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * setAdminLoggedIn — wraps the existing local-session logic with Firebase
   * Auth sign-in (C1) and sign-out (C2).
   *
   * C1 LOGIN: After local credentials pass we sign in to Firebase Auth using
   * a *stable* synthetic password derived from the username only (not the
   * admin password).  This decouples Firebase Auth from the admin password so
   * password changes never break Firestore write access.
   *
   * Sign-in strategy (handles all failure modes):
   *   1. Try signIn with stable password  →  success: done
   *   2. auth/user-not-found              →  create user with stable password
   *   3. auth/wrong-password (migration)  →  sign in with raw password (old
   *      behaviour), then immediately updatePassword to stable password so
   *      future logins use the correct path.
   *   4. Any other error                  →  log a clear warning; local
   *      session is still granted but writes will fail until resolved.
   *
   * C2 LOGOUT: fbSignOut clears the Firebase Auth token server-side before
   * the local session is cleared.
   */
  const setAdminLoggedIn = (
    loggedIn: boolean,
    username?: string,
    password?: string,
  ) => {
    if (loggedIn) {
      // ── Persist local session ──────────────────────────────────────────
      setIsAdminLoggedIn(true);
      const session = {
        token: Math.random().toString(36).substr(2),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      try { localStorage.setItem('qf_admin_session', JSON.stringify(session)); } catch {}
      // Store username so we can silently re-auth Firebase on page refresh
      if (username) { try { localStorage.setItem('qf_admin_username', username.trim()); } catch {} }

      // ── C1: Firebase Auth sign-in (best-effort, non-blocking) ──────────
      if (username && password && auth) {
        const adminEmail = username.trim() + '@fruitopia-admin.internal';

        // Stable password derived from username only — never changes when the
        // admin updates their local password, so Firebase Auth stays in sync.
        const stablePassword = 'ftp_' + btoa(adminEmail).replace(/[^a-zA-Z0-9]/g, '') + '_auth';

        (async () => {
          try {
            // ── Path 1: happy path ─────────────────────────────────────
            await signInWithEmailAndPassword(auth, adminEmail, stablePassword);
          } catch (e1: any) {

            if (e1?.code === 'auth/user-not-found' || e1?.code === 'auth/invalid-credential') {
              // ── Path 2: first login ever — create the Firebase Auth user ──
              try {
                await createUserWithEmailAndPassword(auth, adminEmail, stablePassword);
              } catch (e2: any) {
                console.warn('[Auth] Firebase Auth user creation failed:', e2?.code ?? e2);
              }

            } else if (e1?.code === 'auth/wrong-password') {
              // ── Path 3: migration — user was created with the raw admin
              //    password (old behaviour). Sign in with that, then
              //    immediately update to the stable password so future
              //    logins take Path 1.  ─────────────────────────────────
              try {
                const cred = await signInWithEmailAndPassword(auth, adminEmail, password);
                await updatePassword(cred.user, stablePassword);
              } catch (e3: any) {
                console.warn(
                  '[Auth] Firebase Auth migration failed — Firestore writes may be rejected.',
                  'code:', e3?.code ?? e3,
                );
              }

            } else {
              // ── Path 4: unexpected error ───────────────────────────────
              console.warn(
                '[Auth] Firebase Auth sign-in failed — Firestore writes will be rejected ' +
                'until this is resolved. Error:', e1?.code ?? e1,
              );
            }
          }
        })();
      }
    } else {
      // ── C2: Firebase Auth sign-out (best-effort, non-blocking) ─────────
      if (auth) {
        (async () => {
          try { await fbSignOut(auth); } catch { /* silent */ }
        })();
      }

      // ── Clear local session ────────────────────────────────────────────
      setIsAdminLoggedIn(false);
      try { localStorage.removeItem('qf_admin_session'); } catch {}
      try { localStorage.removeItem('qf_admin_username'); } catch {}
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  CONTEXT VALUE
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AppContext.Provider
      value={{
        products,
        categories,
        orders,
        coupons,
        newsletterSubscribers,
        reviews,
        siteSettings:              siteSettings || DEFAULT_SITE_SETTINGS,
        smtpSettings:              smtpSettings || DEFAULT_SMTP_SETTINGS,
        paymentSettings:           paymentSettings || DEFAULT_PAYMENT_SETTINGS,
        adminSettings:             adminSettings,
        supportSettings:           supportSettings || DEFAULT_SUPPORT_SETTINGS,
        smsSettings:               smsSettings || DEFAULT_SMS_SETTINGS,
        emailVerificationSettings: emailVerificationSettings || DEFAULT_EMAIL_VERIFICATION_SETTINGS,
        cart,
        appliedCoupon,
        isAdminLoggedIn,
        isLoading,

        // ── Polymorphic engine API ─────────────────────────────────────────
        databaseEngine,
        switchDatabaseEngine,

        // ── C5: Raw active engine string ──────────────────────────────────
        activeDbEngine: getActiveEngine(),

        addProduct, editProduct, deleteProduct, updateProductStock,
        addCategory, editCategory, deleteCategory,
        placeOrder, updateOrderStatus, updateOrderPaymentStatus, deleteOrder, editOrderNumber,
        // C3: refreshOrders
        refreshOrders,
        addCoupon, deleteCoupon,
        subscribeNewsletter, deleteSubscriber,
        addReview, approveReview, deleteReview,
        saveSiteSettings, saveSMTPSettings, savePaymentSettings, saveAdminSettings,
        saveSupportSettings, saveSMSSettings, saveEmailVerificationSettings,
        sendSmsOtp, verifySmsOtp, sendEmailVerification, verifyEmailToken, isEmailVerified,
        addToCart, removeFromCart, updateCartQuantity, clearCart, applyCouponCode, removeCoupon,
        setAdminLoggedIn,
        triggerTawkToLoader,
        currentUserEmail,
        setCurrentUserEmail,
        formatPrice,
        // C4: isFirebaseReady — driven by useState + dedicated useEffect above
        isFirebaseReady,
        reinitializeFirebase,
        userProfile,
        isUserLoggedIn: !!userProfile,
        loginUser, loginWithGoogle, registerUser, resetUserPassword,
        sendPasswordOtp, verifyPasswordOtp, logoutUser, updateUserProfile,
        deliveryZones, getZoneForCity, saveDeliveryZonesCtx,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside an AppProvider context.');
  return context;
};
