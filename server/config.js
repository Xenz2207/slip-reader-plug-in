import 'dotenv/config';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/slipflow.db'),
  slipApiBaseUrl: (process.env.SLIP_API_BASE_URL || 'https://my-slip-reader.onrender.com').replace(/\/+$/, ''),
  slipApiTimeoutMs: Number(process.env.SLIP_API_TIMEOUT_MS || 65000),
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '',
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  lineAdminNotifyTargetId: process.env.LINE_ADMIN_NOTIFY_TARGET_ID || '',
  fbAppSecret: process.env.FB_APP_SECRET || '',
  fbPageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN || '',
  fbVerifyToken: process.env.FB_VERIFY_TOKEN || '',
  extensionApiKey: process.env.EXTENSION_API_KEY || '',
  dashboardAccessKey: process.env.DASHBOARD_ACCESS_KEY || '',
};
