import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import {
  Authenticated,
  AuthLoading,
  ConvexReactClient,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { cloudApi } from "./api";
import {
  buildSnapshot,
  driverTotals,
  uploadPendingTicketImages,
} from "./state";
import "./styles.css";
import "../scanner/scanner.css";
import "../scanner/ui.js";
import { readTicket, applyTicketRead, READER_VERSION } from '../ticket-reader/browser.js';

window.DriverTicketReader = { readTicket, applyTicketRead };

const convexUrl = import.meta.env.VITE_CONVEX_URL;

function messageFrom(error) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  return message.replace(/^\[CONVEX [^\]]+\]\s*/i, "").replace(/^Uncaught (Error|ConvexError):\s*/i, "");
}

function truckLabel(truckNumber) {
  return truckNumber === "None" ? "No truck assigned" : `Truck ${truckNumber}`;
}

function FullScreen({ children, subtle = false }) {
  return <div className={`cloud-gate${subtle ? " cloud-gate--subtle" : ""}`}>{children}</div>;
}

function LoadingGate() {
  return (
    <FullScreen subtle>
      <div className="cloud-loader" />
      <div className="cloud-loading-copy">Connecting securely…</div>
    </FullScreen>
  );
}

function AuthScreen() {
  const { signIn } = useAuthActions();
  const [screen, setScreen] = useState("signIn");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const nextEmail = String(data.get("email") || email).trim().toLowerCase();
    const passwordValue = String(data.get("password") || "");
    if (nextEmail) setEmail(nextEmail);
    try {
      if (screen === "signIn" || screen === "signUp") {
        const result = await signIn("password", {
          flow: screen,
          email: nextEmail,
          password: passwordValue,
        });
        if (!result.signingIn) setScreen("verify");
      } else if (screen === "verify") {
        await signIn("password", {
          flow: "email-verification",
          email: nextEmail,
          code: String(data.get("code") || "").trim(),
        });
      } else if (screen === "forgot") {
        await signIn("password", { flow: "reset", email: nextEmail });
        setScreen("reset");
      } else if (screen === "reset") {
        await signIn("password", {
          flow: "reset-verification",
          email: nextEmail,
          code: String(data.get("code") || "").trim(),
          newPassword: String(data.get("newPassword") || ""),
        });
      }
    } catch (nextError) {
      if (screen === "signUp") {
        try {
          const recovery = await signIn("password", {
            flow: "signIn",
            email: nextEmail,
            password: passwordValue,
          });
          if (!recovery.signingIn) setScreen("verify");
          return;
        } catch {
          // The original sign-up error is more useful when recovery is impossible.
        }
      }
      setError(messageFrom(nextError));
    } finally {
      setBusy(false);
    }
  };

  const credentials = screen === "signIn" || screen === "signUp";
  const title = {
    signIn: "Welcome back",
    signUp: "Create your account",
    verify: "Verify your email",
    forgot: "Reset your password",
    reset: "Enter your reset code",
  }[screen];
  const subtitle = {
    signIn: "Sign in to view your loads and tickets.",
    signUp: "Your driver data stays private to your account.",
    verify: `Enter the eight-digit code sent to ${email || "your email"}.`,
    forgot: "We’ll email you a secure reset code.",
    reset: `Enter the code sent to ${email || "your email"} and choose a new password.`,
  }[screen];

  return (
    <FullScreen>
      <div className="auth-card">
        <div className="auth-brand">DriverPay <span>Pro</span></div>
        <div className="auth-kicker">SECURE DRIVER ACCOUNT</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <form onSubmit={run}>
          <label>Email</label>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {credentials && (
            <>
              <label>Password</label>
              <input
                name="password"
                type="password"
                autoComplete={screen === "signUp" ? "new-password" : "current-password"}
                minLength={8}
                required
              />
            </>
          )}
          {(screen === "verify" || screen === "reset") && (
            <>
              <label>Verification code</label>
              <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required />
            </>
          )}
          {screen === "reset" && (
            <>
              <label>New password</label>
              <input name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
            </>
          )}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-primary" disabled={busy}>
            {busy ? "Please wait…" : screen === "signIn" ? "Sign In" : screen === "signUp" ? "Create Account" : screen === "forgot" ? "Send Reset Code" : screen === "verify" ? "Verify Email" : "Reset Password"}
          </button>
        </form>
        <div className="auth-links">
          {screen === "signIn" && <button onClick={() => setScreen("forgot")}>Forgot password?</button>}
          {screen === "signIn" && <button onClick={() => setScreen("signUp")}>Create account</button>}
          {screen === "signUp" && <button onClick={() => setScreen("signIn")}>I already have an account</button>}
          {(screen === "forgot" || screen === "reset" || screen === "verify") && <button onClick={() => setScreen("signIn")}>Back to sign in</button>}
        </div>
      </div>
    </FullScreen>
  );
}

