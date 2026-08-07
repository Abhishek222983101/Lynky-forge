import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowRight,
  Books,
  Briefcase,
  Broadcast,
  ChartLineUp,
  CheckCircle,
  CircleNotch,
  Coins,
  FileText,
  HouseLine,
  ImageSquare,
  List,
  ListMagnifyingGlass,
  Microphone,
  Package,
  Receipt,
  ShieldCheck,
  Sparkle,
  Storefront,
  UserCircle,
  UsersThree,
  WhatsappLogo,
  Wrench,
} from "@phosphor-icons/react";
import brandMark from "./assets/sornam-ai-mark.svg";
import { GeminiLiveClient, type LiveCard } from "./gemini-live";
import { io } from "socket.io-client";
import "./styles.css";

type Role = "admin" | "owner" | "salesperson" | "workshop_manager";

type ApiUser = {
  id: string;
  shopId: string | null;
  fullName: string;
  email: string;
  role: Role;
};

type LoginResponse = {
  accessToken: string;
  user: ApiUser;
};

/**
 * One shop user, one token. Roles come from the server, not from which button
 * you pressed. Provisioning (creating shops and staff) is a back-office job and
 * lives behind the dev-only setup screen, never in the shop user's app.
 */
type SessionState = {
  token: string;
  user?: ApiUser;
  shopId: string;
  shopName: string;
  voiceSessionId: string;
};

type VoiceResponse = {
  sessionId: string;
  status: string;
  confirmationMessage?: string;
  extractedPayload?: unknown;
};

type Activity = {
  type: "ok" | "bad" | "info";
  text: string;
};

type Screen =
  | "home"
  | "speak"
  | "cockpit"
  | "sales"
  | "invoices"
  | "inventory"
  | "karigar"
  | "buyback"
  | "content"
  | "customers"
  | "repairs"
  | "schemes"
  | "rates"
  | "accounting"
  | "audit"
  | "scanbill"
  | "whatsapp"
  | "team"
  | "setup";

const defaultTranscript = "Sold 22 carat chain 18.5 grams making 12 percent to Lakshmi. Received 50000 cash rest pending.";

const supportedQuestions = [
  "How much did we sell today and who has not paid?",
  "Show pending payments",
  "Cash collected today",
  "Stock count summary",
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function money(value: unknown) {
  const numberValue = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numberValue) ? numberValue : 0);
}

function textValue(value: unknown, fallback = "Not available") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

const SESSION_KEY = "sornam.session";
const emptySession: SessionState = { token: "", shopId: "", shopName: "", voiceSessionId: "" };

/** Restore the signed-in session so a page refresh does not sign the shop out. */
function loadSession(): SessionState {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return emptySession;
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    if (!parsed.token) return emptySession;
    return { ...emptySession, ...parsed, voiceSessionId: "" };
  } catch {
    return emptySession;
  }
}

function saveSession(session: SessionState) {
  try {
    if (!session.token) window.localStorage.removeItem(SESSION_KEY);
    else window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private mode or storage disabled: session simply stays in memory.
  }
}

/** Shop staff should never read a raw API error. Translate the ones we expect. */
function humanAuthError(raw: string) {
  if (/invalid|credential|unauthor|401/i.test(raw)) return "Wrong email or password. Please try again.";
  if (/fetch|network|failed to fetch/i.test(raw)) return "Cannot reach Sornam. Check your internet and try again.";
  return "Sign in failed. Please try again.";
}

