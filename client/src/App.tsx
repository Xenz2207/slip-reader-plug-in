import { useCallback, useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { SidebarNav, type NavKey } from './components/SidebarNav';
import { TransactionDetailDrawer } from './components/TransactionDetailDrawer';
import { OverviewPage } from './pages/OverviewPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { LinePluginPage } from './pages/LinePluginPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { api, ApiAuthError, authStorage, subscribeLiveEvents } from './lib/api';
import { CHANNEL_META, formatBaht, STATUS_META } from './lib/format';
import type {
  AuthUser,
  CategoryItem,
  DashboardSummary,
  PublicSettings,
  RemoteSlipApiHealth,
  SellerAccount,
  ShopInfo,
  ThaiBankOption,
  Transaction,
  WebhookLog,
} from './types';

interface LiveToast {
  id: number;
  title: string;
  body: string;
  tx?: Transaction;
}

export function App() {
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [shops, setShops] = useState<ShopInfo[]>([]);
  const [activeShopId, setActiveShopId] = useState<number>(authStorage.getShopId() || 0);

  const [showNewShopModal, setShowNewShopModal] = useState<boolean>(false);
  const [newShopName, setNewShopName] = useState<string>('');
  const [creatingShop, setCreatingShop] = useState<boolean>(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);

  const [activeNav, setActiveNav] = useState<NavKey>('overview');
  const [txInitialFilter, setTxInitialFilter] = useState<string>('ALL');
  const [chartDays, setChartDays] = useState<number>(7);
  const [refreshSignal, setRefreshSignal] = useState<number>(0);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [sellerAccounts, setSellerAccounts] = useState<SellerAccount[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [banks, setBanks] = useState<ThaiBankOption[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [slipApiHealth, setSlipApiHealth] = useState<RemoteSlipApiHealth | null>(null);
  const [sseConnected, setSseConnected] = useState<boolean>(false);

  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [toast, setToast] = useState<LiveToast | null>(null);

  const handleLogout = useCallback(() => {
    void api.logout().catch(() => {});
    authStorage.clear();
    setShowLogoutConfirm(false);
    setUser(null);
    setShops([]);
    setActiveShopId(0);
    setSummary(null);
    setRecentTx([]);
  }, []);

  const loadShopData = useCallback(async () => {
    if (!user || !activeShopId) return;
    try {
      const [sumRes, txRes, accRes, catRes, setRes, bankRes, logRes] = await Promise.all([
        api.getSummary(chartDays),
        api.getTransactions({ limit: 10 }),
        api.getSellerAccounts(),
        api.getCategories(),
        api.getSettings(),
        api.getBanks(),
        api.getWebhookLogs(30),
      ]);
      setSummary(sumRes);
      setRecentTx(txRes.items);
      setSellerAccounts(accRes.accounts);
      setCategories(catRes.categories);
      setSettings(setRes.settings);
      setBanks(bankRes.banks);
      setWebhookLogs(logRes.logs);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        handleLogout();
      }
    }
  }, [user, activeShopId, chartDays, handleLogout]);

  const checkSlipApi = useCallback(async () => {
    if (!user) return;
    try {
      const health = await api.getSlipApiHealth();
      setSlipApiHealth(health);
    } catch {
      setSlipApiHealth({
        online: false,
        httpStatus: 0,
        baseUrl: 'https://my-slip-reader.onrender.com',
        service: 'Thai Slip Reader API',
        version: '-',
        ocrEngine: '-',
        latencyMs: 0,
        error: 'เชื่อมต่อไม่ได้',
      });
    }
  }, [user]);

  // Restore session on initial mount
  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    api
      .getMe()
      .then((res) => {
        setUser(res.user);
        setShops(res.shops);
        const sid = authStorage.getShopId();
        const validShop = res.shops.find((s) => s.id === sid) || res.shops[0];
        if (validShop) {
          authStorage.setShopId(validShop.id);
          setActiveShopId(validShop.id);
        }
      })
      .catch(() => {
        authStorage.clear();
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  useEffect(() => {
    if (user && activeShopId) {
      void loadShopData();
    }
  }, [user, activeShopId, loadShopData]);

  useEffect(() => {
    if (user && activeShopId) {
      void checkSlipApi();
    }
  }, [user, activeShopId, checkSlipApi]);

  useEffect(() => {
    if (!user || !activeShopId) return;
    const unsubscribe = subscribeLiveEvents({
      onConnect: () => setSseConnected(true),
      onDisconnect: () => setSseConnected(false),
      onTransactionChange: (tx) => {
        void loadShopData();
        setRefreshSignal((n) => n + 1);
        if (tx) {
          const chLabel = CHANNEL_META[tx.channel]?.label || tx.channel;
          const stLabel = STATUS_META[tx.status]?.label || tx.status;
          setToast({
            id: Date.now(),
            title: `สลิปใหม่จาก ${chLabel} · ${stLabel}`,
            body: `${formatBaht(tx.amount)} บาท${tx.customerName ? ` (${tx.customerName})` : ''}`,
            tx,
          });
        }
      },
      onWebhookLog: () => {
        void api.getWebhookLogs(30).then((r) => setWebhookLogs(r.logs));
      },
    });
    return unsubscribe;
  }, [user, activeShopId, loadShopData]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  function handleSwitchShop(nextShopId: number) {
    authStorage.setShopId(nextShopId);
    setActiveShopId(nextShopId);
    setSelectedTx(null);
    setRefreshSignal((n) => n + 1);
  }

  async function handleCreateNewShop(e: React.FormEvent) {
    e.preventDefault();
    if (!newShopName.trim()) return;
    setCreatingShop(true);
    try {
      const res = await api.createShop({ name: newShopName.trim() });
      setShops(res.shops);
      handleSwitchShop(res.shop.id);
      setNewShopName('');
      setShowNewShopModal(false);
    } finally {
      setCreatingShop(false);
    }
  }

  function handleNavigate(page: NavKey, filterAlert = false) {
    if (page === 'transactions') {
      setTxInitialFilter(filterAlert ? 'ALERT' : 'ALL');
    }
    setActiveNav(page);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }

  function handleTxUpdated(updated: Transaction) {
    setSelectedTx(updated);
    void loadShopData();
    setRefreshSignal((n) => n + 1);
  }

  function handleTxDeleted() {
    setSelectedTx(null);
    void loadShopData();
    setRefreshSignal((n) => n + 1);
  }

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F5] text-[14px] text-[#52645D]">
        กำลังตรวจสอบเซสชันร้านค้า...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthPage
        onAuthenticated={({ user: u, shops: s, activeShopId: sid }) => {
          setUser(u);
          setShops(s);
          setActiveShopId(sid);
        }}
      />
    );
  }

  const totalAlerts =
    (summary?.allTime.duplicateCount || 0) +
    (summary?.allTime.wrongAccountCount || 0) +
    (summary?.allTime.reviewCount || 0);

  const activeShopObj = shops.find((s) => s.id === activeShopId);
  const isInspectingOtherShop =
    user.role === 'ADMIN' &&
    activeShopObj &&
    activeShopObj.ownerUserId !== user.id &&
    activeNav !== 'admin';

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F4F6F5]">
      <SidebarNav
        active={activeNav}
        onSelect={(key) => handleNavigate(key, false)}
        shopName={settings?.shopName || 'ร้านค้าของฉัน'}
        user={user}
        shops={shops}
        activeShopId={activeShopId}
        onSwitchShop={handleSwitchShop}
        onCreateShopClick={() => setShowNewShopModal(true)}
        onLogout={() => setShowLogoutConfirm(true)}
        sseConnected={sseConnected}
        alertCount={totalAlerts}
        slipApiHealth={slipApiHealth}
      />

      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
        <div className="max-w-[1220px] mx-auto space-y-5">
          {isInspectingOtherShop && (
            <div className="rounded-[12px] bg-[#0F241D] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <div>
                <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[11px] font-bold mr-2">
                  SUPER ADMIN
                </span>
                กำลังดูและจัดการข้อมูลของร้าน <strong>{activeShopObj.name}</strong>
                {activeShopObj.ownerUsername ? ` (เจ้าของ: @${activeShopObj.ownerUsername})` : ''}
              </div>
              <button
                type="button"
                onClick={() => handleNavigate('admin')}
                className="text-[#4ADE80] hover:underline font-semibold cursor-pointer"
              >
                กลับหน้าดูแลระบบรวม
              </button>
            </div>
          )}

          {activeNav === 'overview' && (
            <OverviewPage
              summary={summary}
              recentTransactions={recentTx}
              sellerAccounts={sellerAccounts}
              categories={categories}
              chartDays={chartDays}
              onChangeChartDays={setChartDays}
              onInspectTransaction={setSelectedTx}
              onVerifiedSlip={() => {
                void loadShopData();
                setRefreshSignal((n) => n + 1);
              }}
              onNavigate={handleNavigate}
            />
          )}

          {activeNav === 'transactions' && (
            <TransactionsPage
              categories={categories}
              initialStatusFilter={txInitialFilter}
              refreshSignal={refreshSignal}
              onInspectTransaction={setSelectedTx}
              onManualCreated={() => {
                void loadShopData();
                setRefreshSignal((n) => n + 1);
              }}
            />
          )}

          {activeNav === 'line-plugin' && (
            <LinePluginPage
              settings={settings}
              webhookLogs={webhookLogs}
              onSettingsUpdated={(updated) => {
                setSettings(updated);
                setShops((prev) =>
                  prev.map((s) => (s.id === activeShopId ? { ...s, name: updated.shopName } : s))
                );
              }}
              onRefreshLogs={() => void api.getWebhookLogs(30).then((r) => setWebhookLogs(r.logs))}
              onSimulated={() => {
                void loadShopData();
                setRefreshSignal((n) => n + 1);
              }}
              onInspectTransaction={setSelectedTx}
            />
          )}

          {activeNav === 'settings' && (
            <SettingsPage
              settings={settings}
              sellerAccounts={sellerAccounts}
              categories={categories}
              banks={banks}
              slipApiHealth={slipApiHealth}
              onSettingsUpdated={(updated) => {
                setSettings(updated);
                setShops((prev) =>
                  prev.map((s) => (s.id === activeShopId ? { ...s, name: updated.shopName } : s))
                );
              }}
              onAccountsChanged={() => void api.getSellerAccounts().then((r) => setSellerAccounts(r.accounts))}
              onCategoriesChanged={() => void api.getCategories().then((r) => setCategories(r.categories))}
              onRecheckSlipApi={checkSlipApi}
            />
          )}

          {activeNav === 'admin' && user.role === 'ADMIN' && (
            <AdminPage
              currentUserId={user.id}
              onInspectShop={(shopId) => {
                handleSwitchShop(shopId);
                handleNavigate('overview');
              }}
              onShopsChanged={() => {
                void api.getMe().then((r) => setShops(r.shops));
              }}
            />
          )}
        </div>
      </main>

      <TransactionDetailDrawer
        transaction={selectedTx}
        categories={categories}
        onClose={() => setSelectedTx(null)}
        onUpdated={handleTxUpdated}
        onDeleted={handleTxDeleted}
      />

      {/* Create New Shop Modal */}
      {showNewShopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#10201A]/40">
          <form
            onSubmit={handleCreateNewShop}
            className="overlay-scroll w-full max-w-[400px] rounded-[16px] bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-[#10201A]">เพิ่มร้านค้าใหม่ในบัญชีนี้</h2>
              <button
                type="button"
                onClick={() => setShowNewShopModal(false)}
                className="btn-press p-1 rounded-[8px] text-[#52645D] hover:bg-[#F4F6F5] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[13px] text-[#52645D]">
              ร้านค้าใหม่จะมีสมุดรายรับ บัญชีธนาคาร Whitelist และ Webhook URL ของ LINE / Facebook แยกต่างหาก
            </p>
            <div>
              <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">ชื่อร้านค้า *</label>
              <input
                type="text"
                required
                value={newShopName}
                onChange={(e) => setNewShopName(e.target.value)}
                placeholder="เช่น ร้านสาขา 2 หรือ ร้านขายส่ง"
                className="input-field"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowNewShopModal(false)}
                className="btn-press btn-secondary px-4 py-2 rounded-[10px] text-[13.5px] font-medium cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={creatingShop}
                className="btn-press btn-primary px-4 py-2 rounded-[10px] text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
              >
                {creatingShop ? 'กำลังสร้าง...' : 'สร้างร้านค้า'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#10201A]/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="ยืนยันการออกจากระบบ"
            className="overlay-scroll w-full max-w-[380px] rounded-[16px] bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-[#10201A]">ยืนยันการออกจากระบบ</h2>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="btn-press p-1 rounded-[8px] text-[#52645D] hover:bg-[#F4F6F5] cursor-pointer"
                aria-label="ปิดหน้าต่าง"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[13.5px] text-[#42544D]">
              คุณต้องการออกจากระบบบัญชี <strong className="text-[#10201A]">@{user.username}</strong> ใช่หรือไม่?
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="btn-press btn-secondary px-4 py-2 rounded-[10px] text-[13.5px] font-medium cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="btn-press px-4 py-2 rounded-[10px] text-[13.5px] font-semibold bg-[#C82829] text-white hover:bg-[#AF1F20] cursor-pointer"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Incoming Slip Notification Toast */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-40 max-w-[360px] ledger-elevated rounded-[14px] p-3.5 bg-white flex items-start gap-3">
          <div className="w-8 h-8 rounded-[9px] bg-[#E8F5F0] text-[#0D6B4E] flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div
            className="min-w-0 flex-1 cursor-pointer"
            onClick={() => {
              if (toast.tx) setSelectedTx(toast.tx);
              setToast(null);
            }}
          >
            <div className="text-[13px] font-semibold text-[#10201A]">{toast.title}</div>
            <div className="text-[12.5px] text-[#52645D] tabular-nums mt-0.5">{toast.body}</div>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 text-[#64756E] hover:text-[#10201A] cursor-pointer"
            aria-label="ปิดการแจ้งเตือน"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
export default App;
