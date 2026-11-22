import { useCallback, useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { SidebarNav, type NavKey } from './components/SidebarNav';
import { TransactionDetailDrawer } from './components/TransactionDetailDrawer';
import { OverviewPage } from './pages/OverviewPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { LinePluginPage } from './pages/LinePluginPage';
import { SettingsPage } from './pages/SettingsPage';
import { api, subscribeLiveEvents } from './lib/api';
import { CHANNEL_META, formatBaht, STATUS_META } from './lib/format';
import type {
  CategoryItem,
  DashboardSummary,
  PublicSettings,
  RemoteSlipApiHealth,
  SellerAccount,
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
  const [authRequired, setAuthRequired] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  const loadCoreData = useCallback(async () => {
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
      setAuthRequired(false);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Access Key')) {
        setAuthRequired(true);
      }
    }
  }, [chartDays]);

  const checkSlipApi = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadCoreData();
  }, [loadCoreData]);

  useEffect(() => {
    void checkSlipApi();
  }, [checkSlipApi]);

  useEffect(() => {
    if (authRequired) return;
    const unsubscribe = subscribeLiveEvents({
      onConnect: () => setSseConnected(true),
      onDisconnect: () => setSseConnected(false),
      onTransactionChange: (tx) => {
        void loadCoreData();
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
  }, [authRequired, loadCoreData]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  function handleNavigate(page: NavKey, filterAlert = false) {
    if (page === 'transactions') {
      setTxInitialFilter(filterAlert ? 'ALERT' : 'ALL');
    }
    setActiveNav(page);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }

  function handleTxUpdated(updated: Transaction) {
    setSelectedTx(updated);
    void loadCoreData();
    setRefreshSignal((n) => n + 1);
  }

  function handleTxDeleted() {
    setSelectedTx(null);
    void loadCoreData();
    setRefreshSignal((n) => n + 1);
  }

  if (authRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#F4F6F5]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            localStorage.setItem('slipflow_dashboard_key', keyInput.trim());
            void loadCoreData();
          }}
          className="ledger-elevated rounded-[16px] p-6 w-full max-w-[380px] space-y-4"
        >
          <h1 className="text-[18px] font-bold text-[#10201A]">เข้าสู่ระบบ SlipFlow Dashboard</h1>
          <p className="text-[13px] text-[#52645D]">
            เซิร์ฟเวอร์นี้เปิดใช้งานรหัสผ่าน Dashboard Access Key กรุณากรอกรหัสเพื่อเข้าถึงข้อมูลร้านค้า
          </p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Dashboard Access Key"
            className="input-field"
          />
          <button type="submit" className="btn-press btn-primary w-full py-2.5 rounded-[10px] font-semibold cursor-pointer">
            เข้าใช้งาน
          </button>
        </form>
      </div>
    );
  }

  const totalAlerts =
    (summary?.allTime.duplicateCount || 0) +
    (summary?.allTime.wrongAccountCount || 0) +
    (summary?.allTime.reviewCount || 0);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F4F6F5]">
      <SidebarNav
        active={activeNav}
        onSelect={(key) => handleNavigate(key, false)}
        shopName={settings?.shopName || 'ร้านค้าของฉัน'}
        sseConnected={sseConnected}
        alertCount={totalAlerts}
        slipApiHealth={slipApiHealth}
      />

      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
        <div className="max-w-[1220px] mx-auto">
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
                void loadCoreData();
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
                void loadCoreData();
                setRefreshSignal((n) => n + 1);
              }}
            />
          )}

          {activeNav === 'line-plugin' && (
            <LinePluginPage
              settings={settings}
              webhookLogs={webhookLogs}
              onSettingsUpdated={setSettings}
              onRefreshLogs={() => void api.getWebhookLogs(30).then((r) => setWebhookLogs(r.logs))}
              onSimulated={() => {
                void loadCoreData();
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
              onSettingsUpdated={setSettings}
              onAccountsChanged={() => void api.getSellerAccounts().then((r) => setSellerAccounts(r.accounts))}
              onCategoriesChanged={() => void api.getCategories().then((r) => setCategories(r.categories))}
              onRecheckSlipApi={checkSlipApi}
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