// Shop-owner language, not module names. One source drives the sidebar, the
// phone bottom-bar, and the "More" sheet so they never drift.
type NavItem = { screen: Screen; label: string; icon: React.ReactNode; featured?: boolean };
const EVERYDAY_NAV: NavItem[] = [
  { screen: "home", label: "Home", icon: <HouseLine weight="bold" /> },
  { screen: "speak", label: "Speak", icon: <Microphone weight="bold" />, featured: true },
  { screen: "invoices", label: "Sales & bills", icon: <Receipt weight="bold" /> },
  { screen: "inventory", label: "Stock", icon: <Package weight="bold" /> },
];
const MORE_NAV: NavItem[] = [
  { screen: "cockpit", label: "Reports", icon: <ChartLineUp weight="bold" /> },
  { screen: "customers", label: "Customers", icon: <UserCircle weight="bold" /> },
  { screen: "repairs", label: "Repairs", icon: <Wrench weight="bold" /> },
  { screen: "karigar", label: "Workshop", icon: <Wrench weight="bold" /> },
  { screen: "schemes", label: "Schemes", icon: <Books weight="bold" /> },
  { screen: "buyback", label: "Old gold", icon: <Coins weight="bold" /> },
  { screen: "rates", label: "Gold rate", icon: <Coins weight="bold" /> },
  { screen: "content", label: "Posts", icon: <ImageSquare weight="bold" /> },
  { screen: "whatsapp", label: "WhatsApp", icon: <WhatsappLogo weight="bold" /> },
  { screen: "scanbill", label: "Scan bill", icon: <Receipt weight="bold" /> },
  { screen: "accounting", label: "Accounting", icon: <FileText weight="bold" /> },
  { screen: "audit", label: "Audit books", icon: <Books weight="bold" /> },
  { screen: "team", label: "Staff", icon: <UsersThree weight="bold" /> },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export default function App() {
  // Deployment config, not a user-facing setting. A shop owner never sees this.
  const [apiBase, setApiBase] = useState(
    (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:3000/api/v1"
  );
  // Persist the active screen so a refresh keeps you where you were.
  const [screen, setScreen] = useState<Screen>(() => (window.localStorage.getItem("sornam.screen") as Screen) || "home");
  useEffect(() => { window.localStorage.setItem("sornam.screen", screen); }, [screen]);
  const [moreOpen, setMoreOpen] = useState(false);
  // Navigate and always close the phone "More" sheet.
  const go = (next: Screen) => { setScreen(next); setMoreOpen(false); };
  const suffix = useMemo(() => new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12), []);
  // Survives a refresh. Without this every reload dumps the user back to sign in.
  const [state, setState] = useState<SessionState>(() => loadSession());
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  // Dev-only provisioning session, deliberately separate from the shop user's.
  const [devSetup, setDevSetup] = useState(false);
  const [provisionToken, setProvisionToken] = useState("");
  const [provisionShopId, setProvisionShopId] = useState("");
  const [adminEmail, setAdminEmail] = useState("admin@sornam.local");
  const [adminPassword, setAdminPassword] = useState("local-admin-password");
  const [shopName, setShopName] = useState("Sornam T Nagar");
  const [ownerEmail, setOwnerEmail] = useState(`owner-${suffix}@sornam.local`);
  const [salesEmail, setSalesEmail] = useState(`sales-${suffix}@sornam.local`);
  const [staffPassword, setStaffPassword] = useState("local-staff-password");
  const [transcript, setTranscript] = useState(defaultTranscript);
  const [question, setQuestion] = useState(supportedQuestions[0]);
  const [confirmation, setConfirmation] = useState<VoiceResponse | null>(null);
  const [saleResult, setSaleResult] = useState<Record<string, unknown> | null>(null);
  const [salesSummary, setSalesSummary] = useState<Record<string, unknown> | null>(null);
  const [cockpitResult, setCockpitResult] = useState<Record<string, unknown> | null>(null);
  const [inventoryItems, setInventoryItems] = useState<Array<Record<string, unknown>>>([]);
  const [inventorySummary, setInventorySummary] = useState<Record<string, unknown> | null>(null);
  const [slowStock, setSlowStock] = useState<Array<Record<string, unknown>>>([]);
  const [karigars, setKarigars] = useState<Array<Record<string, unknown>>>([]);
  const [karigarJobs, setKarigarJobs] = useState<Array<Record<string, unknown>>>([]);
  const [karigarScorecard, setKarigarScorecard] = useState<Record<string, unknown> | null>(null);
  const [contentRequests, setContentRequests] = useState<Array<Record<string, unknown>>>([]);
  const [contentAssets, setContentAssets] = useState<Array<Record<string, unknown>>>([]);
  const [reviewBusyId, setReviewBusyId] = useState("");
  const [publishBusyId, setPublishBusyId] = useState("");
  const [social, setSocial] = useState<{ connected: boolean; provider: string | null; profiles: SocialProfile[] }>({
    connected: false,
    provider: null,
    profiles: [],
  });
  const [genForm, setGenForm] = useState({ text: "Elegant 22K gold temple necklace for Diwali", occasion: "Diwali", category: "necklace", requestedType: "both", language: "en", inventoryItemId: "" });
  const [genPhoto, setGenPhoto] = useState("");
  const [genId, setGenId] = useState("");
  // Gold rate
  const [rateForm, setRateForm] = useState({ metal: "gold", purity: "22K", ratePerUnit: "", unit: "gram" });
  const [rates, setRates] = useState<Array<Record<string, unknown>>>([]);
  const [livePrice, setLivePrice] = useState<Record<string, unknown> | null>(null);
  // Sales
  const [salesForm, setSalesForm] = useState({ customerName: "", customerPhone: "", itemName: "", purity: "22K", grossWeight: "", netWeight: "", goldRatePerGram: "", makingChargeValue: "0", amountPaid: "0", paymentMethod: "cash" });
  const [salesList, setSalesList] = useState<Array<Record<string, unknown>>>([]);
  // Buyback
  const [buybackItemForm, setBuybackItemForm] = useState({ itemName: "", testedPurity: "22K", assignedPurity: "22K", weight: "", ratePerGram: "", notes: "" });
  const [buybackItems, setBuybackItems] = useState<Array<Record<string, unknown>>>([]);
  const [buybackBundleForm, setBuybackBundleForm] = useState({ metal: "gold", purity: "22K", ratePerGram: "" });
  const [buybackBundles, setBuybackBundles] = useState<Array<Record<string, unknown>>>([]);
  const [buybackSummary, setBuybackSummary] = useState<Record<string, unknown> | null>(null);
  // Customers
  const [customerForm, setCustomerForm] = useState({ fullName: "", phone: "", customerType: "retail", preferredLanguage: "", notes: "" });
  const [customers, setCustomers] = useState<Array<Record<string, unknown>>>([]);
  const [followUps, setFollowUps] = useState<Array<Record<string, unknown>>>([]);
  // Repairs
  const [repairForm, setRepairForm] = useState({ customerId: "", itemDescription: "", purity: "22K", expectedDate: "", notes: "" });
  const [repairs, setRepairs] = useState<Array<Record<string, unknown>>>([]);
  const [repairStatusForm, setRepairStatusForm] = useState({ repairOrderId: "", status: "in_workshop", notes: "" });
  // Schemes
  const [schemeForm, setSchemeForm] = useState({ customerId: "", monthlyAmount: "", months: "11", startDate: "", notes: "" });
  const [schemes, setSchemes] = useState<Array<Record<string, unknown>>>([]);
  const [installmentForm, setInstallmentForm] = useState({ schemeId: "", amount: "", paymentMethod: "cash", referenceNumber: "" });
  // Accounting
  const [exportForm, setExportForm] = useState({ provider: "tally", exportType: "sales_invoices", dateFrom: "", dateTo: "" });
  const [exportsList, setExportsList] = useState<Array<Record<string, unknown>>>([]);
  // Audit books
  const [auditBooks, setAuditBooks] = useState<Array<Record<string, unknown>>>([]);
  const [auditSummary, setAuditSummary] = useState<Record<string, unknown> | null>(null);
  // Scan bill
  const [scanForm, setScanForm] = useState({ rawText: "" });
  const [scanJobs, setScanJobs] = useState<Array<Record<string, unknown>>>([]);
  const [scanConfirmId, setScanConfirmId] = useState("");
  // Invoice PDF
  const [pdfInvoiceId, setPdfInvoiceId] = useState("");
  // Access grants
  const [accessForm, setAccessForm] = useState({ userId: "", section: "invoices", canAccess: true });
  const [accessList, setAccessList] = useState<Array<Record<string, unknown>>>([]);
  // Customer import + wholesale
  const [custImportText, setCustImportText] = useState("");
  const [wholesaleForm, setWholesaleForm] = useState({ customerId: "", metal: "gold", ornamentType: "", quantityWeight: "", orderValue: "", paymentStatus: "pending" });
  const [wholesaleOrders, setWholesaleOrders] = useState<Array<Record<string, unknown>>>([]);
  // Accounting download
  const [exportDownloadId, setExportDownloadId] = useState("");
  // Audit toggle
  const [auditForm, setAuditForm] = useState({ saleId: "", invoiceId: "", status: "included", notes: "" });
  // Detail views
  const [saleDetail, setSaleDetail] = useState<Record<string, unknown> | null>(null);
  const [saleDetailId, setSaleDetailId] = useState("");
  const [repairDetail, setRepairDetail] = useState<Record<string, unknown> | null>(null);
  const [repairDetailId, setRepairDetailId] = useState("");
  const [lastResult, setLastResult] = useState<{ status: number; body: unknown } | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [sttLang, setSttLang] = useState("en-IN");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  // Live speech-to-speech (Gemini via the server proxy).
  const [liveOn, setLiveOn] = useState(false);
  const [liveStatus, setLiveStatus] = useState("");
  const [liveTurns, setLiveTurns] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [liveCard, setLiveCard] = useState<LiveCard | null>(null);
  const liveClientRef = useRef<GeminiLiveClient | null>(null);
  const transcriptBufRef = useRef<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const flushTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  const [inventoryForm, setInventoryForm] = useState({
    sku: `TN-${suffix}`,
    name: "22K Antique Chain",
    category: "Chain",
    purity: "22K",
    grossWeight: "18.5",
    netWeight: "18.5",
    estimatedValue: "142300",
    location: "Front counter",
    photoUrl: "",
  });
  const [movementForm, setMovementForm] = useState({
    inventoryItemId: "",
    movementType: "adjustment",
    weight: "18.5",
    notes: "Counter stock audit",
  });
  const [karigarForm, setKarigarForm] = useState({
    name: "Ravi Workshop",
    phone: "9876543210",
    specialization: "Chains and bangles",
  });
  const [jobForm, setJobForm] = useState({
    karigarId: "",
    inventoryItemId: "",
    itemDescription: "22K chain repair",
    purity: "22K",
    issuedWeight: "12.25",
    dueDate: "",
  });
  const [returnForm, setReturnForm] = useState({
    jobId: "",
    finishedWeight: "12.00",
    scrapWeight: "0.25",
    notes: "Returned with expected loss",
  });
  const [contentForm, setContentForm] = useState({
    inventoryItemId: "",
    occasion: "Akshaya Tritiya",
    prompt: "Create an elegant product post for this jewellery item.",
  });

  const api = apiBase.replace(/\/$/, "");
  // Where the API serves generated images (the /media route, no /api/v1 prefix).
  // We display gallery images from here (local, always reachable) even though the
  // asset's stored URL may be a public tunnel used only for publishing.
  const mediaOrigin = api.replace(/\/api\/v\d+$/, "");
  const signedIn = Boolean(state.token);
  // Owners can do everything a salesperson can, plus the cockpit.
  const readyForOwner = signedIn && state.user?.role === "owner";
  const readyForSales = signedIn && Boolean(state.shopId);
  const sale = asRecord(saleResult?.sale);
  const invoice = asRecord(saleResult?.invoice ?? sale.invoice);
  const payment = asRecord(saleResult?.payment ?? asList(sale.payments)[0]);
  const pendingPayment = asRecord(saleResult?.pendingPayment ?? sale.pendingPayment);
  const currentRole = state.user?.role ?? "not signed in";

  function note(text: string, type: Activity["type"] = "info") {
    setActivity((items) => [{ type, text: `${new Date().toLocaleTimeString()} ${text}` }, ...items].slice(0, 9));
  }

  async function call(path: string, options: RequestInit = {}) {
    const response = await fetch(`${api}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    const raw = await response.text();
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = raw;
    }
    setLastResult({ status: response.status, body });
    if (!response.ok) {
      throw new Error(typeof body === "string" ? body : JSON.stringify(body));
    }
    return body;
  }

  async function run(label: string, task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
      note(label, "ok");
    } catch (error) {
      note(`${label}: ${error instanceof Error ? error.message : "failed"}`, "bad");
    } finally {
      setBusy(false);
    }
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Fetch an auth-protected file (PDF, CSV export) and open it - a plain link
   * can't send the Bearer header, so we pull a blob and open an object URL. */
  async function downloadFile(path: string) {
    const response = await fetch(`${api}${path}`, { headers: auth(state.token) });
    if (!response.ok) throw new Error(await response.text());
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function loadAccess() {
    setAccessList(rowsOf(await call("/access", { headers: auth(state.token) })));
  }
  async function loadWholesale() {
    setWholesaleOrders(rowsOf(await call("/customers/wholesale/orders", { headers: auth(state.token) })));
  }

  /** Admins belong to no shop, so an empty name here is expected, not an error. */
  async function fetchShopName(token: string) {
    try {
      const response = await fetch(`${api}/shops/current`, { headers: auth(token) });
      if (!response.ok) return "";
      const body = await response.json();
      return typeof body?.name === "string" ? body.name : "";
    } catch {
      return "";
    }
  }

  // The only way into the app. One call, one token, role decided by the server.
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoginError("");
    setBusy(true);
    try {
      const body = asRecord(await call("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      })) as unknown as LoginResponse;
      if (!body.accessToken) throw new Error("Sign in failed");
      const next: SessionState = {
        token: body.accessToken,
        user: body.user,
        shopId: body.user.shopId ?? "",
        shopName: await fetchShopName(body.accessToken),
        voiceSessionId: "",
      };
      setState(next);
      saveSession(next);
      setLoginPassword("");
      setScreen("home");
      note(`Signed in as ${body.user.fullName}`, "ok");
    } catch (error) {
      setLoginError(error instanceof Error ? humanAuthError(error.message) : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    stopLive();
    setState(emptySession);
    saveSession(emptySession);
    setConfirmation(null);
    setSaleResult(null);
    // These hold the previous user's API payloads (login response included).
    // A shared counter terminal must not leak them to whoever signs in next.
    setLastResult(null);
    setActivity([]);
    setSalesSummary(null);
    setCockpitResult(null);
    setDevSetup(false);
    setScreen("home");
  }

  // A restored token can be expired. Verify it once on load, and refresh the
  // shop name while we are there, so the sidebar is never stale.
  // Real-time gold feed for the topbar ticker and the Gold Rate board. Connects to
  // the Sornam Price socket (price:update = real, price:tick = per-second shimmer),
  // seeded from the Sornam API so a rate shows before the socket connects.
  useEffect(() => {
    if (!state.token) return;
    let cancelled = false;
    fetch(`${api}/metal-rates/board`, { headers: auth(state.token) })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!cancelled && b && asRecord(b).available) setLivePrice((d) => d ?? asRecord(asRecord(b).board)); })
      .catch(() => { /* socket will fill in */ });
    const socket = io(PRICE_WS, { transports: ["websocket", "polling"] });
    socket.on("price:update", (p: Record<string, unknown>) => setLivePrice(p));
    socket.on("price:tick", (p: Record<string, unknown>) => setLivePrice(p));
    return () => { cancelled = true; socket.close(); };
  }, [state.token, api]);

  // Handle the Meta OAuth redirect back into the app (?social=connected|error|...).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const social = params.get("social");
    if (!social) return;
    if (params.get("screen") === "content") setScreen("content");
    const messages: Record<string, [string, Activity["type"]]> = {
      connected: ["Social account connected", "ok"],
      denied: ["Connection cancelled", "info"],
      noprofiles: ["No Instagram Business or Facebook Page found on that account", "bad"],
      error: ["Could not connect the social account", "bad"],
    };
    const entry = messages[social];
    if (entry) note(entry[0], entry[1]);
    if (social === "connected" && state.token) loadSocialStatus();
    window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the connected-socials state on every page load / refresh, so a
  // connection persists in the UI until the owner explicitly disconnects.
  useEffect(() => {
    if (state.token) loadSocialStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.token]);

  // Auto-load the active screen's data on refresh and when navigating, so a
  // refresh never leaves a screen empty — its server data is fetched again.
  useEffect(() => {
    if (!state.token) return;
    const loaders: Partial<Record<Screen, () => Promise<unknown> | void>> = {
      home: loadSalesSummary,
      cockpit: loadSalesSummary,
      rates: loadRates,
      sales: loadSales,
      inventory: loadInventory,
      karigar: loadKarigars,
      buyback: loadBuyback,
      content: loadContentRequests,
      customers: loadCustomers,
      repairs: loadRepairs,
      schemes: loadSchemes,
      accounting: loadExports,
      audit: loadAudit,
      scanbill: loadScanJobs,
      team: loadAccess,
    };
    const loader = loaders[screen];
    if (loader) Promise.resolve(loader()).catch(() => { /* screen shows its empty state */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, state.token]);

  useEffect(() => {
    if (!state.token) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${api}/shops/current`, { headers: auth(state.token) });
        if (cancelled) return;
        if (response.status === 401) {
          signOut();
          note("Session expired. Please sign in again.", "info");
          return;
        }
        if (!response.ok) return;
        const body = await response.json();
        const name = typeof body?.name === "string" ? body.name : "";
        if (name && name !== state.shopName) {
          setState((current) => {
            const next = { ...current, shopName: name };
            saveSession(next);
            return next;
          });
        }
      } catch {
        // Offline: keep the cached session rather than kicking the user out.
      }
    })();
    return () => { cancelled = true; };
    // Runs on token change only; shopName updates are handled inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.token, api]);

  // Speak a message aloud. Prefers Sarvam Indic TTS (key stays server-side);
  // falls back to the browser voice when TTS is not configured.
  async function speak(text?: string, languageCode?: string) {
    if (!voiceEnabled || !text) return;
    try {
      const response = await fetch(`${api}/voice/sessions/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth(state.token) },
        body: JSON.stringify({ text, languageCode }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      const audio = new Audio(`data:${body.mimeType ?? "audio/wav"};base64,${body.audioBase64}`);
      setSpeaking(true);
      audio.onended = () => setSpeaking(false);
      await audio.play();
    } catch {
      browserSpeak(text);
    }
  }

  function browserSpeak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  // Route a transcript (typed or dictated) through the voice pipeline. This is
  // the single path every voice command flows through, so browser dictation and
  // the "Send command" button behave identically.
  async function sendCommand(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setTranscript(clean);
    // If a turn is still open (the agent asked something, or is awaiting a yes),
    // continue THAT conversation via /reply so the model keeps full context.
    // Only start a fresh session once the previous turn has finished.
    const openStatus = confirmation?.status;
    const isFollowUp =
      Boolean(state.voiceSessionId) &&
      (openStatus === "awaiting_clarification" || openStatus === "awaiting_confirmation");
    await run("Voice command routed", async () => {
      const body = asRecord(
        isFollowUp
          ? await call(`/voice/sessions/${state.voiceSessionId}/reply`, {
              method: "POST",
              headers: auth(state.token),
              body: JSON.stringify({ reply: clean }),
            })
          : await call("/voice/sessions", {
              method: "POST",
              headers: auth(state.token),
              body: JSON.stringify({ source: "app_speak", transcript: clean }),
            })
      );
      await handleVoiceResponse(body);
    });
  }

  // One place to interpret every voice response. Clarification/confirmation turns
  // carry a sessionId and stay open; execution results (from a spoken "yes") are
  // terminal and close the session so the next command starts clean.
  async function handleVoiceResponse(body: Record<string, unknown>) {
    const status = String(body.status ?? "");
    if (status === "confirmed" || status === "executed" || status === "cancelled") {
      setState((current) => ({ ...current, voiceSessionId: "" }));
      setConfirmation(null);
      if (body.sale || body.result || body.invoice) setSaleResult(body);
      const done = status === "cancelled" ? "Okay, cancelled." : "Done, saved.";
      note(done, status === "cancelled" ? "info" : "ok");
      await speak(done);
      return;
    }
    setState((current) => ({ ...current, voiceSessionId: String(body.sessionId ?? current.voiceSessionId) }));
    setConfirmation(body as VoiceResponse);
    if (!body.sale) setSaleResult(null);
    await speak(typeof body.confirmationMessage === "string" ? body.confirmationMessage : undefined);
  }

  // Browser-native speech-to-text (Web Speech API). Runs entirely on the device,
  // needs no API key or audio upload, and shows the words live as you talk. On a
  // final result it routes the transcript through sendCommand(). Falls back to
  // the server audio pipeline if the browser has no SpeechRecognition.
  function startDictation() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      note("This browser has no speech recognition; using audio upload instead", "info");
      startRecording();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = sttLang;
    recognition.interimResults = true;
    recognition.continuous = false;
    setLiveTranscript("");
    recognition.onresult = (event: any) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      setLiveTranscript(finalText || interim);
      if (finalText) {
        setDictating(false);
        void sendCommand(finalText);
      }
    };
    recognition.onerror = (event: any) => {
      setDictating(false);
      note(`Dictation error: ${event.error ?? "unknown"}`, "bad");
    };
    recognition.onend = () => setDictating(false);
    recognitionRef.current = recognition;
    setDictating(true);
    note("Listening… speak now", "info");
    recognition.start();
  }

  function stopDictation() {
    recognitionRef.current?.stop();
    setDictating(false);
  }

  /**
   * The mic has two backends: in-browser dictation, and an audio upload fallback
   * for browsers without SpeechRecognition (Firefox). The button must reflect
   * and stop whichever one is actually live, otherwise the fallback records
   * forever and every tap leaks another getUserMedia stream.
   */
  /**
   * Gemini streams transcripts word by word. Re-rendering this screen on every
   * fragment starves the audio thread and makes the whole conversation feel
   * laggy, so fragments are merged per speaker and flushed at most 4x a second.
   */
  function bufferTranscript(role: "user" | "assistant", text: string) {
    const buf = transcriptBufRef.current;
    const last = buf[buf.length - 1];
    if (last && last.role === role) last.text += text;
    else buf.push({ role, text });
    if (buf.length > 8) buf.splice(0, buf.length - 8);
    if (flushTimerRef.current) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      setLiveTurns(transcriptBufRef.current.map((turn) => ({ ...turn })));
    }, 250);
  }

  // Live speech-to-speech: hold one continuous Gemini session for the whole
  // conversation (barge-in, instant replies) instead of one round-trip per phrase.
  function startLive() {
    transcriptBufRef.current = [];
    setLiveTurns([]);
    setLiveCard(null);
    setLiveStatus("Connecting…");
    const client = new GeminiLiveClient(api, state.token, (e) => {
      if (e.type === "ready") setLiveStatus("Listening, just talk");
      else if (e.type === "transcript") bufferTranscript(e.role, e.text);
      else if (e.type === "card") { setLiveCard(e.card); setLiveStatus(e.card.kind === "confirm" ? "Say yes to save" : "Listening — just talk"); }
      else if (e.type === "error") { setLiveStatus(e.message); stopLive(); }
      else if (e.type === "closed") setLiveStatus("Disconnected");
    }, sttLang.slice(0, 2));
    liveClientRef.current = client;
    client.start().catch((err) => { setLiveStatus(err?.message ?? "Could not start"); setLiveOn(false); });
    setLiveOn(true);
  }

  function stopLive() {
    liveClientRef.current?.stop();
    liveClientRef.current = null;
    if (flushTimerRef.current) { window.clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    setLiveCard(null);
    setLiveOn(false);
  }

  const listening = dictating || recording;

  function toggleListening() {
    if (recording) return stopRecording();
    if (dictating) return stopDictation();
    return startDictation();
  }

  // Capture microphone audio and run it through the same voice pipeline as text.
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      note("Microphone is not available in this browser", "bad");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        await submitAudio(new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      note("Listening…", "info");
    } catch {
      note("Microphone permission denied", "bad");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function submitAudio(blob: Blob) {
    await run("Voice command transcribed and routed", async () => {
      const form = new FormData();
      form.append("file", blob, "voice.webm");
      form.append("source", "app_speak");
      const response = await fetch(`${api}/voice/sessions/audio`, { method: "POST", headers: auth(state.token), body: form });
      const raw = await response.text();
      let body: unknown = raw;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = raw;
      }
      setLastResult({ status: response.status, body });
      if (!response.ok) throw new Error(typeof body === "string" ? body : JSON.stringify(body));
      await handleVoiceResponse(asRecord(body));
    });
  }

  async function loadSalesSummary() {
    const body = await call("/sales/summary/today", { headers: auth(state.token) });
    setSalesSummary(asRecord(body));
  }

  async function loadInventory() {
    const [items, summary, slow] = await Promise.all([
      call("/inventory/items", { headers: auth(state.token) }),
      call("/inventory/summary", { headers: auth(state.token) }),
      call("/inventory/slow-stock?olderThanDays=1", { headers: auth(state.token) }),
    ]);
    const itemRows = asList(items);
    setInventoryItems(itemRows);
    setInventorySummary(asRecord(summary));
    setSlowStock(asList(slow));
    const firstItemId = String(itemRows[0]?.id ?? "");
    if (firstItemId) {
      setMovementForm((current) => ({ ...current, inventoryItemId: current.inventoryItemId || firstItemId }));
      setJobForm((current) => ({ ...current, inventoryItemId: current.inventoryItemId || firstItemId }));
      setContentForm((current) => ({ ...current, inventoryItemId: current.inventoryItemId || firstItemId }));
    }
  }

  async function loadKarigars() {
    const body = await call("/karigars", { headers: auth(state.token) });
    const rows = asList(body);
    setKarigars(rows);
    setKarigarJobs(asList(await call("/karigars/jobs", { headers: auth(state.token) })));
    const firstId = String(rows[0]?.id ?? "");
    if (firstId) setJobForm((current) => ({ ...current, karigarId: current.karigarId || firstId }));
  }

  async function loadContentRequests() {
    const body = await call("/content/requests", { headers: auth(state.token) });
    setContentRequests(rowsOf(body));
    // Stock items feed the "pick a product" dropdown in the generate panel.
    setInventoryItems(rowsOf(await call("/inventory/items", { headers: auth(state.token) }).catch(() => [])));
    // Pull the assets for the newest ready requests so the gallery has something to show.
    const ready = rowsOf(body).filter((r) => r.status === "ready").slice(0, 3);
    const detailed = await Promise.all(ready.map((r) => call(`/content/requests/${r.id}`, { headers: auth(state.token) }).catch(() => null)));
    setContentAssets(detailed.flatMap((d) => rowsOf(asRecord(d).assets)));
    await loadSocialStatus();
  }

  // Owner approves or asks to revise a generated post. Updates the card's status
  // in place (no full reload) so the gallery stays clean and responsive.
  async function reviewAsset(assetId: string, status: "approved" | "revised") {
    setReviewBusyId(assetId);
    try {
      await call(`/content/assets/${assetId}/${status === "approved" ? "approve" : "revise"}`, {
        method: "POST",
        headers: auth(state.token),
        body: JSON.stringify({}),
      });
      setContentAssets((prev) =>
        prev.map((a) =>
          String(a.id) === assetId
            ? { ...a, metadata: { ...((a.metadata as Record<string, unknown>) ?? {}), reviewStatus: status } }
            : a,
        ),
      );
      note(status === "approved" ? "Post approved" : "Revision requested", "ok");
    } catch (error) {
      note(`Review failed: ${error instanceof Error ? error.message : "error"}`, "bad");
    } finally {
      setReviewBusyId("");
    }
  }

  async function loadSocialStatus() {
    try {
      const body = asRecord(await call("/content/social/status", { headers: auth(state.token) }));
      setSocial({
        connected: Boolean(body.connected),
        provider: body.provider ? String(body.provider) : null,
        profiles: asList(body.profiles).map((p) => ({ id: String(p.id), service: String(p.service), username: String(p.username) })),
      });
    } catch {
      /* not fatal: leave as disconnected */
    }
  }

  async function disconnectSocial() {
    await run("Social account disconnected", async () => {
      await call("/content/social/disconnect", { method: "POST", headers: auth(state.token), body: JSON.stringify({}) });
      setSocial({ connected: false, provider: null, profiles: [] });
    });
  }

  async function connectMeta() {
    try {
      const body = asRecord(await call("/content/social/meta/connect", { headers: auth(state.token) }));
      if (body.url) window.location.href = String(body.url);
      else note("Meta app is not configured yet", "bad");
    } catch (error) {
      note(`Could not start Instagram/Facebook connect: ${error instanceof Error ? error.message : "error"}`, "bad");
    }
  }

  async function publishAsset(assetId: string, profileIds: string[], scheduledAt?: string) {
    setPublishBusyId(assetId);
    try {
      const body = asRecord(await call(`/content/social/publish/${assetId}`, {
        method: "POST",
        headers: auth(state.token),
        body: JSON.stringify(scheduledAt ? { profileIds, scheduledAt } : { profileIds }),
      }));
      const updated = asRecord(body.asset);
      setContentAssets((prev) => prev.map((a) => (String(a.id) === assetId ? { ...a, metadata: updated.metadata } : a)));
      note(String(body.detail ?? (scheduledAt ? "Scheduled" : "Published")), "ok");
    } catch (error) {
      note(`${scheduledAt ? "Schedule" : "Publish"} failed: ${error instanceof Error ? error.message : "error"}`, "bad");
    } finally {
      setPublishBusyId("");
    }
  }

  // Some list endpoints return a bare array, others {items:[...]} - accept both.
  function rowsOf(body: unknown): Array<Record<string, unknown>> {
    return Array.isArray(body) ? asList(body) : asList(asRecord(body).items ?? asRecord(body).data ?? asRecord(body).rows);
  }

  async function loadRates() {
    setRates(rowsOf(await call("/metal-rates", { headers: auth(state.token) })));
  }
  async function loadSales() {
    setSalesList(rowsOf(await call("/sales", { headers: auth(state.token) })));
    setSalesSummary(asRecord(await call("/sales/summary/today", { headers: auth(state.token) })));
  }
  async function loadBuyback() {
    setBuybackItems(rowsOf(await call("/buyback/items", { headers: auth(state.token) })));
    setBuybackBundles(rowsOf(await call("/buyback/bundles", { headers: auth(state.token) })));
    setBuybackSummary(asRecord(await call("/buyback/summary", { headers: auth(state.token) })));
  }
  async function loadCustomers() {
    const rows = rowsOf(await call("/customers", { headers: auth(state.token) }));
    setCustomers(rows);
    setFollowUps(rowsOf(await call("/customers/follow-ups/list", { headers: auth(state.token) }).catch(() => [])));
    setWholesaleOrders(rowsOf(await call("/customers/wholesale/orders", { headers: auth(state.token) }).catch(() => [])));
    const firstId = String(rows[0]?.id ?? "");
    if (firstId) {
      setRepairForm((c) => ({ ...c, customerId: c.customerId || firstId }));
      setSchemeForm((c) => ({ ...c, customerId: c.customerId || firstId }));
    }
  }
  async function loadRepairs() {
    setRepairs(rowsOf(await call("/repairs", { headers: auth(state.token) })));
  }
  async function loadSchemes() {
    setSchemes(rowsOf(await call("/schemes", { headers: auth(state.token) })));
  }
  async function loadExports() {
    setExportsList(rowsOf(await call("/accounting/exports", { headers: auth(state.token) })));
  }
  async function loadAudit() {
    setAuditBooks(rowsOf(await call("/audit-books", { headers: auth(state.token) })));
    setAuditSummary(asRecord(await call("/audit-books/summary", { headers: auth(state.token) })));
  }
  async function loadScanJobs() {
    setScanJobs(rowsOf(await call("/scan-bill/jobs", { headers: auth(state.token) })));
  }

  // Signed out: the shop sees a sign-in screen and nothing else. No API base,
  // no tenant creation, no admin anything.
  if (!signedIn && !devSetup) {
    return (
      <div className="signInPage">
        <form className="signInCard" onSubmit={signIn}>
          <img className="signInMark" src={brandMark} alt="" />
          <h1>Sornam AI</h1>
          <p className="signInSub">Sign in to your shop.</p>

          <label className="signInField">
            Email
            <input
              type="email"
              autoComplete="username"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              required
            />
          </label>
          <label className="signInField">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              required
            />
          </label>

          {loginError && <p className="signInError" role="alert">{loginError}</p>}

          <button className="signInButton" type="submit" disabled={busy}>
            {busy ? <CircleNotch className="spin" weight="bold" /> : <ArrowRight weight="bold" />}
            {busy ? "Signing in" : "Sign in"}
          </button>

          {import.meta.env.DEV && (
            <button className="signInDev" type="button" onClick={() => { setDevSetup(true); setScreen("setup"); }}>
              Developer setup
            </button>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <button className="brandButton" type="button" onClick={() => setScreen("home")}>
          <img src={brandMark} alt="" />
          <span>
            <strong>Sornam AI</strong>
            <small>Jewellery OS</small>
          </span>
        </button>

        <div className="shopCard">
          <span>Current shop</span>
          <strong>{state.shopName || "No shop connected"}</strong>
          <small>{String(currentRole).replace("_", " ")}</small>
        </div>

        <nav className="nav" aria-label="Shop menu">
          <p className="navSection">Everyday</p>
          {EVERYDAY_NAV.map((item) => (
            <NavButton key={item.screen} icon={item.icon} label={item.label} featured={item.featured} active={screen === item.screen} onClick={() => go(item.screen)} />
          ))}
          <p className="navSection">More</p>
          {MORE_NAV.map((item) => (
            <NavButton key={item.screen} icon={item.icon} label={item.label} active={screen === item.screen} onClick={() => go(item.screen)} />
          ))}
        </nav>

        <div className="sidebarFoot">
          <div className="whoami">
            <strong>{state.user?.fullName ?? "Signed in"}</strong>
            <small>{String(currentRole).replace("_", " ")}</small>
          </div>
          <button className="secondary full" type="button" onClick={signOut}>
            Sign out
          </button>
          {import.meta.env.DEV && (
            <button className="devLink" type="button" onClick={() => setScreen("setup")}>
              Developer setup
            </button>
          )}
        </div>
      </aside>

      <main className={screen === "speak" ? "main speakMode" : "main"}>
        <header className="topbar">
          <button className="brandButton brandMobile" type="button" onClick={() => go("home")}>
            <img src={brandMark} alt="" />
            <strong>Sornam</strong>
          </button>
          <div className="topbarTitle">
            <p className="eyebrow">{todayLabel()}</p>
            <h1>{screenTitle(screen)}</h1>
          </div>
          <div className="topActions">
            {livePrice && asRecord(asRecord(livePrice).gold).per_gram ? (
              <span className="ratePill live" title="Live gold rate (999 fine, per gram)">
                <span className="liveDot" />
                <span className="tickerItem">Gold <b>{money(asRecord(asRecord(livePrice).gold).per_gram)}</b> /g</span>
              </span>
            ) : (
              <span className="shopChip">{state.shopName || "Your shop"}</span>
            )}
            {/* The setup screen only exists in dev; without this the button
                blanks the page in a production build. */}
            {import.meta.env.DEV && (
              <button className="iconButton" type="button" onClick={() => go("setup")} aria-label="Developer setup">
                <UserCircle weight="bold" />
              </button>
            )}
          </div>
        </header>

        {screen === "home" && (
          <section className="screen active">
            <div className="wrap">
              <div className="greet">
                <div className="eyebrow">{todayLabel()}</div>
                <h2>{greeting()}, {state.user?.fullName?.split(" ")[0] ?? "there"}.</h2>
                <p>Here's how your shop is doing today.</p>
              </div>

              <div className="stats">
                <Stat label="Today's Sales" value={money(salesSummary?.totalAmount ?? sale.totalAmount)} detail={`${textValue(salesSummary?.totalSales ?? (sale.id ? 1 : 0), "0")} confirmed sales`} icon={<ChartLineUp weight="bold" />} />
                <Stat label="Cash in hand" value={money(salesSummary?.cashCollected ?? payment.amount)} detail="Counter and payment records" icon={<Coins weight="bold" />} />
                <Stat label="Pending" value={money(salesSummary?.pendingAmount ?? pendingPayment.amount)} detail="Open pending payments" icon={<Receipt weight="bold" />} />
                <Stat label="Stock available" value={textValue(inventorySummary?.availableItems ?? inventorySummary?.available ?? inventoryItems.length, "0")} detail="Inventory records loaded" icon={<Package weight="bold" />} />
              </div>

              <div className="col2">
                <div className="card insight">
                  <div className="eyebrow">Stock insight</div>
                  <h3><b>{textValue(inventorySummary?.slowStockItems ?? slowStock.length, "0")} items</b> need attention.</h3>
                  <p>Load inventory to pull slow-stock candidates from the backend and create durable content requests from them.</p>
                  <div className="bars">
                    <i style={{ height: "70%" }} />
                    <i style={{ height: "45%" }} />
                    <i className="hot" style={{ height: "88%" }} />
                    <i style={{ height: "30%" }} />
                    <i className="hot" style={{ height: "95%" }} />
                    <i style={{ height: "55%" }} />
                    <i style={{ height: "40%" }} />
                    <i className="hot" style={{ height: "78%" }} />
                  </div>
                  <div className="buttonRow">
                    <button className="btn-gold" type="button" disabled={busy || !readyForOwner} onClick={() => run("Inventory summary loaded", loadInventory)}>Promote slow movers →</button>
                    <button className="btn-ghost" type="button" disabled={busy || !readyForOwner} onClick={() => run("Today summary loaded", loadSalesSummary)}>Refresh summary</button>
                  </div>
                </div>

                <div className="card">
                  <div className="sec-h">
                    <h3>Latest activity</h3>
                  </div>
                  <div className="flist">
                    <FollowItem initial="V" title="Last voice command" detail={confirmation?.confirmationMessage ?? "Nothing spoken yet today"} pill={confirmation ? "Heard" : "Idle"} tone={confirmation ? "ready" : "work"} />
                    <FollowItem initial="I" title="Latest invoice" detail={textValue(invoice.invoiceNumber, "No invoice yet")} pill={invoice.id ? "Saved" : "None"} tone={invoice.id ? "ready" : "pend"} />
                    <FollowItem initial="P" title="Pending payment" detail={pendingPayment.id ? money(pendingPayment.amount) : "Nothing outstanding"} pill={pendingPayment.id ? "Due" : "Clear"} tone={pendingPayment.id ? "due" : "ready"} />
                  </div>
                </div>
              </div>

              <div className="ctarow">
                <button className="speakcta" type="button" onClick={() => setScreen("speak")} disabled={!readyForSales}>
                  <div className="orb"><Microphone weight="bold" /></div>
                  <div><h3>Talk to your shop</h3><p>Record a sale and confirm the numeric readback.</p></div>
                  <div className="go">→</div>
                </button>
                <button className="scancta" type="button" onClick={() => setScreen("invoices")}>
                  <div className="orb2"><Receipt weight="bold" /></div>
                  <div><h3>Invoices</h3><p>View the invoice created by the confirmed sale flow.</p></div>
                  <div className="go2">→</div>
                </button>
              </div>
            </div>
          </section>
        )}

        {screen === "speak" && (
          <section className="screen speakScreen">
            <div className="speakHero">
              <p className="eyebrow">Speak counter</p>
              <h2>Read back every number before the ledger moves.</h2>
              <p>Just talk in Tamil, English, Telugu, Kannada or Hindi. Sornam understands, reads the numbers back to you, and saves only after you say yes.</p>
            </div>

            <div className="speakGrid">
              <Panel title="Talk to your shop" icon={<Microphone weight="bold" />} dark>
                <div className="liveBar">
                  <button
                    className={liveOn ? "liveButton on" : "liveButton"}
                    type="button"
                    disabled={busy || !readyForSales}
                    onClick={() => (liveOn ? stopLive() : startLive())}
                  >
                    <Broadcast weight="fill" />
                    {liveOn ? "End live conversation" : "Start live conversation"}
                  </button>
                  {!liveOn && (
                    <div className="langDd">
                      <Dropdown value={sttLang} onChange={(v) => setSttLang(v)} options={LANG_OPTIONS} />
                    </div>
                  )}
                  {liveOn && <span className="liveStatus"><span className="liveDot" />{liveStatus}</span>}
                </div>
                {liveOn && liveCard && (
                  <LiveCardView
                    card={liveCard}
                    onChoose={(id) => { liveClientRef.current?.choose(id); setLiveCard(null); }}
                  />
                )}
                {!liveOn && (
                  <div className="voiceExamples">
                    <span className="voiceExamplesLabel">Try saying</span>
                    <div className="voiceChipRow">
                      {VOICE_EXAMPLES.map((ex) => (
                        <button key={ex} type="button" className="voiceChip" onClick={() => setTranscript(ex)}>{ex}</button>
                      ))}
                    </div>
                  </div>
                )}
                {liveOn && liveTurns.length > 0 && (
                  <div className="liveTurns">
                    {liveTurns.map((turn, index) => (
                      <p key={index} className={turn.role === "user" ? "liveTurn you" : "liveTurn ai"}>{turn.text}</p>
                    ))}
                  </div>
                )}

                <label className="field darkField">
                  Or type a command
                  <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} />
                </label>
                <div className="buttonRow">
                  <button type="button" disabled={busy || !readyForSales} onClick={() => sendCommand(transcript)}>
                    {busy ? <CircleNotch className="spin" weight="bold" /> : <Sparkle weight="bold" />} Send command
                  </button>
                  <button className="lightButton" type="button" disabled={busy || confirmation?.status !== "awaiting_confirmation" || !readyForSales} onClick={() => run("Action confirmed and saved", async () => {
                    const body = asRecord(await call(`/voice/sessions/${state.voiceSessionId}/confirm`, {
                      method: "POST",
                      headers: auth(state.token),
                      body: JSON.stringify({ confirmation: "yes" }),
                    }));
                    await handleVoiceResponse(body);
                  })}>
                    <CheckCircle weight="bold" /> Confirm and save
                  </button>
                </div>
                <p className="guardCopy">No sale, payment, pending payment, invoice, or stock event is written before explicit confirmation.</p>
              </Panel>

              <Panel title="Readback" icon={<Receipt weight="bold" />} dark>
                {confirmation?.confirmationMessage ? (
                  String(confirmation.status) === "awaiting_clarification" ? (
                    <div className="readbackClarify">
                      <p className="clarifyHead"><Sparkle weight="bold" /> I didn't quite catch that</p>
                      <p className="readback">{confirmation.confirmationMessage}</p>
                      <div className="buttonRow">
                        <button className="lightButton" type="button" onClick={() => speak(confirmation.confirmationMessage)}>
                          <Microphone weight="bold" /> Play again
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="clarifyHead ok"><CheckCircle weight="bold" /> Please confirm</p>
                      <p className="readback goldText">{confirmation.confirmationMessage}</p>
                      <div className="buttonRow">
                        <button className="lightButton" type="button" onClick={() => speak(confirmation.confirmationMessage)}>
                          <Microphone weight="bold" /> Play readback
                        </button>
                      </div>
                    </>
                  )
                ) : (
                  <div className="readbackEmpty">
                    <Microphone weight="light" />
                    <p>Tap the mic and speak a command. What Sornam understood will appear here for you to confirm before anything is saved.</p>
                  </div>
                )}
              </Panel>
            </div>
          </section>
        )}

        {screen === "cockpit" && (
          <section className="screen">
            <div className="questionDesk">
              <div>
                <p className="eyebrow">Owner Cockpit</p>
                <h2>Ask questions the backend can answer from real records.</h2>
              </div>
              <div className="chipRow">
                {supportedQuestions.map((item) => (
                  <button className="chip" type="button" key={item} onClick={() => setQuestion(item)}>{item}</button>
                ))}
              </div>
              <label className="field">
                Question
                <textarea value={question} onChange={(event) => setQuestion(event.target.value)} />
              </label>
              <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Owner Cockpit answered", async () => {
                const body = asRecord(await call("/owner-cockpit/query", {
                  method: "POST",
                  headers: auth(state.token),
                  body: JSON.stringify({ question }),
                }));
                setCockpitResult(body);
              })}>
                <ListMagnifyingGlass weight="bold" /> Ask owner question
              </button>
            </div>
            <div className="answerPanel">
              <h3>Answer</h3>
              <p>{textValue(cockpitResult?.answer, "Ask a question above and Sornam answers from your shop records.")}</p>
              {asList(cockpitResult?.cards).length > 0 && (
                <div className="statsGrid">
                  {asList(cockpitResult?.cards).map((card, index) => (
                    <div className="metricCard" key={index}>
                      <Readout record={card} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {screen === "invoices" && (
          <section className="screen">
            <div className="splitHeader">
              <div>
                <p className="eyebrow">Invoices and sales ledger</p>
                <h2>Confirmed voice sales create the invoice record transactionally.</h2>
              </div>
              <button type="button" disabled={busy || !readyForSales} onClick={() => run("Invoices loaded", async () => { await loadSalesSummary(); await loadSales(); })}>
                <Receipt weight="bold" /> Load invoices
              </button>
            </div>
            <div className="statsGrid">
              <MetricCard label="Sale number" value={textValue(sale.saleNumber, "None yet")} detail="Generated by backend" />
              <MetricCard label="Invoice number" value={textValue(invoice.invoiceNumber, "None yet")} detail="GST-ready record" />
              <MetricCard label="Paid" value={money(payment.amount ?? sale.amountPaid)} detail={textValue(payment.paymentMethod, "No payment")} />
              <MetricCard label="Pending" value={money(pendingPayment.amount ?? sale.pendingAmount)} detail={textValue(pendingPayment.status, "No open due")} />
            </div>
            <div className="formGrid">
              <Panel title="Latest saved sale" icon={<Receipt weight="bold" />}>
                {sale.saleNumber ? (
                  <Readout record={sale} />
                ) : (
                  <p className="emptyNote">Confirm a voice sale and its invoice details show here.</p>
                )}
              </Panel>
              <Panel title="Invoice PDF by ID" icon={<FileText weight="bold" />}>
                <p className="mutedText">Or open a specific invoice by its ID (the list below is the easy way).</p>
                <label className="field">Invoice ID<input value={pdfInvoiceId} onChange={(e) => setPdfInvoiceId(e.target.value)} /></label>
                <div className="buttonRow">
                  <button type="button" disabled={busy || !readyForSales || !pdfInvoiceId} onClick={() => run("Invoice PDF generated", async () => {
                    await call(`/billing/invoices/${pdfInvoiceId}/pdf`, { method: "POST", headers: auth(state.token) });
                  })}><FileText weight="bold" /> Generate PDF</button>
                  <button type="button" disabled={busy || !readyForSales || !pdfInvoiceId} onClick={() => run("Invoice PDF opened", () => downloadFile(`/billing/invoices/${pdfInvoiceId}/pdf`))}><ArrowRight weight="bold" /> Open PDF</button>
                </div>
              </Panel>
            </div>
            <article className="tablePanel">
              <div className="panelHead"><span><Receipt weight="bold" /></span><h3>Invoices</h3></div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr><th>invoiceNumber</th><th>customer</th><th>total</th><th>paymentStatus</th><th>date</th><th>PDF</th></tr>
                  </thead>
                  <tbody>
                    {salesList.filter((s) => asRecord(s.invoice).id).length === 0 ? (
                      <tr><td colSpan={6}>No invoices yet. Click Load invoices (or confirm a sale first).</td></tr>
                    ) : salesList.map((s) => {
                      const inv = asRecord(s.invoice);
                      if (!inv.id) return null;
                      const invId = String(inv.id);
                      return (
                        <tr key={invId}>
                          <td>{textValue(inv.invoiceNumber)}</td>
                          <td>{textValue(asRecord(s.customer).fullName, "Walk-in")}</td>
                          <td className="num">{money(s.totalAmount)}</td>
                          <td>{textValue(s.paymentStatus)}</td>
                          <td>{textValue(String(s.saleDate ?? "").slice(0, 10))}</td>
                          <td>
                            <button type="button" className="chip" disabled={busy} onClick={() => run("Invoice PDF opened", async () => {
                              await call(`/billing/invoices/${invId}/pdf`, { method: "POST", headers: auth(state.token) });
                              await downloadFile(`/billing/invoices/${invId}/pdf`);
                            })}><FileText weight="bold" /> Open PDF</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {screen === "inventory" && (
          <section className="screen">
            <div className="splitHeader">
              <div>
                <p className="eyebrow">Inventory Intelligence</p>
                <h2>Stock records, movements, summaries, and slow-stock detection.</h2>
              </div>
              <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Inventory loaded", loadInventory)}>
                <Package weight="bold" /> Load inventory
              </button>
            </div>
            <div className="formGrid">
              <Panel title="Create stock item" icon={<Package weight="bold" />}>
                <InventoryForm value={inventoryForm} onChange={setInventoryForm} />
                <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Inventory item created", async () => {
                  await call("/inventory/items", {
                    method: "POST",
                    headers: auth(state.token),
                    body: JSON.stringify({ ...inventoryForm, photoUrl: inventoryForm.photoUrl || undefined }),
                  });
                  await loadInventory();
                })}>
                  <CheckCircle weight="bold" /> Save stock item
                </button>
              </Panel>
              <Panel title="Record movement" icon={<Broadcast weight="bold" />}>
                <label className="field">
                  Item ID
                  <input value={movementForm.inventoryItemId} onChange={(event) => setMovementForm({ ...movementForm, inventoryItemId: event.target.value })} />
                </label>
                <label className="field">
                  Movement type
                  <Dropdown value={movementForm.movementType} onChange={(v) => setMovementForm({ ...movementForm, movementType: v })} options={toOptions(["inward", "outward", "sale", "return", "adjustment"])} />
                </label>
                <label className="field">
                  Weight
                  <input value={movementForm.weight} onChange={(event) => setMovementForm({ ...movementForm, weight: event.target.value })} />
                </label>
                <label className="field">
                  Notes
                  <input value={movementForm.notes} onChange={(event) => setMovementForm({ ...movementForm, notes: event.target.value })} />
                </label>
                <button type="button" disabled={busy || !readyForOwner || !movementForm.inventoryItemId} onClick={() => run("Stock movement recorded", async () => {
                  await call("/inventory/movements", {
                    method: "POST",
                    headers: auth(state.token),
                    body: JSON.stringify({ ...movementForm, quantity: 1 }),
                  });
                  await loadInventory();
                })}>
                  <Broadcast weight="bold" /> Record movement
                </button>
              </Panel>
            </div>
            <DataTable
              title="Stock ledger"
              rows={inventoryItems}
              columns={["sku", "name", "category", "purity", "grossWeight", "status", "location"]}
              empty="No inventory items loaded."
            />
            <DataTable title="Slow stock" rows={slowStock} columns={["sku", "name", "category", "purity", "ageDays", "status"]} empty="No slow stock returned." />
          </section>
        )}

        {screen === "karigar" && (
          <section className="screen">
            <div className="splitHeader">
              <div>
                <p className="eyebrow">Workshop desk</p>
                <h2>Issue work, record returns, and reconcile gold movement.</h2>
              </div>
              <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Workshop list loaded", loadKarigars)}>
                <Wrench weight="bold" /> Load workshop
              </button>
            </div>
            <div className="formGrid">
              <Panel title="Create worker" icon={<Briefcase weight="bold" />}>
                <label className="field">Name<input value={karigarForm.name} onChange={(event) => setKarigarForm({ ...karigarForm, name: event.target.value })} /></label>
                <label className="field">Phone<input value={karigarForm.phone} onChange={(event) => setKarigarForm({ ...karigarForm, phone: event.target.value })} /></label>
                <label className="field">Specialization<input value={karigarForm.specialization} onChange={(event) => setKarigarForm({ ...karigarForm, specialization: event.target.value })} /></label>
                <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Workshop worker created", async () => {
                  await call("/karigars", { method: "POST", headers: auth(state.token), body: JSON.stringify(karigarForm) });
                  await loadKarigars();
                })}>
                  <CheckCircle weight="bold" /> Save worker
                </button>
              </Panel>
              <Panel title="Issue job" icon={<Wrench weight="bold" />}>
                <label className="field">Worker ID<input value={jobForm.karigarId} onChange={(event) => setJobForm({ ...jobForm, karigarId: event.target.value })} /></label>
                <label className="field">Inventory item ID<input value={jobForm.inventoryItemId} onChange={(event) => setJobForm({ ...jobForm, inventoryItemId: event.target.value })} /></label>
                <label className="field">Description<input value={jobForm.itemDescription} onChange={(event) => setJobForm({ ...jobForm, itemDescription: event.target.value })} /></label>
                <label className="field">Purity<input value={jobForm.purity} onChange={(event) => setJobForm({ ...jobForm, purity: event.target.value })} /></label>
                <label className="field">Issued weight<input value={jobForm.issuedWeight} onChange={(event) => setJobForm({ ...jobForm, issuedWeight: event.target.value })} /></label>
                <button type="button" disabled={busy || !readyForOwner || !jobForm.karigarId} onClick={() => run("Workshop job issued", async () => {
                  const body = asRecord(await call("/karigars/jobs", {
                    method: "POST",
                    headers: auth(state.token),
                    body: JSON.stringify({ ...jobForm, inventoryItemId: jobForm.inventoryItemId || null, dueDate: jobForm.dueDate || null }),
                  }));
                  setReturnForm((current) => ({ ...current, jobId: String(body.id ?? current.jobId) }));
                })}>
                  <ArrowRight weight="bold" /> Issue job
                </button>
              </Panel>
              <Panel title="Record return" icon={<ShieldCheck weight="bold" />}>
                <label className="field">Job ID<input value={returnForm.jobId} onChange={(event) => setReturnForm({ ...returnForm, jobId: event.target.value })} /></label>
                <label className="field">Finished weight<input value={returnForm.finishedWeight} onChange={(event) => setReturnForm({ ...returnForm, finishedWeight: event.target.value })} /></label>
                <label className="field">Scrap weight<input value={returnForm.scrapWeight} onChange={(event) => setReturnForm({ ...returnForm, scrapWeight: event.target.value })} /></label>
                <label className="field">Notes<input value={returnForm.notes} onChange={(event) => setReturnForm({ ...returnForm, notes: event.target.value })} /></label>
                <button type="button" disabled={busy || !readyForOwner || !returnForm.jobId} onClick={() => run("Workshop return recorded", async () => {
                  await call(`/karigars/jobs/${returnForm.jobId}/returns`, {
                    method: "POST",
                    headers: auth(state.token),
                    body: JSON.stringify(returnForm),
                  });
                })}>
                  <CheckCircle weight="bold" /> Record return
                </button>
              </Panel>
            </div>
            <DataTable title="Workshop workers" rows={karigars} columns={["name", "phone", "specialization", "isActive"]} empty="No workshop workers loaded." />
            <DataTable title="Workshop jobs" rows={karigarJobs} columns={["jobNumber", "karigar", "itemDescription", "purity", "issuedWeight", "finishedWeight", "status"]} empty="No jobs yet. Issue work above, then Load workshop." />
            <Panel title="Scorecard" icon={<ChartLineUp weight="bold" />}>
              <div className="buttonRow">
                <button type="button" disabled={busy || !readyForOwner || !jobForm.karigarId} onClick={() => run("Workshop scorecard loaded", async () => {
                  const body = asRecord(await call(`/karigars/${jobForm.karigarId}/scorecard`, { headers: auth(state.token) }));
                  setKarigarScorecard(body);
                })}>
                  <ChartLineUp weight="bold" /> Load selected scorecard
                </button>
              </div>
              {karigarScorecard ? (
                <Readout record={karigarScorecard} />
              ) : (
                <p className="emptyNote">Select a worker and load their scorecard to see it here.</p>
              )}
            </Panel>
          </section>
        )}

        {screen === "content" && (
          <section className="screen">
            <div className="splitHeader">
              <div>
                <p className="eyebrow">Content Studio</p>
                <h2>Create durable content requests from real inventory records.</h2>
              </div>
              <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Content requests loaded", loadContentRequests)}>
                <ImageSquare weight="bold" /> Load requests
              </button>
            </div>

            <div className={`socialBar ${social.connected ? "isConnected" : ""}`}>
              <div className="socialBarInfo">
                <span className="socialBarTitle"><Broadcast weight="bold" /> Connected socials</span>
                {social.connected ? (
                  <>
                    <span className="socialConnectedLine">
                      <CheckCircle weight="fill" /> Connected. Approved posts publish to:
                    </span>
                    <div className="socialChips">
                      {social.profiles.length === 0 ? (
                        <span className="mutedText">No Page or Instagram found on this account.</span>
                      ) : (
                        social.profiles.map((p) => (
                          <span key={p.id} className="socialChip">
                            {p.service === "instagram" ? "Instagram" : "Facebook"} · {p.username}
                          </span>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <span className="mutedText">Not connected. Connect your Instagram and Facebook to publish approved posts automatically.</span>
                )}
              </div>
              {social.connected ? (
                <button type="button" className="btn-ghost" disabled={busy} onClick={disconnectSocial}>
                  <ArrowRight weight="bold" /> Disconnect
                </button>
              ) : (
                <button type="button" className="btn-gold" disabled={busy || !readyForOwner} onClick={connectMeta}>
                  <Broadcast weight="bold" /> Connect Instagram / Facebook
                </button>
              )}
            </div>

            <div className="formGrid">
              <Panel title="New request" icon={<ImageSquare weight="bold" />}>
                <p className="mutedText">Queue a post for later. Pick the product; its photo is used when you generate it.</p>
                <label className="field">Product (from inventory)
                  <Dropdown value={contentForm.inventoryItemId} placeholder="Pick a stock item (optional)"
                    options={inventoryItems.map((i) => ({ value: String(i.id), label: `${textValue(i.name)} (${textValue(i.purity)})` }))}
                    onChange={(v) => {
                      const item = inventoryItems.find((i) => String(i.id) === v);
                      setContentForm({
                        ...contentForm,
                        inventoryItemId: v,
                        prompt: item ? `Festive post for ${textValue(item.purity, "")} ${textValue(item.name, "")}`.trim() : contentForm.prompt,
                      });
                    }} />
                </label>
                {(() => {
                  const picked = inventoryItems.find((i) => String(i.id) === contentForm.inventoryItemId);
                  return picked && picked.photoUrl ? (
                    <div className="genPhotoPreview"><img src={String(picked.photoUrl)} alt="product" /><span className="mutedText">This item's photo will be used</span></div>
                  ) : contentForm.inventoryItemId ? (
                    <p className="mutedText">This item has no photo yet. Add one on the Inventory screen to use it.</p>
                  ) : null;
                })()}
                <label className="field">Occasion<input value={contentForm.occasion} onChange={(event) => setContentForm({ ...contentForm, occasion: event.target.value })} /></label>
                <label className="field">Prompt<textarea value={contentForm.prompt} onChange={(event) => setContentForm({ ...contentForm, prompt: event.target.value })} /></label>
                <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Content request created", async () => {
                  await call("/content/requests", {
                    method: "POST",
                    headers: auth(state.token),
                    body: JSON.stringify({ ...contentForm, inventoryItemId: contentForm.inventoryItemId || null }),
                  });
                  await loadContentRequests();
                })}>
                  <Sparkle weight="bold" /> Save content request
                </button>
              </Panel>
              <Panel title="Generate post now" icon={<Sparkle weight="bold" />}>
                <p className="mutedText">Pick a real stock item (and its photo) or upload a product photo, then the studio makes a post and reel of that actual product. Saves to the gallery below.</p>
                <label className="field">Product (from inventory)
                  <Dropdown value={genForm.inventoryItemId} placeholder="Pick a stock item (optional)"
                    options={inventoryItems.map((i) => ({ value: String(i.id), label: `${textValue(i.name)} (${textValue(i.purity)})` }))}
                    onChange={(v) => {
                      const item = inventoryItems.find((i) => String(i.id) === v);
                      setGenForm({
                        ...genForm,
                        inventoryItemId: v,
                        text: item ? `${textValue(item.purity, "")} ${textValue(item.name, "")}${genForm.occasion ? ` for ${genForm.occasion}` : ""}`.trim() : genForm.text,
                        category: item && item.category ? String(item.category) : genForm.category,
                      });
                      setGenPhoto(item && item.photoUrl ? String(item.photoUrl) : "");
                    }} />
                </label>
                <label className="field">Product photo (uses the real product; optional)
                  <input type="file" accept="image/*" onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setGenPhoto(await compressImageFile(file));
                  }} />
                </label>
                {genPhoto ? (
                  <div className="genPhotoPreview">
                    <img src={genPhoto} alt="product" />
                    <button type="button" className="chip" onClick={() => setGenPhoto("")}>Remove photo</button>
                  </div>
                ) : null}
                <label className="field">What to post (prompt: describe the post you want)<textarea value={genForm.text} placeholder="e.g. Elegant 22K gold temple necklace post for Diwali, warm festive mood, highlight the craftsmanship" onChange={(event) => setGenForm({ ...genForm, text: event.target.value })} /></label>
                <label className="field">Occasion<input value={genForm.occasion} onChange={(event) => setGenForm({ ...genForm, occasion: event.target.value })} /></label>
                <label className="field">Category<input value={genForm.category} onChange={(event) => setGenForm({ ...genForm, category: event.target.value })} /></label>
                <label className="field">Type
                  <Dropdown value={genForm.requestedType} onChange={(v) => setGenForm({ ...genForm, requestedType: v })} options={[{ value: "both", label: "Post + reel" }, { value: "image", label: "Post only" }, { value: "reel", label: "Reel only" }, { value: "carousel", label: "Carousel" }]} />
                </label>
                <button type="button" disabled={busy || !readyForOwner || !genForm.text} onClick={() => run("Content generated", async () => {
                  const body = asRecord(await call("/content/studio/generate", {
                    method: "POST",
                    headers: auth(state.token),
                    body: JSON.stringify({
                      text: genForm.text, occasion: genForm.occasion, category: genForm.category,
                      requestedType: genForm.requestedType, language: "en",
                      inventoryItemId: genForm.inventoryItemId || undefined,
                      productImages: genPhoto ? [imageRefFromUrl(genPhoto)] : undefined,
                    }),
                  }));
                  setContentAssets(asList(body.assets));
                  await loadContentRequests();
                })}>
                  <Sparkle weight="bold" /> Generate post
                </button>
              </Panel>
              <Panel title="Slow-stock promotion" icon={<Broadcast weight="bold" />}>
                <p className="mutedText">Turns your slow-moving stock into ready-to-post designs you can share with customers.</p>
                <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Slow-stock promotion queued", async () => {
                  const body = asRecord(await call("/content/slow-stock/promote", {
                    method: "POST",
                    headers: auth(state.token),
                    body: JSON.stringify({ olderThanDays: 1, occasion: contentForm.occasion, limit: 10 }),
                  }));
                  setContentRequests(asList(body.requests ?? body));
                })}>
                  <Broadcast weight="bold" /> Promote slow stock
                </button>
              </Panel>
            </div>
            <ContentGallery
              assets={contentAssets}
              onReview={reviewAsset}
              reviewBusyId={reviewBusyId}
              onPublish={publishAsset}
              publishBusyId={publishBusyId}
              profiles={social.profiles}
              connected={social.connected}
              mediaOrigin={mediaOrigin}
            />
            <article className="tablePanel">
              <div className="panelHead"><span><ImageSquare weight="bold" /></span><h3>Content requests</h3></div>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>occasion</th><th>prompt</th><th>status</th><th>action</th></tr></thead>
                  <tbody>
                    {contentRequests.length === 0 ? (
                      <tr><td colSpan={4}>No content requests. Save one above, then generate it here.</td></tr>
                    ) : contentRequests.map((r) => {
                      const rid = String(r.id);
                      const isReady = String(r.status) === "ready";
                      return (
                        <tr key={rid}>
                          <td>{textValue(r.occasion)}</td>
                          <td>{textValue(r.prompt).slice(0, 60)}</td>
                          <td>{textValue(r.status)}</td>
                          <td>
                            <button type="button" className="chip" disabled={genId !== "" || !readyForOwner} onClick={async () => {
                              setGenId(rid);
                              try {
                                const body = asRecord(await call(`/content/requests/${rid}/generate`, { method: "POST", headers: auth(state.token) }));
                                setContentAssets(asList(body.assets));
                                await loadContentRequests();
                                note("Content generated", "ok");
                              } catch (error) {
                                note(`Generate failed: ${error instanceof Error ? error.message : "error"}`, "bad");
                              } finally {
                                setGenId("");
                              }
                            }}>
                              {genId === rid
                                ? <><CircleNotch className="spin" weight="bold" /> Generating…</>
                                : <><Sparkle weight="bold" /> {isReady ? "Regenerate" : "Generate"}</>}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {screen === "rates" && (
          <section className="screen">
            <div className="splitHeader">
              <div><p className="eyebrow">Gold rate</p><h2>Set the live rate the sales and voice flows use.</h2></div>
              <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Rates loaded", loadRates)}><Coins weight="bold" /> Load rates</button>
            </div>
            <LiveRateBoard data={livePrice} />
            <div className="formGrid">
              <Panel title="Set rate" icon={<Coins weight="bold" />}>
                <label className="field">Metal<input value={rateForm.metal} onChange={(e) => setRateForm({ ...rateForm, metal: e.target.value })} /></label>
                <label className="field">Purity<input value={rateForm.purity} onChange={(e) => setRateForm({ ...rateForm, purity: e.target.value })} /></label>
                <label className="field">Rate per gram (Rs)<input value={rateForm.ratePerUnit} onChange={(e) => setRateForm({ ...rateForm, ratePerUnit: e.target.value })} /></label>
                <button type="button" disabled={busy || !readyForOwner || !rateForm.ratePerUnit} onClick={() => run("Gold rate saved", async () => {
                  await call("/metal-rates", { method: "POST", headers: auth(state.token), body: JSON.stringify({ ...rateForm, unit: "gram", source: "manual" }) });
                  await loadRates();
                })}><CheckCircle weight="bold" /> Save rate</button>
              </Panel>
              <Panel title="Fetch live gold" icon={<Broadcast weight="bold" />}>
                <p className="mutedText">Pulls the configured provider rate for a purity (needs GOLD_RATE_PROVIDER set on the server).</p>
                <label className="field">Purity<input value={rateForm.purity} onChange={(e) => setRateForm({ ...rateForm, purity: e.target.value })} /></label>
                <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Gold rate fetched", async () => {
                  await call("/metal-rates/gold/fetch", { method: "POST", headers: auth(state.token), body: JSON.stringify({ purity: rateForm.purity }) });
                  await loadRates();
                })}><Broadcast weight="bold" /> Fetch gold rate</button>
              </Panel>
            </div>
            <DataTable title="Recent rates" rows={rates} columns={["metal", "purity", "ratePerUnit", "unit", "source", "fetchedAt"]} empty="No rates loaded." />
          </section>
        )}

        {screen === "sales" && (
          <section className="screen">
            <div className="splitHeader">
              <div><p className="eyebrow">Sales</p><h2>Record a manual sale and review the ledger.</h2></div>
              <button type="button" disabled={busy || !readyForSales} onClick={() => run("Sales loaded", loadSales)}><Receipt weight="bold" /> Load sales</button>
            </div>
            <div className="formGrid">
              <Panel title="New manual sale" icon={<Receipt weight="bold" />}>
                <label className="field">Customer name<input value={salesForm.customerName} onChange={(e) => setSalesForm({ ...salesForm, customerName: e.target.value })} /></label>
                <label className="field">Customer phone<input value={salesForm.customerPhone} onChange={(e) => setSalesForm({ ...salesForm, customerPhone: e.target.value })} /></label>
                <label className="field">Item name<input value={salesForm.itemName} onChange={(e) => setSalesForm({ ...salesForm, itemName: e.target.value })} /></label>
                <label className="field">Purity<input value={salesForm.purity} onChange={(e) => setSalesForm({ ...salesForm, purity: e.target.value })} /></label>
                <label className="field">Gross weight (g)<input value={salesForm.grossWeight} onChange={(e) => setSalesForm({ ...salesForm, grossWeight: e.target.value })} /></label>
                <label className="field">Net weight (g)<input value={salesForm.netWeight} onChange={(e) => setSalesForm({ ...salesForm, netWeight: e.target.value })} /></label>
                <label className="field">Gold rate per gram (Rs)<input value={salesForm.goldRatePerGram} onChange={(e) => setSalesForm({ ...salesForm, goldRatePerGram: e.target.value })} /></label>
                <label className="field">Making charge (%)<input value={salesForm.makingChargeValue} onChange={(e) => setSalesForm({ ...salesForm, makingChargeValue: e.target.value })} /></label>
                <label className="field">Amount paid (Rs)<input value={salesForm.amountPaid} onChange={(e) => setSalesForm({ ...salesForm, amountPaid: e.target.value })} /></label>
                <label className="field">Payment method
                  <Dropdown value={salesForm.paymentMethod} onChange={(v) => setSalesForm({ ...salesForm, paymentMethod: v })} options={toOptions(["cash", "upi", "card", "bank_transfer", "other"])} />
                </label>
                <button type="button" disabled={busy || !readyForSales || !salesForm.itemName || !salesForm.goldRatePerGram} onClick={() => run("Sale recorded", async () => {
                  await call("/sales/manual", { method: "POST", headers: auth(state.token), body: JSON.stringify({
                    customer: salesForm.customerName ? { fullName: salesForm.customerName, phone: salesForm.customerPhone || undefined } : undefined,
                    items: [{ itemName: salesForm.itemName, purity: salesForm.purity, grossWeight: salesForm.grossWeight, netWeight: salesForm.netWeight || salesForm.grossWeight, goldRatePerGram: salesForm.goldRatePerGram, makingChargeType: "percentage", makingChargeValue: salesForm.makingChargeValue }],
                    amountPaid: salesForm.amountPaid, paymentMethod: salesForm.paymentMethod,
                  }) });
                  await loadSales();
                })}><CheckCircle weight="bold" /> Record sale</button>
              </Panel>
              <Panel title="Today" icon={<ChartLineUp weight="bold" />}>
                {salesSummary ? <Readout record={salesSummary} /> : <p className="emptyNote">Load sales to see today's totals.</p>}
              </Panel>
              <Panel title="Sale detail" icon={<Receipt weight="bold" />}>
                <label className="field">Sale ID<input value={saleDetailId} onChange={(e) => setSaleDetailId(e.target.value)} /></label>
                <button type="button" disabled={busy || !readyForSales || !saleDetailId} onClick={() => run("Sale detail loaded", async () => {
                  setSaleDetail(asRecord(await call(`/sales/${saleDetailId}`, { headers: auth(state.token) })));
                })}><ListMagnifyingGlass weight="bold" /> Load detail</button>
                {saleDetail ? <Readout record={saleDetail} /> : null}
              </Panel>
            </div>
            <DataTable title="Sales" rows={salesList} columns={["saleNumber", "customerName", "totalAmount", "amountPaid", "paymentStatus", "saleDate"]} empty="No sales loaded." />
          </section>
        )}

        {screen === "buyback" && (
          <section className="screen">
            <div className="splitHeader">
              <div><p className="eyebrow">Buyback</p><h2>Record old gold, bundle it, and track stuck value.</h2></div>
              <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Buyback loaded", loadBuyback)}><Coins weight="bold" /> Load buyback</button>
            </div>
            <div className="formGrid">
              <Panel title="Record item" icon={<Coins weight="bold" />}>
                <label className="field">Item name<input value={buybackItemForm.itemName} onChange={(e) => setBuybackItemForm({ ...buybackItemForm, itemName: e.target.value })} /></label>
                <label className="field">Tested purity<input value={buybackItemForm.testedPurity} onChange={(e) => setBuybackItemForm({ ...buybackItemForm, testedPurity: e.target.value })} /></label>
                <label className="field">Assigned purity<input value={buybackItemForm.assignedPurity} onChange={(e) => setBuybackItemForm({ ...buybackItemForm, assignedPurity: e.target.value })} /></label>
                <label className="field">Weight (g)<input value={buybackItemForm.weight} onChange={(e) => setBuybackItemForm({ ...buybackItemForm, weight: e.target.value })} /></label>
                <label className="field">Rate per gram (Rs)<input value={buybackItemForm.ratePerGram} onChange={(e) => setBuybackItemForm({ ...buybackItemForm, ratePerGram: e.target.value })} /></label>
                <button type="button" disabled={busy || !readyForOwner || !buybackItemForm.itemName} onClick={() => run("Buyback item recorded", async () => {
                  await call("/buyback/items", { method: "POST", headers: auth(state.token), body: JSON.stringify(buybackItemForm) });
                  await loadBuyback();
                })}><CheckCircle weight="bold" /> Save item</button>
              </Panel>
              <Panel title="Create bundle" icon={<Coins weight="bold" />}>
                <label className="field">Metal
                  <Dropdown value={buybackBundleForm.metal} onChange={(v) => setBuybackBundleForm({ ...buybackBundleForm, metal: v })} options={toOptions(["gold", "silver"])} />
                </label>
                <label className="field">Purity<input value={buybackBundleForm.purity} onChange={(e) => setBuybackBundleForm({ ...buybackBundleForm, purity: e.target.value })} /></label>
                <label className="field">Rate per gram (Rs)<input value={buybackBundleForm.ratePerGram} onChange={(e) => setBuybackBundleForm({ ...buybackBundleForm, ratePerGram: e.target.value })} /></label>
                <button type="button" disabled={busy || !readyForOwner || !buybackBundleForm.ratePerGram} onClick={() => run("Buyback bundle created", async () => {
                  await call("/buyback/bundles", { method: "POST", headers: auth(state.token), body: JSON.stringify({ ...buybackBundleForm, itemIds: [] }) });
                  await loadBuyback();
                })}><CheckCircle weight="bold" /> Create bundle</button>
              </Panel>
              <Panel title="Summary" icon={<ChartLineUp weight="bold" />}>
                {buybackSummary ? <Readout record={buybackSummary} /> : <p className="emptyNote">Load buyback to see the summary.</p>}
              </Panel>
            </div>
            <DataTable title="Buyback items" rows={buybackItems} columns={["itemName", "testedPurity", "weight", "ratePerGram", "calculatedValue", "status"]} empty="No buyback items loaded." />
            <DataTable title="Buyback bundles" rows={buybackBundles} columns={["bundleNumber", "metal", "purity", "ratePerGram", "status"]} empty="No bundles loaded." />
          </section>
        )}

        {screen === "customers" && (
          <section className="screen">
            <div className="splitHeader">
              <div><p className="eyebrow">Customers</p><h2>Your customer book and follow-ups.</h2></div>
              <button type="button" disabled={busy || !readyForSales} onClick={() => run("Customers loaded", loadCustomers)}><UserCircle weight="bold" /> Load customers</button>
            </div>
            <div className="formGrid">
              <Panel title="New customer" icon={<UserCircle weight="bold" />}>
                <label className="field">Full name<input value={customerForm.fullName} onChange={(e) => setCustomerForm({ ...customerForm, fullName: e.target.value })} /></label>
                <label className="field">Phone<input value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} /></label>
                <label className="field">Type
                  <Dropdown value={customerForm.customerType} onChange={(v) => setCustomerForm({ ...customerForm, customerType: v })} options={toOptions(["retail", "wholesale"])} />
                </label>
                <label className="field">Preferred language<input value={customerForm.preferredLanguage} onChange={(e) => setCustomerForm({ ...customerForm, preferredLanguage: e.target.value })} /></label>
                <button type="button" disabled={busy || !readyForSales || !customerForm.fullName} onClick={() => run("Customer created", async () => {
                  await call("/customers", { method: "POST", headers: auth(state.token), body: JSON.stringify({ ...customerForm, preferredLanguage: customerForm.preferredLanguage || undefined }) });
                  await loadCustomers();
                })}><CheckCircle weight="bold" /> Save customer</button>
              </Panel>
              <Panel title="Import / export" icon={<FileText weight="bold" />}>
                <p className="mutedText">Paste a JSON array of customers to bulk import, or export the book as a file.</p>
                <label className="field">Rows (JSON)<textarea value={custImportText} onChange={(e) => setCustImportText(e.target.value)} placeholder='[{"fullName":"Asha","phone":"9990001234","customerType":"retail"}]' /></label>
                <div className="buttonRow">
                  <button type="button" disabled={busy || !readyForSales || !custImportText} onClick={() => run("Customers imported", async () => {
                    await call("/customers/import", { method: "POST", headers: auth(state.token), body: JSON.stringify({ rows: JSON.parse(custImportText) }) });
                    await loadCustomers();
                  })}><CheckCircle weight="bold" /> Import</button>
                  <button type="button" disabled={busy || !readyForSales} onClick={() => run("Customers exported", () => downloadFile("/customers/export"))}><ArrowRight weight="bold" /> Export</button>
                </div>
              </Panel>
              <Panel title="Wholesale order" icon={<Storefront weight="bold" />}>
                <label className="field">Customer
                  <Dropdown value={wholesaleForm.customerId} onChange={(v) => setWholesaleForm({ ...wholesaleForm, customerId: v })} placeholder="Select customer" options={customers.map((c) => ({ value: String(c.id), label: String(c.fullName) }))} />
                </label>
                <label className="field">Ornament type<input value={wholesaleForm.ornamentType} onChange={(e) => setWholesaleForm({ ...wholesaleForm, ornamentType: e.target.value })} /></label>
                <label className="field">Quantity weight (g)<input value={wholesaleForm.quantityWeight} onChange={(e) => setWholesaleForm({ ...wholesaleForm, quantityWeight: e.target.value })} /></label>
                <label className="field">Order value (Rs)<input value={wholesaleForm.orderValue} onChange={(e) => setWholesaleForm({ ...wholesaleForm, orderValue: e.target.value })} /></label>
                <label className="field">Payment status
                  <Dropdown value={wholesaleForm.paymentStatus} onChange={(v) => setWholesaleForm({ ...wholesaleForm, paymentStatus: v })} options={toOptions(["paid", "partial", "pending"])} />
                </label>
                <button type="button" disabled={busy || !readyForSales || !wholesaleForm.customerId || !wholesaleForm.orderValue} onClick={() => run("Wholesale order created", async () => {
                  await call("/customers/wholesale/orders", { method: "POST", headers: auth(state.token), body: JSON.stringify({ ...wholesaleForm, metal: "gold" }) });
                  await loadWholesale();
                })}><CheckCircle weight="bold" /> Save order</button>
              </Panel>
            </div>
            <DataTable title="Customers" rows={customers} columns={["fullName", "phone", "customerType", "preferredLanguage"]} empty="No customers loaded." />
            <DataTable title="Follow-ups due" rows={followUps} columns={["type", "status", "dueAt", "message"]} empty="No follow-ups loaded." />
            <DataTable title="Wholesale orders" rows={wholesaleOrders} columns={["ornamentType", "quantityWeight", "orderValue", "paymentStatus"]} empty="No wholesale orders loaded." />
          </section>
        )}

        {screen === "repairs" && (
          <section className="screen">
            <div className="splitHeader">
              <div><p className="eyebrow">Repairs</p><h2>Repair and custom orders through the workshop.</h2></div>
              <button type="button" disabled={busy || !readyForSales} onClick={() => run("Repairs loaded", async () => { await loadCustomers(); await loadRepairs(); })}><Wrench weight="bold" /> Load repairs</button>
            </div>
            <div className="formGrid">
              <Panel title="New repair order" icon={<Wrench weight="bold" />}>
                <label className="field">Customer
                  <Dropdown value={repairForm.customerId} onChange={(v) => setRepairForm({ ...repairForm, customerId: v })} placeholder="Select customer" options={customers.map((c) => ({ value: String(c.id), label: String(c.fullName) }))} />
                </label>
                <label className="field">Item description<input value={repairForm.itemDescription} onChange={(e) => setRepairForm({ ...repairForm, itemDescription: e.target.value })} /></label>
                <label className="field">Purity<input value={repairForm.purity} onChange={(e) => setRepairForm({ ...repairForm, purity: e.target.value })} /></label>
                <div className="field">Expected date<DateField value={repairForm.expectedDate} onChange={(v) => setRepairForm({ ...repairForm, expectedDate: v })} /></div>
                <button type="button" disabled={busy || !readyForSales || !repairForm.customerId || !repairForm.itemDescription} onClick={() => run("Repair created", async () => {
                  await call("/repairs", { method: "POST", headers: auth(state.token), body: JSON.stringify({ customerId: repairForm.customerId, itemDescription: repairForm.itemDescription, purity: repairForm.purity || undefined, expectedDate: repairForm.expectedDate || undefined, notes: repairForm.notes || undefined }) });
                  await loadRepairs();
                })}><CheckCircle weight="bold" /> Save repair</button>
              </Panel>
              <Panel title="Update status" icon={<ShieldCheck weight="bold" />}>
                <label className="field">Repair order ID<input value={repairStatusForm.repairOrderId} onChange={(e) => setRepairStatusForm({ ...repairStatusForm, repairOrderId: e.target.value })} /></label>
                <label className="field">Status
                  <Dropdown value={repairStatusForm.status} onChange={(v) => setRepairStatusForm({ ...repairStatusForm, status: v })} options={toOptions(["received", "in_workshop", "ready", "delivered", "cancelled"])} />
                </label>
                <button type="button" disabled={busy || !readyForSales || !repairStatusForm.repairOrderId} onClick={() => run("Repair status updated", async () => {
                  await call(`/repairs/${repairStatusForm.repairOrderId}/status`, { method: "PATCH", headers: auth(state.token), body: JSON.stringify({ status: repairStatusForm.status, notes: repairStatusForm.notes || undefined }) });
                  await loadRepairs();
                })}><CheckCircle weight="bold" /> Update status</button>
              </Panel>
              <Panel title="Repair detail" icon={<ListMagnifyingGlass weight="bold" />}>
                <label className="field">Repair order ID<input value={repairDetailId} onChange={(e) => setRepairDetailId(e.target.value)} /></label>
                <button type="button" disabled={busy || !readyForSales || !repairDetailId} onClick={() => run("Repair detail loaded", async () => {
                  setRepairDetail(asRecord(await call(`/repairs/${repairDetailId}`, { headers: auth(state.token) })));
                })}><ListMagnifyingGlass weight="bold" /> Load detail</button>
                {repairDetail ? <Readout record={repairDetail} /> : null}
              </Panel>
            </div>
            <DataTable title="Repair orders" rows={repairs} columns={["repairOrderNumber", "itemDescription", "purity", "status", "expectedDate"]} empty="No repairs loaded." />
          </section>
        )}

        {screen === "schemes" && (
          <section className="screen">
            <div className="splitHeader">
              <div><p className="eyebrow">Schemes</p><h2>Savings schemes and installments (records only, no money held).</h2></div>
              <button type="button" disabled={busy || !readyForSales} onClick={() => run("Schemes loaded", async () => { await loadCustomers(); await loadSchemes(); })}><Books weight="bold" /> Load schemes</button>
            </div>
            <div className="formGrid">
              <Panel title="New scheme" icon={<Books weight="bold" />}>
                <label className="field">Customer
                  <Dropdown value={schemeForm.customerId} onChange={(v) => setSchemeForm({ ...schemeForm, customerId: v })} placeholder="Select customer" options={customers.map((c) => ({ value: String(c.id), label: String(c.fullName) }))} />
                </label>
                <label className="field">Monthly amount (Rs)<input value={schemeForm.monthlyAmount} onChange={(e) => setSchemeForm({ ...schemeForm, monthlyAmount: e.target.value })} /></label>
                <label className="field">Months<input value={schemeForm.months} onChange={(e) => setSchemeForm({ ...schemeForm, months: e.target.value })} /></label>
                <div className="field">Start date<DateField value={schemeForm.startDate} onChange={(v) => setSchemeForm({ ...schemeForm, startDate: v })} /></div>
                <button type="button" disabled={busy || !readyForSales || !schemeForm.customerId || !schemeForm.monthlyAmount} onClick={() => run("Scheme created", async () => {
                  await call("/schemes", { method: "POST", headers: auth(state.token), body: JSON.stringify({ customerId: schemeForm.customerId, monthlyAmount: schemeForm.monthlyAmount, months: Number(schemeForm.months), startDate: schemeForm.startDate || new Date().toISOString().slice(0, 10), notes: schemeForm.notes || undefined }) });
                  await loadSchemes();
                })}><CheckCircle weight="bold" /> Save scheme</button>
              </Panel>
              <Panel title="Record installment" icon={<Coins weight="bold" />}>
                <label className="field">Scheme ID<input value={installmentForm.schemeId} onChange={(e) => setInstallmentForm({ ...installmentForm, schemeId: e.target.value })} /></label>
                <label className="field">Amount (Rs)<input value={installmentForm.amount} onChange={(e) => setInstallmentForm({ ...installmentForm, amount: e.target.value })} /></label>
                <label className="field">Payment method
                  <Dropdown value={installmentForm.paymentMethod} onChange={(v) => setInstallmentForm({ ...installmentForm, paymentMethod: v })} options={toOptions(["cash", "upi", "card", "bank_transfer", "other"])} />
                </label>
                <button type="button" disabled={busy || !readyForSales || !installmentForm.schemeId || !installmentForm.amount} onClick={() => run("Installment recorded", async () => {
                  await call(`/schemes/${installmentForm.schemeId}/installments`, { method: "POST", headers: auth(state.token), body: JSON.stringify({ amount: installmentForm.amount, paymentMethod: installmentForm.paymentMethod, referenceNumber: installmentForm.referenceNumber || undefined }) });
                  await loadSchemes();
                })}><CheckCircle weight="bold" /> Record installment</button>
              </Panel>
            </div>
            <DataTable title="Schemes" rows={schemes} columns={["schemeNumber", "monthlyAmount", "months", "status", "maturityDate"]} empty="No schemes loaded." />
          </section>
        )}

        {screen === "accounting" && (
          <section className="screen">
            <div className="splitHeader">
              <div><p className="eyebrow">Accounting</p><h2>Export files for Tally, Vyapar, Busy or Zoho Books.</h2></div>
              <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Exports loaded", loadExports)}><FileText weight="bold" /> Load exports</button>
            </div>
            <div className="formGrid">
              <Panel title="New export" icon={<FileText weight="bold" />}>
                <label className="field">Provider
                  <Dropdown value={exportForm.provider} onChange={(v) => setExportForm({ ...exportForm, provider: v })} options={toOptions(["tally", "vyapar", "busy", "zoho_books"])} />
                </label>
                <label className="field">Export type
                  <Dropdown value={exportForm.exportType} onChange={(v) => setExportForm({ ...exportForm, exportType: v })} options={toOptions(["sales_invoices", "payments", "customers", "inventory_items", "audit_books"])} />
                </label>
                <div className="field">Date from<DateField value={exportForm.dateFrom} onChange={(v) => setExportForm({ ...exportForm, dateFrom: v })} /></div>
                <div className="field">Date to<DateField value={exportForm.dateTo} onChange={(v) => setExportForm({ ...exportForm, dateTo: v })} /></div>
                <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Export created", async () => {
                  await call("/accounting/exports", { method: "POST", headers: auth(state.token), body: JSON.stringify({ provider: exportForm.provider, exportType: exportForm.exportType, dateFrom: exportForm.dateFrom || undefined, dateTo: exportForm.dateTo || undefined }) });
                  await loadExports();
                })}><CheckCircle weight="bold" /> Create export</button>
              </Panel>
              <Panel title="Download export" icon={<ArrowRight weight="bold" />}>
                <label className="field">Export ID<input value={exportDownloadId} onChange={(e) => setExportDownloadId(e.target.value)} /></label>
                <button type="button" disabled={busy || !readyForOwner || !exportDownloadId} onClick={() => run("Export downloaded", () => downloadFile(`/accounting/exports/${exportDownloadId}/download`))}><ArrowRight weight="bold" /> Download file</button>
              </Panel>
            </div>
            <DataTable title="Exports" rows={exportsList} columns={["id", "provider", "exportType", "status", "recordCount", "createdAt"]} empty="No exports loaded." />
          </section>
        )}

        {screen === "audit" && (
          <section className="screen">
            <div className="splitHeader">
              <div><p className="eyebrow">Audit books</p><h2>Which sales are included in the audited books.</h2></div>
              <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Audit books loaded", loadAudit)}><Books weight="bold" /> Load audit books</button>
            </div>
            <div className="formGrid">
              <Panel title="Summary" icon={<ChartLineUp weight="bold" />}>
                {auditSummary ? <Readout record={auditSummary} /> : <p className="emptyNote">Load to see included vs excluded totals.</p>}
              </Panel>
              <Panel title="Include / exclude a sale" icon={<ShieldCheck weight="bold" />}>
                <label className="field">Sale ID<input value={auditForm.saleId} onChange={(e) => setAuditForm({ ...auditForm, saleId: e.target.value })} /></label>
                <label className="field">Invoice ID (optional)<input value={auditForm.invoiceId} onChange={(e) => setAuditForm({ ...auditForm, invoiceId: e.target.value })} /></label>
                <label className="field">Status
                  <Dropdown value={auditForm.status} onChange={(v) => setAuditForm({ ...auditForm, status: v })} options={toOptions(["included", "excluded"])} />
                </label>
                <button type="button" disabled={busy || !readyForOwner || !auditForm.saleId} onClick={() => run("Audit entry saved", async () => {
                  await call("/audit-books/entries", { method: "PUT", headers: auth(state.token), body: JSON.stringify({ saleId: auditForm.saleId, invoiceId: auditForm.invoiceId || undefined, status: auditForm.status, notes: auditForm.notes || undefined }) });
                  await loadAudit();
                })}><CheckCircle weight="bold" /> Save entry</button>
              </Panel>
            </div>
            <DataTable title="Audit book entries" rows={auditBooks} columns={["saleId", "invoiceId", "status", "notes"]} empty="No audit entries loaded." />
          </section>
        )}

        {screen === "scanbill" && (
          <section className="screen">
            <div className="splitHeader">
              <div><p className="eyebrow">Scan bill</p><h2>Paste an old bill; the server parses it into a draft to confirm.</h2></div>
              <button type="button" disabled={busy || !readyForSales} onClick={() => run("Scan jobs loaded", loadScanJobs)}><Receipt weight="bold" /> Load jobs</button>
            </div>
            <div className="formGrid">
              <Panel title="New scan job" icon={<Receipt weight="bold" />}>
                <label className="field">Bill text<textarea value={scanForm.rawText} onChange={(e) => setScanForm({ ...scanForm, rawText: e.target.value })} /></label>
                <button type="button" disabled={busy || !readyForSales || !scanForm.rawText} onClick={() => run("Scan job created", async () => {
                  await call("/scan-bill/jobs", { method: "POST", headers: auth(state.token), body: JSON.stringify({ rawText: scanForm.rawText }) });
                  await loadScanJobs();
                })}><CheckCircle weight="bold" /> Parse bill</button>
              </Panel>
              <Panel title="Confirm parsed draft" icon={<ShieldCheck weight="bold" />}>
                <p className="mutedText">After parsing, confirm a job to accept its draft into the ledger.</p>
                <label className="field">Job ID<input value={scanConfirmId} onChange={(e) => setScanConfirmId(e.target.value)} /></label>
                <button type="button" disabled={busy || !readyForSales || !scanConfirmId} onClick={() => run("Scan job confirmed", async () => {
                  await call(`/scan-bill/jobs/${scanConfirmId}/confirm`, { method: "POST", headers: auth(state.token), body: JSON.stringify({ confirmation: "yes" }) });
                  await loadScanJobs();
                })}><CheckCircle weight="bold" /> Confirm draft</button>
              </Panel>
            </div>
            <DataTable title="Scan jobs" rows={scanJobs} columns={["id", "status", "createdAt"]} empty="No scan jobs loaded." />
          </section>
        )}

        {screen === "whatsapp" && (
          <section className="screen">
            <div className="boundaryDesk">
              <WhatsappLogo weight="bold" />
              <h2>WhatsApp interface is present, but external sending is not wired in this app yet.</h2>
              <p>Invoices and customer events are available from the confirmed sale flow. The messaging adapter must use those IDs and opt-in policy checks when connected.</p>
            </div>
          </section>
        )}

        {screen === "team" && (
          <section className="screen">
            <div className="splitHeader">
              <div>
                <p className="eyebrow">Team and access</p>
                <h2>Role-scoped access for shop data.</h2>
              </div>
              <button type="button" disabled={busy || !readyForOwner} onClick={() => run("Access loaded", loadAccess)}><ShieldCheck weight="bold" /> Load access</button>
            </div>
            <div className="formGrid">
              <Panel title="Grant / revoke section access" icon={<ShieldCheck weight="bold" />}>
                <label className="field">User ID<input value={accessForm.userId} onChange={(e) => setAccessForm({ ...accessForm, userId: e.target.value })} /></label>
                <label className="field">Section
                  <Dropdown value={accessForm.section} onChange={(v) => setAccessForm({ ...accessForm, section: v })} options={toOptions(["home", "owner_cockpit", "customers", "invoices", "inventory", "workshop", "content", "audit_books", "team", "buyback", "schemes", "repairs"])} />
                </label>
                <label className="field">Can access
                  <Dropdown value={accessForm.canAccess ? "yes" : "no"} onChange={(v) => setAccessForm({ ...accessForm, canAccess: v === "yes" })} options={toOptions(["yes", "no"])} />
                </label>
                <button type="button" disabled={busy || !readyForOwner || !accessForm.userId} onClick={() => run("Access updated", async () => {
                  await call("/access", { method: "POST", headers: auth(state.token), body: JSON.stringify({ userId: accessForm.userId, section: accessForm.section, canAccess: accessForm.canAccess }) });
                  await loadAccess();
                })}><CheckCircle weight="bold" /> Save access</button>
              </Panel>
            </div>
            <DataTable
              title="Signed in"
              rows={state.user ? [asRecord(state.user)] : []}
              columns={["fullName", "email", "role"]}
              empty="Nobody signed in."
            />
            <DataTable title="Access grants" rows={accessList} columns={["userId", "section", "canAccess"]} empty="No access grants loaded." />
          </section>
        )}

        {screen === "setup" && import.meta.env.DEV && (
          <section className="screen">
            <div className="splitHeader">
              <div>
                <p className="eyebrow">Developer tools</p>
                <h2>Provision a shop for local testing.</h2>
                <p className="guardCopy">This screen is hidden in production builds. Shop staff never see it: they only sign in.</p>
              </div>
              <button className="secondary" type="button" disabled={busy} onClick={() => run("API connection ok", async () => {
                await call("/health");
              })}>
                <ShieldCheck weight="bold" /> Check API
              </button>
            </div>
            <div className="setupGrid">
              <Panel title="Platform admin" icon={<ShieldCheck weight="bold" />}>
                <label className="field">API base<input value={apiBase} onChange={(event) => setApiBase(event.target.value)} /></label>
                <label className="field">Admin email<input value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} /></label>
                <label className="field">Admin password<input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} /></label>
                <button type="button" disabled={busy} onClick={() => run("Platform admin logged in", async () => {
                  const body = asRecord(await call("/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
                  })) as LoginResponse;
                  setProvisionToken(body.accessToken);
                })}>
                  <ArrowRight weight="bold" /> Login admin
                </button>
              </Panel>

              <Panel title="Create shop" icon={<Storefront weight="bold" />}>
                <label className="field">Shop name<input value={shopName} onChange={(event) => setShopName(event.target.value)} /></label>
                <button type="button" disabled={busy || !provisionToken} onClick={() => run("Shop created", async () => {
                  const body = asRecord(await call("/shops", {
                    method: "POST",
                    headers: auth(provisionToken),
                    body: JSON.stringify({ name: shopName, defaultLanguage: "ta-IN" }),
                  }));
                  setProvisionShopId(String(body.id));
                })}>
                  <CheckCircle weight="bold" /> Create shop
                </button>
              </Panel>

              <Panel title="Create staff" icon={<UsersThree weight="bold" />}>
                <label className="field">Owner email<input value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} /></label>
                <label className="field">Sales email<input value={salesEmail} onChange={(event) => setSalesEmail(event.target.value)} /></label>
                <label className="field">Staff password<input type="password" value={staffPassword} onChange={(event) => setStaffPassword(event.target.value)} /></label>
                <button type="button" disabled={busy || !provisionToken || !provisionShopId} onClick={() => run("Shop staff created", async () => {
                  await call("/users", {
                    method: "POST",
                    headers: auth(provisionToken),
                    body: JSON.stringify({ shopId: provisionShopId, fullName: "Sornam Owner", email: ownerEmail, password: staffPassword, role: "owner" }),
                  });
                  await call("/users", {
                    method: "POST",
                    headers: auth(provisionToken),
                    body: JSON.stringify({ shopId: provisionShopId, fullName: "Counter Sales", email: salesEmail, password: staffPassword, role: "salesperson" }),
                  });
                })}>
                  <CheckCircle weight="bold" /> Create shop staff
                </button>
              </Panel>

              <Panel title="Sign in with these" icon={<Microphone weight="bold" />}>
                <p className="guardCopy">Provisioning done. Sign out and use these on the normal sign-in screen.</p>
                <label className="field">Owner<input readOnly value={ownerEmail} /></label>
                <label className="field">Sales<input readOnly value={salesEmail} /></label>
                <label className="field">Password<input readOnly value={staffPassword} /></label>
                <button className="secondary" type="button" onClick={signOut}>
                  <ArrowRight weight="bold" /> Go to sign in
                </button>
              </Panel>
            </div>
          </section>
        )}

      </main>

      {/* Phone: a thumb-reachable bottom bar for the everyday screens, with the
          rest behind a "More" sheet. Hidden on tablet/desktop via CSS. */}
      <nav className="bottomNav" aria-label="Shop menu">
        {EVERYDAY_NAV.map((item) => (
          <button key={item.screen} type="button" className={screen === item.screen ? "bnItem active" : "bnItem"} onClick={() => go(item.screen)}>
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
        <button type="button" className={moreOpen ? "bnItem active" : "bnItem"} onClick={() => setMoreOpen((v) => !v)}>
          <List weight="bold" /><span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="moreSheet" onClick={() => setMoreOpen(false)}>
          <div className="moreSheetInner" onClick={(e) => e.stopPropagation()}>
            <div className="moreGrid">
              {MORE_NAV.map((item) => (
                <button key={item.screen} type="button" className="moreTile" onClick={() => go(item.screen)}>
                  {item.icon}<span>{item.label}</span>
                </button>
              ))}
            </div>
            <button className="secondary full" type="button" onClick={signOut}>Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

function screenTitle(screen: Screen) {
  const titles: Record<Screen, string> = {
    home: "Home",
    speak: "Speak to your shop",
    cockpit: "Reports",
    sales: "Sales",
    invoices: "Sales & bills",
    inventory: "Stock",
    karigar: "Workshop",
    buyback: "Old gold",
    content: "Posts",
    customers: "Customers",
    repairs: "Repairs",
    schemes: "Schemes",
    rates: "Gold rate",
    accounting: "Accounting",
    audit: "Audit books",
    scanbill: "Scan bill",
    whatsapp: "WhatsApp",
    team: "Staff",
    setup: "Developer setup",
  };
  return titles[screen];
}

function NavButton({
  icon,
  label,
  active,
  featured,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  featured?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={["navButton", active ? "active" : "", featured ? "featured" : ""].join(" ")} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function SessionItem({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="sessionItem">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={ready ? "ready" : ""} />
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metricCard">
      <span>{label}</span>
      <strong className="num">{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function Stat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <article className="stat">
      <div className="k">{icon} {label}</div>
      <div className="v num">{value}</div>
      <div className="s">{detail}</div>
    </article>
  );
}

function FollowItem({
  initial,
  title,
  detail,
  pill,
  tone,
}: {
  initial: string;
  title: string;
  detail: string;
  pill: string;
  tone: "ready" | "due" | "work" | "pend";
}) {
  return (
    <div className="fitem">
      <div className="fic gold">{initial}</div>
      <div>
        <div className="t">{title}</div>
        <div className="d">{detail}</div>
      </div>
      <div className="meta"><span className={`pill ${tone}`}>{pill}</span></div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
  dark,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <article className={dark ? "panel darkPanel" : "panel"}>
      <div className="panelHead">
        <span>{icon}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </article>
  );
}

function CheckRow({ done, text }: { done: boolean; text: string }) {
  return (
    <div className={done ? "checkRow done" : "checkRow"}>
      <CheckCircle weight="bold" />
      <span>{text}</span>
    </div>
  );
}

/**
 * Renders whatever the live agent produced as a real visual card: a chooser for
 * "which one?", a detail/list for lookups, a confirmation for a pending write,
 * or a saved receipt. Tapping a chooser option resumes the spoken flow.
 */
function LiveCardView({ card, onChoose }: { card: LiveCard; onChoose: (id: string) => void }) {
  if (card.kind === "choose") {
    return (
      <div className="liveCard chooseCard">
        <p className="liveCardTitle">{card.title}</p>
        <div className="chooseGrid">
          {card.options.map((opt) => (
            <button key={opt.id} type="button" className="chooseOption" onClick={() => onChoose(opt.id)}>
              <strong>{opt.label}</strong>
              {opt.sublabel && <small>{opt.sublabel}</small>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (card.kind === "confirm") {
    return (
      <div className="liveCard confirmCard">
        <p className="liveCardTitle">{card.title}</p>
        <p className="liveCardMsg">{card.message}</p>
      </div>
    );
  }

  if (card.kind === "saved") {
    return (
      <div className="liveCard savedCard">
        <p className="liveCardTitle"><CheckCircle weight="fill" /> {card.title}</p>
        {card.rows.length > 0 && (
          <dl className="cardRows">
            {card.rows.map((r, i) => (
              <div className="cardRow" key={i}><dt>{r.label}</dt><dd>{r.value}</dd></div>
            ))}
          </dl>
        )}
      </div>
    );
  }

  // detail / list
  return (
    <div className="liveCard">
      <p className="liveCardTitle">{card.title}</p>
      {card.rows.length === 0 ? (
        <p className="liveCardMsg">Nothing found.</p>
      ) : (
        <div className="resultList">
          {card.rows.map((row) => (
            <div className="resultItem" key={row.id}>
              <div className="resultHead">
                <strong>{row.title}</strong>
                {row.subtitle && <span>{row.subtitle}</span>}
              </div>
              {row.fields && row.fields.length > 0 && (
                <div className="resultFields">
                  {row.fields.map((f, i) => (
                    <span key={i}><em>{f.label}</em> {f.value}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Turn an API field name into a human label: goldRatePerGram -> Gold rate per gram. */
function humanizeKey(key: string) {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\bid\b/gi, "ID")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const MONEY_HINT = /(amount|total|value|paid|pending|price|rate|charge|cash|gst|taxable)/i;
// Some fields contain money words like "total" but are really weights, counts or
// percentages (e.g. totalIssuedWeight, totalJobs, avgWastagePercent). These hints
// take precedence over MONEY_HINT so a karigar's issued grams never render as ₹.
const WEIGHT_HINT = /weight|grams/i;
const COUNT_HINT = /(jobs|count|returns|flagged|items|qty|quantity)/i;
const PERCENT_HINT = /percent/i;
const HIDE_KEYS = /(^id$|Id$|invocationId|shopId|userId|createdAt|updatedAt|pdfUrl|status$|^action$)/;

/** Format one readout value by what the field actually represents, not just its name. */
function formatReadoutValue(key: string, value: unknown): { text: string; numeric: boolean } {
  const num = Number(value);
  const isNum = Number.isFinite(num);
  if (isNum && WEIGHT_HINT.test(key)) return { text: `${num} g`, numeric: true };
  if (isNum && PERCENT_HINT.test(key)) return { text: `${num}%`, numeric: true };
  if (isNum && COUNT_HINT.test(key)) return { text: String(num), numeric: true };
  if (isNum && MONEY_HINT.test(key)) return { text: money(value), numeric: true };
  return { text: String(value), numeric: false };
}

/** Render an API record as clean labelled rows. No braces, no shop owner ever sees JSON. */
function Readout({ record, dark }: { record: unknown; dark?: boolean }) {
  const rows = Object.entries(asRecord(record)).filter(
    ([key, val]) => !HIDE_KEYS.test(key) && val !== null && val !== undefined && val !== "" && typeof val !== "object"
  );
  if (rows.length === 0) return null;
  return (
    <dl className={dark ? "readout dark" : "readout"}>
      {rows.map(([key, val]) => {
        const cell = formatReadoutValue(key, val);
        return (
          <div className="readoutRow" key={key}>
            <dt>{humanizeKey(key)}</dt>
            <dd className={cell.numeric ? "num" : undefined}>{cell.text}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function InventoryForm({
  value,
  onChange,
}: {
  value: {
    sku: string;
    name: string;
    category: string;
    purity: string;
    grossWeight: string;
    netWeight: string;
    estimatedValue: string;
    location: string;
    photoUrl: string;
  };
  onChange: (value: {
    sku: string;
    name: string;
    category: string;
    purity: string;
    grossWeight: string;
    netWeight: string;
    estimatedValue: string;
    location: string;
    photoUrl: string;
  }) => void;
}) {
  return (
    <div className="miniGrid">
      <label className="field">SKU<input value={value.sku} onChange={(event) => onChange({ ...value, sku: event.target.value })} /></label>
      <label className="field">Name<input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></label>
      <label className="field">Category<input value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value })} /></label>
      <label className="field">Purity<input value={value.purity} onChange={(event) => onChange({ ...value, purity: event.target.value })} /></label>
      <label className="field">Gross weight<input value={value.grossWeight} onChange={(event) => onChange({ ...value, grossWeight: event.target.value })} /></label>
      <label className="field">Net weight<input value={value.netWeight} onChange={(event) => onChange({ ...value, netWeight: event.target.value })} /></label>
      <label className="field">Estimated value<input value={value.estimatedValue} onChange={(event) => onChange({ ...value, estimatedValue: event.target.value })} /></label>
      <label className="field">Location<input value={value.location} onChange={(event) => onChange({ ...value, location: event.target.value })} /></label>
      <label className="field" style={{ gridColumn: "1 / -1" }}>Product photo (used by Content Studio)
        <input type="file" accept="image/*" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const compressed = await compressImageFile(file);
          onChange({ ...value, photoUrl: compressed });
        }} />
      </label>
      {value.photoUrl ? (
        <div className="genPhotoPreview" style={{ gridColumn: "1 / -1" }}>
          <img src={value.photoUrl} alt="product" />
          <button type="button" className="chip" onClick={() => onChange({ ...value, photoUrl: "" })}>Remove photo</button>
        </div>
      ) : null}
    </div>
  );
}

type Option = { value: string; label: string };
type SocialProfile = { id: string; service: string; username: string };
const toOptions = (values: string[]): Option[] => values.map((v) => ({ value: v, label: v }));

// Downscale + re-encode an uploaded photo to a compact JPEG data URL in the
// browser. A raw phone photo (5-12MB) as base64 blows the server body limit and
// bloats the DB; this caps the longest side at 1280px and re-encodes to JPEG so
// the stored data URL stays a few hundred KB while still being a good reference.
async function compressImageFile(file: File, maxSide = 1280, quality = 0.82): Promise<string> {
  const readAsDataUrl = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read the image file"));
      reader.readAsDataURL(f);
    });
  const original = await readAsDataUrl(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode the image"));
      el.src = original;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", quality);
    // Only use the compressed result if it actually helped.
    return out && out.length < original.length ? out : original;
  } catch {
    return original; // Fall back to the raw upload if canvas encoding fails.
  }
}

// A data URL (from a file upload) becomes an inline base64 reference the studio
// can preserve; a plain URL is passed through as-is.
function imageRefFromUrl(dataOrUrl: string): Record<string, string> {
  const match = /^data:([^;,]+)?;base64,(.+)$/s.exec(dataOrUrl);
  if (match) return { base64: match[2], mimeType: match[1] || "image/jpeg" };
  return { url: dataOrUrl };
}
// Voice languages for the live conversation. Value is the STT/BCP-47 code; the
// first two letters are sent to the server to pin Gemini's reply language.
const LANG_OPTIONS: Option[] = [
  { value: "en-IN", label: "English" },
  { value: "hi-IN", label: "Hindi" },
  { value: "ta-IN", label: "Tamil" },
  { value: "te-IN", label: "Telugu" },
  { value: "kn-IN", label: "Kannada" },
];

// Concrete example commands shown on the Speak screen so a shopkeeper is never
// staring at a blank mic wondering what to say. Clicking one fills the box.
const VOICE_EXAMPLES: string[] = [
  "Sold a 22 carat gold chain, 12 grams, to Lakshmi, cash",
  "How much cash did we take today?",
  "Who has pending payments?",
  "Add a new 22 carat gold ring, 8 grams",
  "How much stock do we have?",
  "Issue 20 grams to Kumar",
  "Add customer Priya, phone 9876543210",
];

/** Themed dropdown that replaces the native <select> so the open list matches the
 * rest of the UI instead of the raw browser control. */
function Dropdown({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const current = options.find((o) => o.value === value);
  return (
    <div className={open ? "dd open" : "dd"} ref={ref}>
      <button type="button" className="ddTrigger" onClick={() => setOpen((v) => !v)}>
        <span className={current ? "" : "ddPlaceholder"}>{current?.label ?? placeholder ?? "Select"}</span>
      </button>
      {open && (
        <div className="ddMenu" role="listbox">
          {options.map((o) => (
            <button type="button" key={o.value} role="option" aria-selected={o.value === value} className={o.value === value ? "ddOption sel" : "ddOption"} onClick={() => { onChange(o.value); setOpen(false); }}>
              <span>{o.label}</span>
              {o.value === value && <CheckCircle weight="fill" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Themed date picker (YYYY-MM-DD) with a self-drawn calendar, so no native popup. */
function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const [view, setView] = useState(() => selected ?? new Date());
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const y = view.getFullYear();
  const m = view.getMonth();
  const startDay = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < startDay; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  const pick = (d: number) => { onChange(`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`); setOpen(false); };
  const isSel = (d: number) => selected != null && selected.getFullYear() === y && selected.getMonth() === m && selected.getDate() === d;
  return (
    <div className={open ? "dd open dateField" : "dd dateField"} ref={ref}>
      <button type="button" className="ddTrigger dateTrigger" onClick={() => setOpen((v) => !v)}>
        <span className={value ? "" : "ddPlaceholder"}>{value || "Select date"}</span>
      </button>
      {open && (
        <div className="calPop">
          <div className="calHead">
            <button type="button" className="calNav" onClick={() => setView(new Date(y, m - 1, 1))} aria-label="Previous month">{"‹"}</button>
            <span>{view.toLocaleString("en-US", { month: "long", year: "numeric" })}</span>
            <button type="button" className="calNav" onClick={() => setView(new Date(y, m + 1, 1))} aria-label="Next month">{"›"}</button>
          </div>
          <div className="calGrid calDow">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="calGrid">
            {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
              <button type="button" key={d} className={isSel(d) ? "calDay sel" : "calDay"} onClick={() => pick(d)}>{d}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Themed date + time picker (matches the gold theme). Value is a local
 * "YYYY-MM-DDTHH:mm" string, ready for new Date(value). Used for scheduling. */
function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const parsed = value ? new Date(value) : null;
  const [view, setView] = useState(() => parsed ?? new Date());
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const y = view.getFullYear();
  const m = view.getMonth();
  const startDay = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < startDay; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  const datePart = value ? value.slice(0, 10) : "";
  const h24 = parsed ? parsed.getHours() : 12;
  const minute = parsed ? parsed.getMinutes() : 0;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const hour12 = ((h24 + 11) % 12) + 1;
  const two = (n: number) => String(n).padStart(2, "0");
  const todayStr = () => { const n = new Date(); return `${n.getFullYear()}-${two(n.getMonth() + 1)}-${two(n.getDate())}`; };

  const emit = (dateStr: string, h12: number, min: number, ap: string) => {
    const ds = dateStr || todayStr();
    let h = h12 % 12;
    if (ap === "PM") h += 12;
    onChange(`${ds}T${two(h)}:${two(min)}`);
  };
  const pickDate = (d: number) => emit(`${y}-${two(m + 1)}-${two(d)}`, hour12, minute, ampm);
  const isSel = (d: number) => parsed != null && parsed.getFullYear() === y && parsed.getMonth() === m && parsed.getDate() === d;

  const label = value
    ? new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
    : "Select date & time";

  const hourOpts = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
  const minOpts = Array.from({ length: 12 }, (_, i) => ({ value: String(i * 5), label: two(i * 5) }));
  const apOpts = [{ value: "AM", label: "AM" }, { value: "PM", label: "PM" }];

  return (
    <div className={open ? "dd open dateField" : "dd dateField"} ref={ref}>
      <button type="button" className="ddTrigger dateTrigger" onClick={() => setOpen((v) => !v)}>
        <span className={value ? "" : "ddPlaceholder"}>{label}</span>
      </button>
      {open && (
        <div className="calPop">
          <div className="calHead">
            <button type="button" className="calNav" onClick={() => setView(new Date(y, m - 1, 1))} aria-label="Previous month">{"‹"}</button>
            <span>{view.toLocaleString("en-US", { month: "long", year: "numeric" })}</span>
            <button type="button" className="calNav" onClick={() => setView(new Date(y, m + 1, 1))} aria-label="Next month">{"›"}</button>
          </div>
          <div className="calGrid calDow">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="calGrid">
            {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
              <button type="button" key={d} className={isSel(d) ? "calDay sel" : "calDay"} onClick={() => pickDate(d)}>{d}</button>
            ))}
          </div>
          <div className="calTime">
            <span className="calTimeLabel">Time</span>
            <Dropdown value={String(hour12)} options={hourOpts} onChange={(v) => emit(datePart, Number(v), minute, ampm)} />
            <span className="calColon">:</span>
            <Dropdown value={String(minute)} options={minOpts} onChange={(v) => emit(datePart, hour12, Number(v), ampm)} />
            <Dropdown value={ampm} options={apOpts} onChange={(v) => emit(datePart, hour12, minute, v)} />
          </div>
          <div className="calFoot">
            <button type="button" className="calLink" onClick={() => { onChange(""); }}>Clear</button>
            <button type="button" className="calLink" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

const PRICE_WS = (import.meta.env.VITE_PRICE_WS as string | undefined) ?? "http://localhost:4000";

/** Live gold rate board. Rendered from the App-level real-time price feed (shared
 * with the topbar ticker); re-renders the "updated Xs ago" label every second. */
function LiveRateBoard({ data }: { data: Record<string, unknown> | null }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  if (!data) return null;
  const spot = asRecord(data.spot);
  const gold = asRecord(data.gold);
  const bg = asRecord(asRecord(data.basis).gold);
  const updated = data.updatedAt ? new Date(String(data.updatedAt)).getTime() : now;
  const secs = Math.max(0, Math.round((now - updated) / 1000));
  const agoText = secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
  const usd = (v: unknown) => "$" + Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const spotCard = (label: string, q: Record<string, unknown>, fmt: (v: unknown) => string) => (
    <div className="spotCard">
      <p className="spotLabel">{label}</p>
      <p className="spotPrice">{fmt(q.price)}</p>
      <p className="spotRange"><span className="lo">{fmt(q.low)}</span> <span className="sep">|</span> <span className="hi">{fmt(q.high)}</span></p>
    </div>
  );
  const metalCard = (name: string, badge: string, big: unknown, bigUnit: string, basisLine: string, perVal: unknown) => (
    <div className="metalCard">
      <div className="metalHead">
        <div><h3>{name}</h3><p className="metalSub">India rate, INR</p></div>
        <span className="metalBadge">{badge}</span>
      </div>
      <p className="metalBig">{money(big)}<span className="metalUnit"> /{bigUnit}</span></p>
      <p className="metalBasis">{basisLine}</p>
      <div className="metalPer"><span>Per gram</span><b>{money(perVal)}<span className="metalUnit"> /g</span></b></div>
    </div>
  );
  return (
    <article className="tablePanel rateBoard">
      <div className="panelHead rateBoardHead">
        <span><Coins weight="bold" /></span>
        <h3>Live gold rate</h3>
        <div className="liveAgo"><span className="liveDot" /> updated {agoText}</div>
      </div>
      <div className="spotStrip">
        {spotCard("Gold ($/oz)", asRecord(spot.gold_usd), usd)}
        {spotCard("USD to INR", asRecord(spot.usd_inr), (v) => Number(v ?? 0).toFixed(3))}
      </div>
      <div className="metalStrip">
        {metalCard("Gold", "999 FINE", gold.per_10g, "10g", `Intl spot ${money(bg.intl_per_10g)}/10g + duty ${String(bg.duty_pct)}% + GST ${String(bg.gst_pct)}% + premium ${String(bg.market_premium_pct)}% = +${String(bg.effective_pct)}%`, gold.per_gram)}
      </div>
    </article>
  );
}

/** Visual gallery of generated content assets: one big, clean card per real
 * output with a post-type label, caption, review status, Approve/Revise, and a
 * platform-pick publish step once approved. */
function ContentGallery({
  assets,
  onReview,
  reviewBusyId,
  onPublish,
  publishBusyId,
  profiles,
  connected,
  mediaOrigin,
}: {
  assets: Array<Record<string, unknown>>;
  onReview: (assetId: string, status: "approved" | "revised") => void;
  reviewBusyId: string;
  onPublish: (assetId: string, profileIds: string[], scheduledAt?: string) => void;
  publishBusyId: string;
  profiles: SocialProfile[];
  connected: boolean;
  mediaOrigin: string;
}) {
  // Only show real generated media. Stub placeholders (the offline provider's
  // sornam.local URLs) and empty entries are filtered out so the gallery is clean.
  const displayable = assets.filter((a) => {
    const url = String(a.url ?? "");
    return url.startsWith("data:") || (/^https?:\/\//.test(url) && !url.includes("assets.sornam.local"));
  });
  if (!displayable.length) return null;
  return (
    <article className="tablePanel galleryPanel">
      <div className="panelHead">
        <span><ImageSquare weight="bold" /></span>
        <h3>Generated posts</h3>
      </div>
      <div className="postGrid">
        {displayable.map((asset, index) => (
          <PostCard
            key={String(asset.id ?? index)}
            asset={asset}
            onReview={onReview}
            reviewBusy={reviewBusyId === String(asset.id ?? "")}
            onPublish={onPublish}
            publishBusy={publishBusyId === String(asset.id ?? "")}
            profiles={profiles}
            connected={connected}
            mediaOrigin={mediaOrigin}
          />
        ))}
      </div>
    </article>
  );
}

/** One generated post: review, then (once approved) pick platforms and publish. */
function PostCard({
  asset,
  onReview,
  reviewBusy,
  onPublish,
  publishBusy,
  profiles,
  connected,
  mediaOrigin,
}: {
  asset: Record<string, unknown>;
  onReview: (assetId: string, status: "approved" | "revised") => void;
  reviewBusy: boolean;
  onPublish: (assetId: string, profileIds: string[], scheduledAt?: string) => void;
  publishBusy: boolean;
  profiles: SocialProfile[];
  connected: boolean;
  mediaOrigin: string;
}) {
  const url = String(asset.url ?? "");
  // Display from the local API (always reachable), regardless of the stored URL
  // which may be a public tunnel used only when publishing to Instagram/Facebook.
  const mediaIdx = url.indexOf("/media/content/");
  const displaySrc = mediaIdx >= 0 ? `${mediaOrigin}${url.slice(mediaIdx)}` : url;
  const isReel = String(asset.assetType) === "reel";
  const meta = (asset.metadata as Record<string, unknown>) ?? {};
  const reviewStatus = String(meta.reviewStatus ?? "pending");
  const publishStatus = String(meta.publishStatus ?? "");
  const publishedTo = Array.isArray(meta.publishedTo) ? (meta.publishedTo as Array<Record<string, unknown>>) : [];
  const assetId = String(asset.id ?? "");
  const typeLabel = isReel ? "Instagram Reel" : "Instagram Single Post";
  const isApproved = reviewStatus === "approved";
  const isPublished = publishStatus === "published";
  const isScheduled = publishStatus === "scheduled";
  const scheduledAt = String(meta.scheduledAt ?? "");

  // Default: every connected profile selected.
  const [selected, setSelected] = useState<string[]>(profiles.map((p) => p.id));
  useEffect(() => { setSelected(profiles.map((p) => p.id)); }, [profiles]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

  const statusMeta = isPublished
    ? { label: "Published", cls: "good" }
    : isScheduled
      ? { label: "Scheduled", cls: "pending" }
      : isApproved
        ? { label: "Approved", cls: "good" }
        : reviewStatus === "revised"
          ? { label: "Revision requested", cls: "warn" }
          : { label: "Pending review", cls: "pending" };

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="postCard">
      <div className="postHead">
        <span className="postType">{typeLabel}</span>
        <span className={`postStatus ${statusMeta.cls}`}>{statusMeta.label}</span>
      </div>
      <div className={`postMedia ${isReel ? "reel" : "post"}`}>
        <img src={displaySrc} alt={String(asset.caption ?? "")} />
      </div>
      <div className="postBody">
        <p className="postCaption">{String(asset.caption ?? "")}</p>

        {isPublished ? (
          <p className="publishedNote">
            <CheckCircle weight="bold" /> {publishedTo.length ? `Published to ${publishedTo.map((p) => String(p.service)).join(", ")}` : "Published"}
          </p>
        ) : isScheduled ? (
          <div className="publishBlock">
            <p className="publishedNote">
              <ArrowClockwise weight="bold" /> Scheduled for {scheduledAt ? new Date(scheduledAt).toLocaleString() : "later"}
            </p>
            <button
              type="button"
              className="btn-publish"
              disabled={publishBusy || selected.length === 0}
              onClick={() => onPublish(assetId, selected)}
            >
              {publishBusy ? <CircleNotch className="spin" weight="bold" /> : <ArrowRight weight="bold" />}
              Publish now instead
            </button>
          </div>
        ) : (
          <>
            <div className="postActions">
              <button type="button" className="btn-approve" disabled={reviewBusy || isApproved} onClick={() => onReview(assetId, "approved")}>
                {reviewBusy ? <CircleNotch className="spin" weight="bold" /> : <CheckCircle weight="bold" />}
                {isApproved ? "Approved" : "Approve"}
              </button>
              <button type="button" className="btn-revise" disabled={reviewBusy} onClick={() => onReview(assetId, "revised")}>
                <ArrowClockwise weight="bold" /> Revise
              </button>
            </div>

            {isApproved && (
              <div className="publishBlock">
                {!connected ? (
                  <p className="mutedText">Connect a social account above to publish this post.</p>
                ) : profiles.length === 0 ? (
                  <p className="mutedText">No connected profiles to publish to.</p>
                ) : (
                  <>
                    <p className="publishLabel">Publish to:</p>
                    <div className="platformPicks">
                      {profiles.map((p) => (
                        <label key={p.id} className={`platformPick ${selected.includes(p.id) ? "on" : ""}`}>
                          <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                          {p.service} · {p.username}
                        </label>
                      ))}
                    </div>
                    <div className="publishActions">
                      <button
                        type="button"
                        className="btn-publish"
                        disabled={publishBusy || selected.length === 0}
                        onClick={() => onPublish(assetId, selected)}
                      >
                        {publishBusy ? <CircleNotch className="spin" weight="bold" /> : <ArrowRight weight="bold" />}
                        Publish now
                      </button>
                      <button type="button" className="btn-revise" disabled={publishBusy} onClick={() => setShowSchedule((s) => !s)}>
                        <ArrowClockwise weight="bold" /> Schedule
                      </button>
                    </div>
                    {showSchedule && (
                      <div className="scheduleRow">
                        <DateTimeField value={scheduleAt} onChange={setScheduleAt} />
                        <button
                          type="button"
                          className="btn-publish"
                          disabled={publishBusy || selected.length === 0 || !scheduleAt}
                          onClick={() => onPublish(assetId, selected, new Date(scheduleAt).toISOString())}
                        >
                          Schedule
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DataTable({
  title,
  rows,
  columns,
  empty,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  columns: string[];
  empty: string;
}) {
  return (
    <article className="tablePanel">
      <div className="panelHead">
        <span><FileText weight="bold" /></span>
        <h3>{title}</h3>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => <th key={column}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length}>{empty}</td></tr>
            ) : rows.map((row, rowIndex) => (
              <tr key={String(row.id ?? rowIndex)}>
                {columns.map((column) => (
                  <td key={column}>{textValue(row[column], "-")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

