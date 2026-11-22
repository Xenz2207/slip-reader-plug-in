import type {
  CategoryItem,
  DashboardSummary,
  PublicSettings,
  RemoteSlipApiHealth,
  SellerAccount,
  ThaiBankOption,
  Transaction,
  WebhookLog,
} from '../types';

function getHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = localStorage.getItem('slipflow_dashboard_key') || '';
  return {
    ...(key ? { 'X-Dashboard-Key': key } : {}),
    ...extra,
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(url, {
    ...init,
    headers: getHeaders(
      isFormData
        ? { ...(init?.headers as Record<string, string> | undefined) }
        : { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) }
    ),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getSummary(days = 7) {
    return requestJson<DashboardSummary>(`/api/summary?days=${days}`);
  },

  getSlipApiHealth() {
    return requestJson<RemoteSlipApiHealth>('/api/slip-api/health');
  },

  getBanks() {
    return requestJson<{ banks: ThaiBankOption[] }>('/api/banks');
  },

  getTransactions(params: Record<string, string | number | undefined> = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== 'ALL') {
        q.set(k, String(v));
      }
    }
    const qs = q.toString();
    return requestJson<{ total: number; items: Transaction[] }>(`/api/transactions${qs ? `?${qs}` : ''}`);
  },

  verifySlip(formData: FormData) {
    return requestJson<{ ok: boolean; transaction: Transaction; flexMessage: unknown }>('/api/verify-slip', {
      method: 'POST',
      body: formData,
    });
  },

  simulateLineSlip(formData: FormData) {
    return requestJson<{ ok: boolean; transaction: Transaction; flexMessage: unknown }>('/api/line/simulate', {
      method: 'POST',
      body: formData,
    });
  },

  simulateMessengerSlip(formData: FormData) {
    return requestJson<{ ok: boolean; transaction: Transaction; replyText: string }>('/api/messenger/simulate', {
      method: 'POST',
      body: formData,
    });
  },

  createManualTransaction(payload: {
    amount: number;
    customerName?: string;
    category?: string;
    orderNote?: string;
    sendingBankName?: string;
    recordedDate?: string;
  }) {
    return requestJson<{ transaction: Transaction }>('/api/transactions/manual', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateTransaction(
    id: number,
    patch: Partial<Pick<Transaction, 'status' | 'amount' | 'category' | 'orderNote' | 'customerName' | 'verificationMessage'>>
  ) {
    return requestJson<{ transaction: Transaction }>(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  deleteTransaction(id: number) {
    return requestJson<{ ok: boolean }>(`/api/transactions/${id}`, { method: 'DELETE' });
  },

  getSellerAccounts() {
    return requestJson<{ accounts: SellerAccount[] }>('/api/seller-accounts');
  },

  createSellerAccount(payload: {
    bankCode: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    accountType: 'BANK' | 'PROMPTPAY';
  }) {
    return requestJson<{ account: SellerAccount }>('/api/seller-accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateSellerAccount(id: number, patch: Partial<SellerAccount>) {
    return requestJson<{ account: SellerAccount }>(`/api/seller-accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  deleteSellerAccount(id: number) {
    return requestJson<{ ok: boolean }>(`/api/seller-accounts/${id}`, { method: 'DELETE' });
  },

  getCategories() {
    return requestJson<{ categories: CategoryItem[] }>('/api/categories');
  },

  createCategory(payload: { name: string; color: string }) {
    return requestJson<{ category: CategoryItem }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  deleteCategory(id: number) {
    return requestJson<{ ok: boolean }>(`/api/categories/${id}`, { method: 'DELETE' });
  },

  getSettings() {
    return requestJson<{ settings: PublicSettings }>('/api/settings');
  },

  updateSettings(patch: Record<string, unknown>) {
    return requestJson<{ settings: PublicSettings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  regenerateExtensionApiKey() {
    return requestJson<{ extensionApiKey: string }>('/api/settings/regenerate-api-key', {
      method: 'POST',
    });
  },

  regenerateFbVerifyToken() {
    return requestJson<{ fbVerifyToken: string }>('/api/settings/regenerate-fb-verify-token', {
      method: 'POST',
    });
  },

  getWebhookLogs(limit = 30) {
    return requestJson<{ logs: WebhookLog[] }>(`/api/line/webhook-logs?limit=${limit}`);
  },

  testLinePush() {
    return requestJson<{ ok: boolean; message: string }>('/api/line/test-push', {
      method: 'POST',
    });
  },

  getCsvExportUrl(params: Record<string, string | undefined> = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && v !== 'ALL') q.set(k, v);
    }
    const key = localStorage.getItem('slipflow_dashboard_key') || '';
    if (key) q.set('dashboardKey', key);
    const qs = q.toString();
    return `/api/transactions/export.csv${qs ? `?${qs}` : ''}`;
  },
};

export function subscribeLiveEvents(handlers: {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onTransactionChange?: (tx?: Transaction) => void;
  onWebhookLog?: () => void;
}): () => void {
  let disposed = false;
  let es: EventSource | null = null;
  let pollTimer: number | null = null;
  let lastSeenTxId: number | null = null;

  function startPolling() {
    if (disposed || pollTimer !== null) return;
    handlers.onConnect?.();

    const tick = async () => {
      if (disposed) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const res = await api.getTransactions({ limit: 1 });
        const latest = res.items[0];
        handlers.onConnect?.();
        if (latest) {
          if (lastSeenTxId !== null && latest.id > lastSeenTxId) {
            lastSeenTxId = latest.id;
            handlers.onTransactionChange?.(latest);
            handlers.onWebhookLog?.();
          } else if (lastSeenTxId === null) {
            lastSeenTxId = latest.id;
          }
        }
      } catch {
        handlers.onDisconnect?.();
      }
    };

    void tick();
    pollTimer = window.setInterval(() => void tick(), 5000);
  }

  // Detect whether backend supports SSE (Node) or polling (Cloudflare Workers)
  fetch('/api/health', { headers: getHeaders() })
    .then((r) => r.json())
    .then((info) => {
      if (disposed) return;
      if (info?.realtimeMode === 'polling') {
        startPolling();
        return;
      }
      const key = localStorage.getItem('slipflow_dashboard_key') || '';
      const url = key ? `/api/events?dashboardKey=${encodeURIComponent(key)}` : '/api/events';
      es = new EventSource(url);
      es.addEventListener('connected', () => handlers.onConnect?.());
      es.addEventListener('transaction:created', (ev) => {
        try {
          handlers.onTransactionChange?.(JSON.parse((ev as MessageEvent).data));
        } catch {
          handlers.onTransactionChange?.();
        }
      });
      es.addEventListener('transaction:updated', () => handlers.onTransactionChange?.());
      es.addEventListener('transaction:deleted', () => handlers.onTransactionChange?.());
      es.addEventListener('webhook:logged', () => handlers.onWebhookLog?.());
      es.onerror = () => handlers.onDisconnect?.();
    })
    .catch(() => {
      if (!disposed) startPolling();
    });

  return () => {
    disposed = true;
    es?.close();
    if (pollTimer !== null) window.clearInterval(pollTimer);
  };
}
