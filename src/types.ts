/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ─────────────────────────────────────────────────────────────────────────────
//  POLYMORPHIC DATABASE ENGINE TYPES
//  These types power the Dual-Backend Architecture (Local Mock / Firebase /
//  Supabase) and are consumed by db.ts, supabase.ts, AppContext.tsx, and
//  AdminPanel.tsx.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The three database engine modes supported by Fruitopia.
 *  - 'local'    : In-memory store backed by localStorage (always available, zero config)
 *  - 'firebase' : Google Firebase Firestore real-time database
 *  - 'supabase' : Supabase PostgreSQL + Realtime subscriptions
 */
export type DatabaseEngine = 'local' | 'firebase' | 'supabase';

/**
 * Credential shape for Firebase configuration.
 * Stored at localStorage key: `fruitopia_dynamic_firebase`
 */
export interface FirebaseCredentials {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  databaseId?: string; // Firestore named DB (default: "(default)")
}

/**
 * Credential shape for Supabase configuration.
 * Stored at localStorage key: `fruitopia_supabase_config`
 */
export interface SupabaseCredentials {
  projectUrl: string; // https://your-project-ref.supabase.co
  anonKey: string;    // Supabase anon public key (safe to expose in browser)
}

/**
 * Union credential type for the engine switcher.
 * The `switchActiveDatabaseEngine` function accepts this union.
 */
export type EngineCredentials = FirebaseCredentials | SupabaseCredentials | null;

// ─────────────────────────────────────────────────────────────────────────────
//  EXISTING TYPES — UNCHANGED
// ─────────────────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  salePrice: number | null;
  stock: number;
  image: string; // URL or emoji-icon
  category: string;
  ingredients?: string[];
  rating: number;
  reviewsCount: number;
  isFeatured: boolean;
  isActive: boolean;
}

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
}

export type OrderStatus =
  | 'Pending'
  | 'Processing'
  | 'Confirmed'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'Refunded';

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode?: string;
  deliveryNote?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  couponApplied: string | null;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentStatus: 'Pending' | 'Paid' | 'Failed';
  orderStatus: OrderStatus;
  createdAt: string;
  transactionId?: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountPercentage: number;
  expiryDate: string;
  usageLimit: number;
  usedCount: number;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  subscribedAt: string;
}

export interface Review {
  id: string;
  productId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  isApproved: boolean;
  createdAt: string;
}

export interface SiteSettings {
  websiteName: string;
  siteTitle: string;
  logoUrl?: string;       // Primary: uploaded image (base64 or URL). Preferred over emoji.
  logoEmoji?: string;     // Legacy fallback only — no longer used as primary logo
  faviconUrl?: string;    // Browser tab favicon (ICO/PNG/SVG, recommended 32×32px)
  heroBadge: string;
  heroTitleLine1: string;
  heroTitleLine2: string;
  heroSubtitle: string;
  heroButtonText: string;
  heroTimeBadge: string;
  footerText: string;
  footerLinks: { label: string; url: string }[];
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  socialFacebook?: string;
  socialInstagram?: string;
  socialTwitter?: string;
  promoBannerEnabled: boolean;
  promoBannerText: string;
  themePrimaryColor: string; // hex
  themeBgColor: string; // hex or tailwind class
  themeHeaderFont: string; // 'Space Grotesk' | 'Inter' | 'Playfair Display'
  trademarkText: string;
  newsletterSectionIcon?: string; // SVG string or URL; defaults to built-in envelope icon
  testimonialSectionIcon?: string; // SVG string or URL; defaults to built-in star icon
  currency?: string;        // ISO code e.g. USD, BDT, EUR, GBP, INR
  currencySymbol?: string;  // Display symbol e.g. $, ৳, €, £, ₹
  currencyPosition?: 'before' | 'after'; // symbol before or after amount
  orderTrackerEnabled?: boolean; // Admin toggle: show/hide Order Tracker page
  orderTrackerInNavbar?: boolean; // Admin toggle: show Tracker link in navbar
  /** @deprecated Maintenance mode has been removed. Fields kept for schema compatibility only. */
  maintenanceMode?: boolean;
  maintenanceTitle?: string;
  maintenanceMessage?: string;
}

export interface SMTPSettings {
  host: string;
  port: string | number;
  email: string;
  password?: string;
  fromName?: string;       // Sender display name, e.g. "My Store"
  isEnabled: boolean;
  // OTP / Password-reset configuration
  otpEnabled?: boolean;    // Whether OTP email reset is active (default true when SMTP enabled)
  otpExpiryMinutes?: number; // How long OTP is valid (default 10)
  otpSubject?: string;     // Custom email subject line
}

