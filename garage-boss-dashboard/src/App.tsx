import * as React from 'react';
import { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  collection, 
  query,
  orderBy,
  limit,
  onSnapshot, 
  getDoc 
} from 'firebase/firestore';
import { 
  Wrench, FileText, BarChart3, Users, Car, Eye, CalendarClock, LogOut, KeyRound, ShieldAlert, BadgeInfo, CheckCircle2, ChevronRight, Menu, X, Package, CreditCard, Sparkles, RefreshCw, Archive, AlertTriangle, MessageCircle
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import WhatsAppPanel from './components/WhatsAppPanel';
import { Client, Vehicle, JobCard, Part, Invoice, ServiceReminder, GarageSettings, UserProfile, ArchiveRecord } from './types';
import { resetMonth, ResetMonthResult } from './utils/resetMonth';
import DashboardOverview from './components/DashboardOverview';
import ReportsPage from './components/ReportsPage';
import EntitiesView from './components/EntitiesView';
import LiveMonitoring from './components/LiveMonitoring';
import ArchivesView from './components/ArchivesView';

/**
 * How many live records each unbounded collection holds.
 *
 * The dashboard subscribes to whole collections. Jobs and invoices grow for
 * the life of the business, so an uncapped listener means every page load
 * re-downloads (and is billed for) every record ever created — start-up time
 * and cost both scale with the garage's age rather than its activity. The
 * dashboard shows current operations and this month's figures, so a recent
 * window is what it actually needs; older records live in Archives.
 */
const LIVE_WINDOW = 1000;
const ARCHIVE_WINDOW = 60;

export default function App() {
  // Authentication & Profile States
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Firestore Subcollection States
  const [settings, setSettings] = useState<GarageSettings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [stock, setStock] = useState<Part[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [reminders, setReminders] = useState<ServiceReminder[]>([]);
  const [archives, setArchives] = useState<ArchiveRecord[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);

  // Sidebar / Navigation States
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'jobs' | 'invoices' | 'inventory' | 'vehicles' | 'customers' | 'reminders' | 'cctv' | 'archives' | 'whatsapp'>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Start New Month (archive + reset) States
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<ResetMonthResult | null>(null);

  // Auth Constants
  const BOSS_EMAIL = (import.meta as any).env.VITE_BOSS_EMAIL || "boss@vafubwengetech.internal";

  // 1. Listen for authentication changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setLoadingProfile(true);
        setAuthError(null);
        try {
          const userDocPath = `users/${currentUser.uid}`;
          const userDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
          
          if (userDocSnap.exists()) {
            setUserProfile(userDocSnap.data() as UserProfile);
          } else {
            console.error("User profile document not found under users collection");
            setAuthError("Authorized profile not found in database. Contact System Admin.");
            await signOut(auth);
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
          setAuthError("Failed to resolve security clearance.");
          await signOut(auth);
        } finally {
          setLoadingProfile(false);
        }
      } else {
        setUserProfile(null);
        setSettings(null);
        setClients([]);
        setVehicles([]);
        setJobs([]);
        setStock([]);
        setInvoices([]);
        setReminders([]);
        setArchives([]);
      }
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Establish live read-only listeners once garageId is known
  useEffect(() => {
    if (!user || !userProfile?.garageId) return;

  // The boss profile may predate the desktop garage id, so fall back to the
  // build-time value rather than silently reading an empty garage.
  const garageId = userProfile.garageId || (import.meta.env.VITE_GARAGE_ID as string) || "";
    setLoadingCollections(true);

    const unsubscribers: (() => void)[] = [];

    // Listener A: Garage Settings Document
    const settingsPath = `garages/${garageId}`;
    try {
      const unsubSettings = onSnapshot(doc(db, 'garages', garageId), (snapshot) => {
        if (snapshot.exists()) {
          setSettings({ id: snapshot.id, ...snapshot.data() } as GarageSettings);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, settingsPath);
      });
      unsubscribers.push(unsubSettings);
    } catch (e) {
      console.error(e);
    }

    // Listener B: Clients subcollection
    const clientsPath = `garages/${garageId}/clients`;
    try {
      const unsubClients = onSnapshot(collection(db, 'garages', garageId, 'clients'), (snapshot) => {
        const list: Client[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Client);
        });
        setClients(list);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, clientsPath);
      });
      unsubscribers.push(unsubClients);
    } catch (e) {
      console.error(e);
    }

    // Listener C: Vehicles subcollection
    const vehiclesPath = `garages/${garageId}/vehicles`;
    try {
      const unsubVehicles = onSnapshot(collection(db, 'garages', garageId, 'vehicles'), (snapshot) => {
        const list: Vehicle[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Vehicle);
        });
        setVehicles(list);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, vehiclesPath);
      });
      unsubscribers.push(unsubVehicles);
    } catch (e) {
      console.error(e);
    }

    // Listener D: Job Cards subcollection
    const jobsPath = `garages/${garageId}/jobs`;
    try {
      const jobsQuery = query(
        collection(db, 'garages', garageId, 'jobs'),
        orderBy('startedAt', 'desc'),
        limit(LIVE_WINDOW)
      );
      const unsubJobs = onSnapshot(jobsQuery, (snapshot) => {
        const list: JobCard[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() } as JobCard);
        });
        setJobs(list);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, jobsPath);
      });
      unsubscribers.push(unsubJobs);
    } catch (e) {
      console.error(e);
    }

    // Listener E: Stock (Parts) subcollection
    const stockPath = `garages/${garageId}/stock`;
    try {
      const unsubStock = onSnapshot(collection(db, 'garages', garageId, 'stock'), (snapshot) => {
        const list: Part[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Part);
        });
        setStock(list);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, stockPath);
      });
      unsubscribers.push(unsubStock);
    } catch (e) {
      console.error(e);
    }

    // Listener F: Invoices subcollection
    const invoicesPath = `garages/${garageId}/invoices`;
    try {
      const invoicesQuery = query(
        collection(db, 'garages', garageId, 'invoices'),
        orderBy('issuedAt', 'desc'),
        limit(LIVE_WINDOW)
      );
      const unsubInvoices = onSnapshot(invoicesQuery, (snapshot) => {
        const list: Invoice[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Invoice);
        });
        setInvoices(list);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, invoicesPath);
      });
      unsubscribers.push(unsubInvoices);
    } catch (e) {
      console.error(e);
    }

    // Listener G: Service Reminders subcollection
    const remindersPath = `garages/${garageId}/reminders`;
    try {
      const unsubReminders = onSnapshot(collection(db, 'garages', garageId, 'reminders'), (snapshot) => {
        const list: ServiceReminder[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() } as ServiceReminder);
        });
        setReminders(list);
        setLoadingCollections(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, remindersPath);
      });
      unsubscribers.push(unsubReminders);
    } catch (e) {
      console.error(e);
    }

    // Listener H: Monthly Archives subcollection (newest first)
    const archivesPath = `garages/${garageId}/archives`;
    try {
      const archivesQuery = query(
        collection(db, 'garages', garageId, 'archives'),
        orderBy('archivedAt', 'desc'),
        limit(ARCHIVE_WINDOW)
      );
      const unsubArchives = onSnapshot(archivesQuery, (snapshot) => {
        const list: ArchiveRecord[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() } as ArchiveRecord);
        });
        setArchives(list);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, archivesPath);
      });
      unsubscribers.push(unsubArchives);
    } catch (e) {
      console.error(e);
    }

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [user, userProfile]);

  // Submit Password-only flow
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;

    setIsSubmitting(true);
    setAuthError(null);

    try {
      await signInWithEmailAndPassword(auth, BOSS_EMAIL, passwordInput);
    } catch (error) {
      console.error("Login failure:", error);
      setAuthError("Incorrect password");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Signout error:", error);
    }
  };

  // Archive jobs + invoices for the current month, then clear the live view
  const handleStartNewMonth = async () => {
    if (!userProfile?.garageId || isResetting) return;

    setIsResetting(true);
    setResetError(null);

    try {
      const result = await resetMonth(userProfile.garageId, jobs, invoices);
      setResetSuccess(result);
    } catch (error) {
      console.error("Reset month failed:", error);
      setResetError("Could not complete the reset. Nothing was deleted â€” please try again.");
    } finally {
      setIsResetting(false);
    }
  };

  const closeResetModal = () => {
    setShowResetModal(false);
    setResetError(null);
    setResetSuccess(null);
  };

  // Nav items structure
  const navigationItems = [
    { id: 'overview', name: 'Overview', icon: BarChart3 },
    { id: 'reports', name: 'Reports', icon: FileText },
    { id: 'jobs', name: 'Job Cards', icon: Wrench },
    { id: 'invoices', name: 'Invoices', icon: CreditCard },
    { id: 'inventory', name: 'Inventory', icon: Package },
    { id: 'vehicles', name: 'Vehicles', icon: Car },
    { id: 'customers', name: 'Customers', icon: Users },
    { id: 'reminders', name: 'Reminders', icon: CalendarClock },
    { id: 'cctv', name: 'CCTV Camera', icon: Eye },
    { id: 'archives', name: 'Archives', icon: Archive },
    { id: 'whatsapp', name: 'WhatsApp', icon: MessageCircle },
  ];

  // 1. Render Loading State (during boot verification)
  if (loadingAuth || (user && loadingProfile)) {
    return (
      <div className="min-h-screen bg-gray-50/60 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center max-w-sm text-center">
          <div className="relative">
            <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center animate-spin">
              <Wrench className="w-5 h-5 text-amber-500" />
            </div>
          </div>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-widest mt-6">Telemetry Handshake</h2>
          <p className="text-xs text-gray-500 mt-2 font-mono">Securing live workshop datalink stream...</p>
        </div>
      </div>
    );
  }

  // 2. Centered Password-Only Auth lock screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 selection:bg-amber-100 selection:text-amber-900">
        <div className="w-full max-w-md bg-white border border-gray-100 rounded-3xl p-8 shadow-sm flex flex-col relative overflow-hidden">
          {/* Subtle design accent representing precision */}
          <div className="absolute top-0 inset-x-0 h-1 bg-amber-400" />

          <div className="text-center mb-8">
            <div className="h-12 w-12 rounded-2xl bg-amber-50/50 border border-amber-100 flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-5 h-5 text-amber-500 animate-pulse" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 font-mono">BOSS COMPANION VIEWER</span>
            <h1 className="text-xl font-black text-gray-900 tracking-tight mt-1">Authenticate Portal</h1>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">Enter secure system access key to unlock real-time telemetry dashboards</p>
          </div>

          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div className="relative">
              <input
                type="password"
                id="boss-password-input"
                placeholder="Enter access password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-4 py-3 bg-gray-50/80 border border-gray-200 rounded-2xl text-xs text-center font-mono focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 focus:bg-white transition-all disabled:opacity-50"
                autoFocus
              />
            </div>

            {authError && (
              <div id="login-error-msg" className="flex items-center gap-2 bg-rose-50 text-rose-700 p-3 rounded-xl border border-rose-100 text-xs font-medium justify-center">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              id="login-submit-btn"
              disabled={isSubmitting}
              className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                <span>Unlock Dashboard</span>
              )}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-gray-50 pt-6">
            <p className="text-[10px] font-mono text-gray-400">READ-ONLY MODE AUTOMATICALLY ENFORCED</p>
          </div>
        </div>
      </div>
    );
  }

  // Helper values
  const garageName = settings?.garageName || "Workshop";

  // 3. Main Dashboard Layout
  return (
    <div id="dashboard-layout-root" className="min-h-screen bg-gray-50/40 flex flex-col selection:bg-amber-100 selection:text-amber-900">
      {/* 1. Header (Universal Across Viewport) */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile menu trigger */}
            <button 
              id="mobile-sidebar-toggle"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Application Brand Logo */}
            <div className="flex items-center gap-2 bg-gray-900 text-white px-3 py-1.5 rounded-xl border border-gray-800 shadow-sm">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-[11px] font-black tracking-widest font-display">BOSS</span>
            </div>
            
            <div className="hidden sm:block border-l border-gray-200 h-5 mx-1" />
            
            <span className="hidden sm:inline text-xs font-bold text-gray-700 font-display">
              {garageName}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* User credentials identifier */}
            <div className="flex flex-col items-end text-right">
              <span className="text-xs font-bold text-gray-800">{userProfile?.displayName || "System Owner"}</span>
              <span className="text-[9px] font-mono font-bold tracking-wider text-amber-500 uppercase">
                {userProfile?.role || "BOSS"} MODE
              </span>
            </div>

            {/* Safe Logout trigger */}
            <button
              id="logout-header-btn"
              onClick={handleLogout}
              className="p-2.5 rounded-xl border border-gray-100 hover:bg-rose-50 hover:text-rose-600 text-gray-400 transition cursor-pointer"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 gap-8 print:p-0 print:block">
        {/* Sidebar Navigation - Large Screens */}
        <aside className="hidden lg:block w-64 shrink-0 space-y-1 print:hidden">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 block mb-3 font-display">CHANNELS</span>
            {navigationItems.map((item) => {
              const IconComp = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold tracking-tight transition-all duration-150 cursor-pointer ${
                    isActive 
                      ? 'bg-amber-400 text-gray-900 shadow-sm border border-amber-400/50' 
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <IconComp className={`w-4 h-4 ${isActive ? 'text-gray-900' : 'text-gray-400'}`} />
                    <span>{item.name}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isActive ? 'rotate-90 text-gray-900' : 'text-gray-300'}`} />
                </button>
              );
            })}
          </div>

          {/* Admin Zone: Start New Month */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1 block mb-3 font-display">ADMIN ZONE</span>
            <button
              id="start-new-month-btn"
              onClick={() => setShowResetModal(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold tracking-tight bg-rose-50/60 text-rose-700 border border-rose-100 hover:bg-rose-50 transition cursor-pointer"
            >
              <Archive className="w-4 h-4" />
              <span>Start New Month</span>
            </button>
          </div>
        </aside>

        {/* Mobile Slide-out Menu */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden print:hidden">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
            <div className="fixed top-0 left-0 bottom-0 w-72 bg-white p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <span className="text-xs font-black uppercase tracking-wider text-gray-800 font-display">Boss Control</span>
                  </div>
                  <button 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-2 rounded-xl text-gray-400 hover:bg-gray-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 block mb-3">CHANNELS</span>
                  {navigationItems.map((item) => {
                    const IconComp = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id as any);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold tracking-tight transition cursor-pointer ${
                          isActive 
                            ? 'bg-amber-400 text-gray-900 shadow-sm border border-amber-400' 
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                        <span>{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-6 space-y-2">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setShowResetModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-rose-50/60 text-rose-700 border border-rose-100 py-3 rounded-xl text-xs font-bold hover:bg-rose-50 transition cursor-pointer"
                >
                  <Archive className="w-4 h-4" />
                  <span>Start New Month</span>
                </button>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-rose-50 text-rose-700 py-3 rounded-xl text-xs font-bold hover:bg-rose-100 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>End Session</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Canvas Workspace */}
        <main className="flex-1 min-w-0 print:p-0">
          {/* Synchronizing warning placeholder (strictly passive) */}
          {loadingCollections && (
            <div className="mb-6 p-3 bg-amber-50 rounded-xl border border-amber-100 text-[11px] font-mono text-amber-700 flex items-center gap-2 animate-pulse print:hidden">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Receiving latest desktop node transaction updates...</span>
            </div>
          )}

          {activeTab === 'overview' && (
            <DashboardOverview
              settings={settings || { id: '', garageName: '', address: '', phone: '', currency: 'RWF', taxRate: 0, cameraStreamUrl: '', cameraLabel: '', updatedAt: '' }}
              clients={clients}
              vehicles={vehicles}
              jobs={jobs}
              stock={stock}
              invoices={invoices}
              reminders={reminders}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsPage
              settings={settings || { id: '', garageName: '', address: '', phone: '', currency: 'RWF', taxRate: 0, cameraStreamUrl: '', cameraLabel: '', updatedAt: '' }}
              clients={clients}
              vehicles={vehicles}
              jobs={jobs}
              stock={stock}
              invoices={invoices}
            />
          )}

          {activeTab === 'jobs' && (
            <EntitiesView
              tab="jobs"
              settings={settings || { id: '', garageName: '', address: '', phone: '', currency: 'RWF', taxRate: 0, cameraStreamUrl: '', cameraLabel: '', updatedAt: '' }}
              clients={clients}
              vehicles={vehicles}
              jobs={jobs}
              stock={stock}
              invoices={invoices}
              reminders={reminders}
            />
          )}

          {activeTab === 'invoices' && (
            <EntitiesView
              tab="invoices"
              settings={settings || { id: '', garageName: '', address: '', phone: '', currency: 'RWF', taxRate: 0, cameraStreamUrl: '', cameraLabel: '', updatedAt: '' }}
              clients={clients}
              vehicles={vehicles}
              jobs={jobs}
              stock={stock}
              invoices={invoices}
              reminders={reminders}
            />
          )}

          {activeTab === 'inventory' && (
            <EntitiesView
              tab="inventory"
              settings={settings || { id: '', garageName: '', address: '', phone: '', currency: 'RWF', taxRate: 0, cameraStreamUrl: '', cameraLabel: '', updatedAt: '' }}
              clients={clients}
              vehicles={vehicles}
              jobs={jobs}
              stock={stock}
              invoices={invoices}
              reminders={reminders}
            />
          )}

          {activeTab === 'vehicles' && (
            <EntitiesView
              tab="vehicles"
              settings={settings || { id: '', garageName: '', address: '', phone: '', currency: 'RWF', taxRate: 0, cameraStreamUrl: '', cameraLabel: '', updatedAt: '' }}
              clients={clients}
              vehicles={vehicles}
              jobs={jobs}
              stock={stock}
              invoices={invoices}
              reminders={reminders}
            />
          )}

          {activeTab === 'customers' && (
            <EntitiesView
              tab="customers"
              settings={settings || { id: '', garageName: '', address: '', phone: '', currency: 'RWF', taxRate: 0, cameraStreamUrl: '', cameraLabel: '', updatedAt: '' }}
              clients={clients}
              vehicles={vehicles}
              jobs={jobs}
              stock={stock}
              invoices={invoices}
              reminders={reminders}
            />
          )}

          {activeTab === 'reminders' && (
            <EntitiesView
              tab="reminders"
              settings={settings || { id: '', garageName: '', address: '', phone: '', currency: 'RWF', taxRate: 0, cameraStreamUrl: '', cameraLabel: '', updatedAt: '' }}
              clients={clients}
              vehicles={vehicles}
              jobs={jobs}
              stock={stock}
              invoices={invoices}
              reminders={reminders}
            />
          )}

          {activeTab === 'cctv' && (
            <LiveMonitoring 
              streamUrl={settings?.cameraStreamUrl} 
              label={settings?.cameraLabel} 
            />
          )}

          {activeTab === 'archives' && (
            <ArchivesView
              garageId={userProfile?.garageId || ''}
              archives={archives}
              settings={settings || { id: '', garageName: '', address: '', phone: '', currency: 'RWF', taxRate: 0, cameraStreamUrl: '', cameraLabel: '', updatedAt: '' }}
            />
          )}
          {activeTab === 'whatsapp' && (
            <WhatsAppPanel garageId={userProfile?.garageId || ''} />
          )}
        </main>
      </div>

      {/* Start New Month: Confirmation / Progress Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 print:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isResetting && closeResetModal()} />
          <div className="relative w-full max-w-md bg-white border border-gray-100 rounded-3xl p-7 shadow-xl">
            {!resetSuccess ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-11 w-11 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-rose-500" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-rose-500 font-mono">DESTRUCTIVE ACTION</span>
                    <h2 className="text-base font-black text-gray-900 tracking-tight">Start New Month?</h2>
                  </div>
                </div>

                <p className="text-xs text-gray-500 leading-relaxed mb-4">
                  This will archive all <strong>{jobs.length} job card{jobs.length === 1 ? '' : 's'}</strong> and <strong>{invoices.length} invoice{invoices.length === 1 ? '' : 's'}</strong> into a monthly snapshot, then clear them from the live dashboard. Customers, vehicles, inventory, and reminders are not affected.
                </p>

                {resetError && (
                  <div className="flex items-center gap-2 bg-rose-50 text-rose-700 p-3 rounded-xl border border-rose-100 text-xs font-medium mb-4">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{resetError}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={closeResetModal}
                    disabled={isResetting}
                    className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 py-3 rounded-2xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    id="confirm-reset-btn"
                    onClick={handleStartNewMonth}
                    disabled={isResetting}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-2xl text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isResetting ? (
                      <>
                        <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        <span>Archiving...</span>
                      </>
                    ) : (
                      <span>Yes, Archive & Reset</span>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-11 w-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 font-mono">DONE</span>
                    <h2 className="text-base font-black text-gray-900 tracking-tight">Month Reset Complete</h2>
                  </div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mb-6">
                  Archived <strong>{resetSuccess.jobCount} job{resetSuccess.jobCount === 1 ? '' : 's'}</strong> and <strong>{resetSuccess.invoiceCount} invoice{resetSuccess.invoiceCount === 1 ? '' : 's'}</strong> under <span className="font-mono">{resetSuccess.monthLabel}</span>. The dashboard is now clear for the new month.
                </p>
                <button
                  onClick={closeResetModal}
                  className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-2xl text-xs font-bold transition cursor-pointer"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