function DriverProfileForm({ profile, email, onDone }) {
  const saveProfile = useMutation(cloudApi.profiles.complete);
  const fleet = useQuery(cloudApi.profiles.availableTrucks, {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [truckNumber, setTruckNumber] = useState(profile?.truckNumber || "");

  useEffect(() => {
    if (!fleet) return;
    setTruckNumber((current) => {
      if (fleet.trucks.includes(current)) return current;
      if (fleet.assignedTruck && fleet.trucks.includes(fleet.assignedTruck)) {
        return fleet.assignedTruck;
      }
      if (profile?.truckNumber && fleet.trucks.includes(profile.truckNumber)) {
        return profile.truckNumber;
      }
      return fleet.trucks[0] || "";
    });
  }, [fleet, profile?.truckNumber]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await saveProfile({
        fullName: String(data.get("fullName") || ""),
        phone: String(data.get("phone") || ""),
        company: "JLP Trucking",
        truckNumber,
      });
      onDone?.();
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="profile-form" onSubmit={submit}>
      <label>Email</label>
      <input value={email} disabled />
      <label>Full name</label>
      <input name="fullName" defaultValue={profile?.fullName || ""} autoComplete="name" required />
      <label>Phone</label>
      <input name="phone" type="tel" defaultValue={profile?.phone || ""} autoComplete="tel" required />
      <label>Trucking company</label>
      <input value="JLP Trucking" disabled />
      <label>Truck number</label>
      <select
        name="truckNumber"
        value={truckNumber}
        onChange={(event) => setTruckNumber(event.target.value)}
        disabled={fleet === undefined || fleet.trucks.length === 0}
        required
      >
        {fleet === undefined && <option value="">Loading available trucks…</option>}
        {fleet?.trucks.length === 0 && <option value="">No trucks are currently available</option>}
        {fleet?.trucks.map((truck) => <option key={truck} value={truck}>{truck === "None" ? "None" : `Truck ${truck}`}</option>)}
      </select>
      <small className="profile-field-note">Only trucks that are not assigned to another driver are shown.</small>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-primary" disabled={busy || fleet === undefined || !truckNumber}>{busy ? "Saving…" : "Save Profile"}</button>
    </form>
  );
}

function ProfileGate({ profileState }) {
  return (
    <FullScreen>
      <div className="auth-card">
        <div className="auth-brand">DriverPay <span>Pro</span></div>
        <div className="auth-kicker">DRIVER PROFILE</div>
        <h1>Finish your profile</h1>
        <p>These details keep every driver’s account and tickets organized separately.</p>
        <DriverProfileForm email={profileState.user?.email || ""} />
      </div>
    </FullScreen>
  );
}

function AccountModal({ profileState, onClose }) {
  return (
    <div className="cloud-modal" role="dialog" aria-modal="true" aria-label="Driver profile">
      <div className="cloud-panel cloud-panel--compact">
        <div className="cloud-panel-head">
          <div><div className="auth-kicker">ACCOUNT</div><h2>Driver Profile</h2></div>
          <button className="cloud-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <DriverProfileForm
          profile={profileState.profile}
          email={profileState.user?.email || ""}
          onDone={onClose}
        />
      </div>
    </div>
  );
}

function AdminDriverDetails({ userId }) {
  const state = useQuery(cloudApi.admin.getDriverState, userId ? { userId } : "skip");
  if (!userId) return <div className="admin-empty">Select a driver to view their records.</div>;
  if (state === undefined) return <div className="admin-empty">Loading driver records…</div>;
  const totals = driverTotals(state.history);
  return (
    <div className="admin-details">
      <div className="admin-profile-line">
        <strong>{state.profile?.fullName}</strong>
        <span>{state.profile?.email}</span>
        <span>{state.profile?.company} · {truckLabel(state.profile?.truckNumber)}</span>
      </div>
      <div className="admin-stat-grid">
        <div><strong>{totals.settlements}</strong><span>Settlements</span></div>
        <div><strong>{totals.loads}</strong><span>Loads</span></div>
        <div><strong>{totals.tickets}</strong><span>Tickets</span></div>
        <div><strong>${totals.pay.toFixed(2)}</strong><span>Driver Pay</span></div>
      </div>
      <div className="admin-settlements">
        {state.history.map((settlement) => (
          <section key={settlement.id}>
            <h3>Settlement {settlement.payoutDate}</h3>
            {settlement.loads.map((load) => (
              <div className="admin-load" key={load.id}>
                <div><strong>{load.miles} mi · {load.tons} tons</strong><span>{load.day} · ${(Number(load.calculatedPay) || 0).toFixed(2)}</span></div>
                {load.note && <p>{load.note}</p>}
                <div className="admin-tickets">
                  {(load.documents || []).map((ticket) => (
                    <a key={ticket.id} href={ticket.processed} target="_blank" rel="noreferrer">
                      <img src={ticket.processed} alt={`Ticket ${ticket.ocr?.ticketNumber || "photo"}`} />
                      <span>{ticket.ocr?.ticketNumber ? `#${ticket.ocr.ticketNumber}` : "View ticket"}</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
        {!state.history.length && <div className="admin-empty">This driver has no cloud records yet.</div>}
      </div>
    </div>
  );
}

function AdminWorkspace() {
  const drivers = useQuery(cloudApi.admin.listDrivers, {});
  const [expandedDriver, setExpandedDriver] = useState(null);

  return (
    <div className="admin-layout">
      <aside className="admin-driver-list">
        {drivers === undefined && <div className="admin-empty">Loading drivers…</div>}
        {drivers?.map((driver) => {
          const expanded = expandedDriver === driver.userId;
          const detailId = `admin-driver-${driver.userId}`;
          return (
            <section key={driver.userId} className={`admin-driver-card${expanded ? " expanded" : ""}`}>
              <button
                className="admin-driver-summary"
                onClick={() => setExpandedDriver(expanded ? null : driver.userId)}
                aria-expanded={expanded}
                aria-controls={detailId}
              >
                <span className="admin-driver-copy">
                  <strong>{driver.fullName}</strong>
                  <span>{driver.company} · {truckLabel(driver.truckNumber)}</span>
                  <small>{driver.loadCount} loads · {driver.ticketCount} tickets</small>
                </span>
                <span className="admin-driver-pay">
                  <small>Total Driver Pay</small>
                  <strong>${(Number(driver.totalPay) || 0).toFixed(2)}</strong>
                </span>
                <span className="admin-driver-chevron" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
              {expanded && (
                <div className="admin-driver-expanded" id={detailId}>
                  <AdminDriverDetails userId={driver.userId} />
                </div>
              )}
            </section>
          );
        })}
        {drivers?.length === 0 && <div className="admin-empty">No driver accounts yet.</div>}
      </aside>
    </div>
  );
}

function AdminModal({ onClose }) {
  return (
    <div className="cloud-modal" role="dialog" aria-modal="true" aria-label="Fleet administration">
      <div className="cloud-panel">
        <div className="cloud-panel-head">
          <div><div className="auth-kicker">ADMIN</div><h2>Driver Accounts</h2></div>
          <button className="cloud-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <AdminWorkspace />
      </div>
    </div>
  );
}

function AdminHelpModal({ onClose }) {
  return (
    <div className="cloud-modal" role="dialog" aria-modal="true" aria-label="Admin dashboard help">
      <div className="cloud-panel cloud-panel--compact admin-help-panel">
        <div className="cloud-panel-head">
          <div><div className="auth-kicker">HELP</div><h2>Admin Dashboard</h2></div>
          <button className="cloud-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="admin-help-content">
          <section><strong>Expand a driver</strong><p>Tap a driver card to review their profile, settlements, loads, pay totals, and uploaded tickets.</p></section>
          <section><strong>Open a ticket</strong><p>Tap any ticket thumbnail to open the stored image at full size.</p></section>
          <section><strong>Automatic updates</strong><p>The dashboard refreshes automatically when drivers synchronize new records.</p></section>
        </div>
      </div>
    </div>
  );
}

function AdminHome({ profileState }) {
  const { signOut } = useAuthActions();
  const [accountOpen, setAccountOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const logout = async () => {
    setMenuOpen(false);
    window.driverPayClearLocalData?.();
    await signOut();
  };

  return (
    <div className="admin-home">
      <div className="admin-home-shell">
        <header className="admin-home-header">
          <div>
            <div className="auth-brand">DriverPay <span>Pro</span></div>
            <div className="admin-home-title"><span>ADMIN</span> Fleet Dashboard</div>
          </div>
          <div className="admin-home-actions">
            <div className="admin-home-account">
              <strong>{profileState.profile.fullName}</strong>
              <span>{profileState.user?.email}</span>
            </div>
            <div className="menu-container">
              <button
                className="menu-btn"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Admin menu"
                aria-expanded={menuOpen}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              {menuOpen && (
                <>
                  <div className="menu-popover active">
                    <div className="cloud-menu-section">
                      <div className="cloud-menu-account">
                        <strong>{profileState.profile.fullName}</strong>
                        <span>Administrator</span>
                      </div>
                      <button className="menu-item" onClick={() => setMenuOpen(false)}>
                        <span className="menu-item-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 11 12 3l9 8" /><path d="M5 10v11h14V10" /><path d="M9 21v-7h6v7" />
                          </svg>
                        </span>
                        Dashboard
                      </button>
                      <button className="menu-item" onClick={() => { setMenuOpen(false); setAccountOpen(true); }}>
                        <span className="menu-item-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
                          </svg>
                        </span>
                        Account
                      </button>
                    </div>
                    <button className="menu-item" onClick={() => window.location.reload()}>
                      <span className="menu-item-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10" /><path d="M20.49 15A9 9 0 1 1 18.36 5.64L23 10" />
                        </svg>
                      </span>
                      Refresh Dashboard
                    </button>
                    <button className="menu-item" onClick={() => { setMenuOpen(false); setHelpOpen(true); }}>
                      <span className="menu-item-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </span>
                      Help
                    </button>
                    <button className="menu-item cloud-signout" onClick={logout}>
                      <span className="menu-item-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        </svg>
                      </span>
                      Sign Out
                    </button>
                  </div>
                  <button className="menu-backdrop active" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
                </>
              )}
            </div>
          </div>
        </header>
        <main className="admin-home-panel">
          <div className="admin-home-panel-head">
            <div><div className="auth-kicker">DRIVERS</div><h1>Driver Accounts</h1></div>
            <p>Review every driver’s loads, pay, and uploaded tickets.</p>
          </div>
          <AdminWorkspace />
        </main>
      </div>
      {accountOpen && <AccountModal profileState={profileState} onClose={() => setAccountOpen(false)} />}
      {helpOpen && <AdminHelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function CloudSession({ profileState }) {
  const { signOut } = useAuthActions();
  const cloudState = useQuery(cloudApi.sync.getMyState, {});
  const saveSnapshot = useMutation(cloudApi.sync.saveSnapshot);
  const generateUploadUrl = useMutation(cloudApi.sync.generateTicketUploadUrl);
  const saveTicketRead = useMutation(cloudApi.sync.applyTicketRead);
  const readingTicket = useRef(false);
  const attemptedReads = useRef(new Map());
  const readerMounted = useRef(false);
  const [readTick, setReadTick] = useState(0);
  useEffect(() => { readerMounted.current = true; return () => { readerMounted.current = false; }; }, []);
  useEffect(() => {
    const retry = () => { attemptedReads.current.clear(); setReadTick(value => value + 1); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);
  const [syncStatus, setSyncStatus] = useState("Connecting…");
  const [accountOpen, setAccountOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const hydrated = useRef(false);
  const saving = useRef(false);
  const dirty = useRef(false);
  const timer = useRef(null);

  const applyRemote = useCallback((state) => {
    if (!state?.profile || typeof window.driverPayApplyCloudSnapshot !== "function") return;
    window.driverPayApplyCloudSnapshot(state.history, state.profile);
    setSyncStatus("Cloud synced");
  }, []);

  useEffect(() => {
    if (!cloudState?.profile) return;
    if (!hydrated.current) {
      applyRemote(cloudState);
      hydrated.current = true;
      return;
    }
    if (!saving.current && !dirty.current) applyRemote(cloudState);
  }, [cloudState, applyRemote]);

  // Includes tickets captured on an older app or while the reader was offline.
  // Never rewrite a whole account snapshot when just a ticket read completes.
  useEffect(() => {
    if (!cloudState?.profile || readingTicket.current || !navigator.onLine) return;
    const documents = cloudState.history.flatMap(s => s.loads.flatMap(l => l.documents || []));
    const waiting = documents.filter(d => d.storageId && d.ticketRead?.version !== READER_VERSION);
    const next = waiting.find(d =>
      Date.now() - (attemptedReads.current.get(d.storageId) || 0) > 60000);
    if (!next) {
      if (!waiting.length) return;
      const retry = setTimeout(() => setReadTick(value => value + 1), 61000);
      return () => clearTimeout(retry);
    }
    readingTicket.current = true;
    attemptedReads.current.set(next.storageId, Date.now());
    readTicket(next.processed || next.original).then(async result => {
      if (readerMounted.current) await saveTicketRead({ clientId: String(next.id), storageId: next.storageId, result });
    }).catch(() => {}).finally(() => {
      readingTicket.current = false;
      if (readerMounted.current) setReadTick(value => value + 1);
    });
  }, [cloudState, saveTicketRead, readTick]);

  const syncNow = useCallback(async () => {
    if (!hydrated.current || saving.current || typeof window.driverPayReadLocalSnapshot !== "function") return;
    saving.current = true;
    dirty.current = false;
    setSyncStatus("Syncing…");
    try {
      const local = window.driverPayReadLocalSnapshot();
      const uploaded = await uploadPendingTicketImages(local.history, generateUploadUrl);
      if (uploaded.changed) {
        window.__driverPayCloudSuppress = true;
        try {
          window.__driverPayNativeSetItem("driver_history", JSON.stringify(uploaded.history));
        } finally {
          window.__driverPayCloudSuppress = false;
        }
      }
      await saveSnapshot(buildSnapshot(uploaded.history, local.settings));
      window.__driverPayNativeSetItem?.("driverpay_doc_sync_queue", "[]");
      setSyncStatus("Cloud synced");
    } catch (error) {
      console.error("[DriverPay cloud]", error);
      dirty.current = true;
      setSyncStatus(navigator.onLine ? "Sync needs attention" : "Saved offline");
    } finally {
      saving.current = false;
      if (dirty.current && navigator.onLine) {
        clearTimeout(timer.current);
        timer.current = setTimeout(syncNow, 1200);
      }
    }
  }, [generateUploadUrl, saveSnapshot]);

  useEffect(() => {
    const localChange = () => {
      if (!hydrated.current) return;
      dirty.current = true;
      setSyncStatus(navigator.onLine ? "Waiting to sync…" : "Saved offline");
      clearTimeout(timer.current);
      timer.current = setTimeout(syncNow, 700);
    };
    const online = () => {
      if (dirty.current) syncNow();
    };
    window.addEventListener("driverpay:local-change", localChange);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("driverpay:local-change", localChange);
      window.removeEventListener("online", online);
      clearTimeout(timer.current);
    };
  }, [syncNow]);

  const logout = async () => {
    if (dirty.current && navigator.onLine) await syncNow();
    window.driverPayClearLocalData?.();
    await signOut();
  };

  const menuRoot = document.getElementById("cloudMenuRoot");
  return (
    <>
      {menuRoot && createPortal(
        <div className="cloud-menu-section">
          <div className="cloud-menu-account">
            <strong>{profileState.profile.fullName}</strong>
            <span>{syncStatus}</span>
          </div>
          <button className="menu-item" onClick={() => { window.closeMenu?.(); setAccountOpen(true); }}>
            <span className="menu-item-icon cloud-user-icon">●</span>Account
          </button>
          {profileState.profile.role === "admin" && (
            <button className="menu-item" onClick={() => { window.closeMenu?.(); setAdminOpen(true); }}>
              <span className="menu-item-icon cloud-admin-icon">A</span>Admin View
            </button>
          )}
          <button className="menu-item cloud-signout" onClick={logout}>
            <span className="menu-item-icon">↪</span>Sign Out
          </button>
        </div>,
        menuRoot,
      )}
      {accountOpen && <AccountModal profileState={profileState} onClose={() => setAccountOpen(false)} />}
      {adminOpen && <AdminModal onClose={() => setAdminOpen(false)} />}
    </>
  );
}

function AuthenticatedApp() {
  const profileState = useQuery(cloudApi.profiles.current, {});
  if (profileState === undefined) return <LoadingGate />;
  if (!profileState.profile) return <ProfileGate profileState={profileState} />;
  if (profileState.profile.role === "admin") return <AdminHome profileState={profileState} />;
  return <CloudSession profileState={profileState} />;
}

function Root() {
  return (
    <>
      <AuthLoading><LoadingGate /></AuthLoading>
      <Unauthenticated><AuthScreen /></Unauthenticated>
      <Authenticated><AuthenticatedApp /></Authenticated>
    </>
  );
}

const root = createRoot(document.getElementById("convexAuthRoot"));
if (!convexUrl) {
  root.render(
    <FullScreen>
      <div className="auth-card"><div className="auth-brand">DriverPay <span>Pro</span></div><h1>Cloud setup required</h1><p>The VITE_CONVEX_URL deployment variable is missing.</p></div>
    </FullScreen>,
  );
} else {
  const client = new ConvexReactClient(convexUrl);
  root.render(<ConvexAuthProvider client={client}><Root /></ConvexAuthProvider>);
}