export interface PaymentSettings {
  // Payment method display branding (name + logo image overrides)
  codDisplayName?: string;
  codLogoImageUrl?: string;
  bKashDisplayName?: string;
  bKashLogoImageUrl?: string;
  nagadDisplayName?: string;
  nagadLogoImageUrl?: string;
  rocketDisplayName?: string;
  rocketLogoImageUrl?: string;
  bankDisplayName?: string;
  bankLogoImageUrl?: string;
  creditManualDisplayName?: string;
  creditManualLogoImageUrl?: string;
  paypalDisplayName?: string;
  paypalLogoImageUrl?: string;
  stripeDisplayName?: string;
  stripeLogoImageUrl?: string;
  bKashAutoDisplayName?: string;
  bKashAutoLogoImageUrl?: string;
  nagadAutoDisplayName?: string;
  nagadAutoLogoImageUrl?: string;

  codEnabled: boolean;
  bKashEnabled: boolean;
  bKashNo: string;
  bKashInstructions: string;
  bKashLogoEmoji: string;
  bKashQrCodeUrl?: string;
  nagadEnabled: boolean;
  nagadNo: string;
  nagadInstructions: string;
  nagadLogoEmoji: string;
  nagadQrCodeUrl?: string;
  rocketEnabled: boolean;
  rocketNo: string;
  rocketInstructions: string;
  rocketLogoEmoji: string;
  rocketQrCodeUrl?: string;
  bankEnabled: boolean;
  bankNo: string;
  bankInstructions: string;
  bankLogoEmoji: string;
  bankQrCodeUrl?: string;
  bankName: string;
  bankHolder: string;
  creditManualEnabled: boolean;
  creditManualNo: string;
  creditManualInstructions: string;
  creditManualLogoEmoji: string;
  creditManualQrCodeUrl?: string;
  paypalEnabled?: boolean;
  paypalClientId?: string;
  paypalSandboxMode?: boolean;
  bKashAutoEnabled?: boolean;
  bKashAppKey?: string;
  bKashAppSecret?: string;
  bKashUsername?: string;
  bKashPassword?: string;
  bKashSandboxMode?: boolean;
  nagadAutoEnabled?: boolean;
  nagadMerchantId?: string;
  nagadMerchantPrivateKey?: string;
  nagadPublicKey?: string;
  nagadSandboxMode?: boolean;
  stripeEnabled: boolean;
  stripePublicKey: string;
  stripeSecretKey: string;
  stripeSandboxMode: boolean;
  sslCommerzEnabled: boolean;
  sslCommerzStoreId: string;
  sslCommerzStorePassword: string;
  sslCommerzSandboxMode: boolean;
  razorpayEnabled: boolean;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpaySandboxMode: boolean;
  cardPaymentEnabled: boolean;
  shippingFee: number;
  taxPercentage: number;
  // Optional subtext shown under each payment logo button (empty = hidden)
  codSubtext?: string;
  bKashSubtext?: string;
  nagadSubtext?: string;
  rocketSubtext?: string;
  bankSubtext?: string;
  creditManualSubtext?: string;
  paypalSubtext?: string;
  stripeSubtext?: string;
  bKashAutoSubtext?: string;
  nagadAutoSubtext?: string;

  // Per-method button accent colors (hex, e.g. '#7c3aed')
  codBtnColor?: string;
  bKashBtnColor?: string;
  nagadBtnColor?: string;
  rocketBtnColor?: string;
  bankBtnColor?: string;
  creditManualBtnColor?: string;
  paypalBtnColor?: string;
  stripeBtnColor?: string;
  bKashAutoBtnColor?: string;
  nagadAutoBtnColor?: string;
}

export interface AdminCredentials {
  username: string;
  password?: string;
  passwordHash?: string;
  googleSignInEnabled?: boolean;
  googleClientId?: string;
}

export interface SupportSettings {
  tawkToId: string;
  isEnabled: boolean;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  slug: string;
  isVisible: boolean; // Admin can toggle visibility on storefront
  isNavbarFeatured?: boolean; // Admin can pin to navbar featured strip
  imageUrl?: string; // Optional uploaded logo image (overrides emoji when set)
}

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  passwordHash?: string;
  orderIds?: string[]; // IDs of orders placed by this user
}

export interface SMSSettings {
  isEnabled: boolean;
  provider: 'twilio'; // extensible
  accountSid: string;
  authToken: string;
  fromNumber: string; // e.g. +15550001234
  // OTP config
  otpEnabled: boolean;
  otpExpiryMinutes: number;
  otpMessageTemplate: string; // supports {{code}} and {{store}}
}

export interface EmailVerificationSettings {
  isEnabled: boolean;
  requireVerificationBeforeOrder: boolean;
  tokenExpiryHours: number;
}

export interface DeliveryZone {
  id: string;
  name: string;
  keywords: string[]; // lowercase city/area keywords
  fee: number;
  minDays: number;
  maxDays: number;
  isEnabled: boolean;
}
