/*! 版权所有：1330600100。二次开发与定制合作请联系 QQ。 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    process.env[key.trim()] ??= valueParts.join('=').trim().replace(/^["']|["']$/g, '');
  }
}

loadEnvFile();

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'db.json');
const imageDbPath = path.join(dataDir, 'images.json');
const adsPath = path.join(dataDir, 'ads.json');
const paymentPath = path.join(dataDir, 'payment.json');
const paymentOrdersPath = path.join(dataDir, 'payment-orders.json');
const uploadDir = path.join(dataDir, 'uploads');
const brandingPath = path.join(dataDir, 'branding.json');
const brandingLogoPrefix = 'branding-logo';
const bridgeTemplatePath = path.join(__dirname, 'pbootcms-bridge.example.php');
const distDir = path.join(projectRoot, 'dist');
const port = Number(process.env.PORT || 8787);
const storageMode = (process.env.STORAGE || 'json').toLowerCase();
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const defaultLlmModel = process.env.LLM_MODEL || 'gpt-4.1-mini';
const sessionMaxAgeSeconds = 8 * 60 * 60;
const bootstrapAdmin = {
  username: process.env.ADMIN_USER || 'admin',
  password: process.env.ADMIN_PASSWORD || 'Admin@123456',
};
const defaultBranding = {
  siteName: 'AIGOU',
  subtitle: '智能发布后台',
  landingTitle: 'AIGOU 智能文章生成与自动发布后台',
  landingDescription: '面向 PbootCMS 站群和内容运营场景，把关键词生成、模型配置、图片素材、定时发布和多用户管理放到一个后台里。',
  logoUrl: '',
  updatedAt: '',
};
const defaultPaymentSettings = {
  enabled: false,
  apiUrl: '',
  pid: '',
  key: '',
  sitename: 'AIGOU',
  plans: [
    { id: 'week', name: '周卡会员', cycle: 'week', days: 7, price: 19.9, enabled: true },
    { id: 'month', name: '月卡会员', cycle: 'month', days: 30, price: 49.9, enabled: true },
    { id: 'quarter', name: '季卡会员', cycle: 'quarter', days: 90, price: 129, enabled: true },
  ],
  updatedAt: '',
};
const schedulePollMs = Math.max(10_000, Number(process.env.SCHEDULE_POLL_MS || 15_000));
const sessions = new Map();
const runningSchedules = new Set();
let scheduleTimer = null;
let mysqlPoolPromise;
let scheduleLoopBusy = false;

const SITE_STATUS = {
  pending: 'pending',
  ready: 'ready',
};

const ARTICLE_STATUS = {
  draft: 'draft',
  sending: 'sending',
  published: 'published',
  failed: 'failed',
};

const LOG_RESULT = {
  success: 'success',
  failed: 'failed',
};

const SCHEDULE_STATUS = {
  paused: 'paused',
  running: 'running',
  completed: 'completed',
  error: 'error',
};

const defaultForbiddenWordsText = [
  '国家级=全国推荐',
  '世界级=国际推荐',
  '最高级=高级',
  '第一=首要',
  '唯一=独特',
  '首个=首要推荐',
  '首选=首要推荐',
  '顶级=高级',
  '国家级产品=全国推荐产品',
  '填补国内空白=弥补国内需求',
  '独家=独特',
  '首家=首个推出',
  '最先进=先进',
  '第一品牌=推荐品牌',
  '金牌=优秀品牌',
  '名牌=著名品牌',
  '优秀=杰出',
  '全网销量第一=畅销产品',
  '全球首发=国际首次发布',
  '全国首家=全国靠前',
  '全网首发=全网首次发布',
  '世界领先=国际领先',
  '顶级工艺=高级工艺',
  '王牌=强力品牌',
  '销量冠军=畅销产品',
  '极致=卓越',
  '永久=持久',
  '掌门人=领导品牌',
  '领袖品牌=引领品牌',
  '独一无二=独特无比',
  '绝无仅有=独一无二',
  '史无前例=前所未有',
  '万能=多功能',
  '最高=较高',
  '最低=较低',
  '最=非常',
  '最具=非常具有',
  '最便宜=经济实惠',
  '最新=较新',
  '最大程度=较大限度',
  '最新技术=较新技术',
  '最先进科学=先进科学',
  '最佳=较好',
  '最大=较大',
  '最好=很好',
  '最新科学=较新科学',
  '最先进加工工艺=先进加工工艺',
  '最时尚=非常时尚',
  '最受欢迎=非常受欢迎',
  '最先=较早',
  '绝对=比较',
  '大牌=知名品牌',
  '精确=准确',
  '超赚=比较赚钱',
  '领导品牌=引领品牌',
  '领先上市=先于市场推出',
  '巨星=知名人士',
  '著名=知名',
  '奢侈=高档',
  '100%=完全',
  '国际品质=国际水准',
  '高档=高级',
  '正品=真实产品',
].join('\n');

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function responseHeaders(req, contentType = 'application/json; charset=utf-8') {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}

function jsonResponse(req, res, statusCode, payload, extraHeaders = {}) {
  const body = statusCode === 204 ? '' : JSON.stringify(payload);
  res.writeHead(statusCode, {
    ...responseHeaders(req),
    ...extraHeaders,
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function fileResponse(req, res, filename, body, contentType = 'application/octet-stream; charset=utf-8') {
  res.writeHead(200, {
    ...responseHeaders(req, contentType),
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function staticFileResponse(req, res, filePath, contentType) {
  const body = await readFile(filePath);
  const cacheControl = path.extname(filePath).toLowerCase() === '.html' ? 'no-store' : 'public, max-age=604800';
  res.writeHead(200, {
    ...responseHeaders(req, contentType),
    'Cache-Control': cacheControl,
    'Content-Length': body.length,
  });
  res.end(req.method === 'HEAD' ? '' : body);
}

function badRequest(req, res, message) {
  jsonResponse(req, res, 400, { error: message });
}

function unauthorized(req, res, message = '请先登录后再继续操作') {
  jsonResponse(req, res, 401, { error: message });
}

function notFound(req, res) {
  jsonResponse(req, res, 404, { error: '接口不存在' });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体不是合法的 JSON');
  }
}

async function readRawBody(req, limit = 12 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('上传文件不能超过 12MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readPaymentParams(req) {
  if (req.method === 'GET') return {};
  const raw = (await readRawBody(req, 1024 * 1024)).toString('utf8').replace(/^\uFEFF/, '');
  if (!raw) return {};
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('支付回调 JSON 格式错误');
    }
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((item) => item.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}

function nowIso() {
  return new Date().toISOString();
}

function nowTime() {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function addMinutesIso(minutes, from = Date.now()) {
  return new Date(from + Number(minutes) * 60 * 1000).toISOString();
}

function normalizeRunTime(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '09:00';
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function nextRunTimeIso(runTime, from = new Date()) {
  const [hour, minute] = normalizeRunTime(runTime).split(':').map(Number);
  const next = new Date(from);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

function normalizeDomain(value) {
  return String(value || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
}

function siteNameFromDomain(domain) {
  return domain.replace(/^www\./, '').split('.')[0] || '新站点';
}

function nextId(items = []) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

function safeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSiteStatus(value) {
  return value === SITE_STATUS.ready ? SITE_STATUS.ready : SITE_STATUS.pending;
}

function normalizeArticleStatus(value) {
  if (value === ARTICLE_STATUS.sending) return ARTICLE_STATUS.sending;
  if (value === ARTICLE_STATUS.published) return ARTICLE_STATUS.published;
  if (value === ARTICLE_STATUS.failed) return ARTICLE_STATUS.failed;
  return ARTICLE_STATUS.draft;
}

function normalizeLogResult(value) {
  return value === LOG_RESULT.failed ? LOG_RESULT.failed : LOG_RESULT.success;
}

function normalizeScheduleStatus(value, active = false, generatedCount = 0, targetCount = 1) {
  if (generatedCount >= targetCount) return SCHEDULE_STATUS.completed;
  if (value === SCHEDULE_STATUS.error) return SCHEDULE_STATUS.error;
  if (active) return SCHEDULE_STATUS.running;
  return SCHEDULE_STATUS.paused;
}

function contentTypeForExt(ext) {
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.ico': 'image/x-icon',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

function safeImageExt(filename = '', mime = '') {
  const ext = path.extname(filename).toLowerCase();
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
  if (allowed.has(ext)) return ext;
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/webp') return '.webp';
  return '';
}

function parseMultipart(buffer, contentType = '') {
  const boundary =
    contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] ||
    contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) throw new Error('上传格式不正确，缺少 boundary');

  const marker = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(marker);

  while (start !== -1) {
    start += marker.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;
    const next = buffer.indexOf(marker, headerEnd + 4);
    if (next === -1) break;

    const headerText = buffer.slice(start, headerEnd).toString('utf8');
    let data = buffer.slice(headerEnd + 4, next);
    if (data.length >= 2 && data[data.length - 2] === 13 && data[data.length - 1] === 10) {
      data = data.slice(0, -2);
    }

    const disposition = headerText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || '';
    const name = disposition.match(/name="([^"]+)"/i)?.[1] || '';
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || '';
    const mime = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || '';
    parts.push({ name, filename, mime, data });
    start = next;
  }

  return parts;
}

function signSession(id) {
  return crypto.createHmac('sha256', sessionSecret).update(id).digest('hex');
}

function makeAuthCookie(token, maxAge = sessionMaxAgeSeconds) {
  return `aigou_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`;
}

function createSession(user) {
  const id = crypto.randomUUID();
  sessions.set(id, {
    userId: Number(user.id),
    username: user.username,
    expiresAt: Date.now() + sessionMaxAgeSeconds * 1000,
  });
  return `${id}.${signSession(id)}`;
}

function getSessionUser(req) {
  const token = parseCookies(req).aigou_session;
  if (!token) return null;
  const [id, signature] = token.split('.');
  if (!id || !signature || signSession(id) !== signature) return null;
  const session = sessions.get(id);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(id);
    return null;
  }
  return { userId: session.userId, username: session.username };
}

function clearSession(req) {
  const token = parseCookies(req).aigou_session;
  const id = token?.split('.')[0];
  if (id) sessions.delete(id);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 120000;
  const digest = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${digest}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const [scheme, iterationsRaw, salt, expectedHash] = storedHash.split('$');
  if (scheme !== 'pbkdf2' || !iterationsRaw || !salt || !expectedHash) return false;
  const iterations = Number(iterationsRaw);
  const actualHash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function normalizeModelApiUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/\/+$/, '');
  if (/\/(chat\/completions|responses)$/i.test(normalized)) return normalized;
  if (/\/models$/i.test(normalized)) return normalized.replace(/\/models$/i, '/chat/completions');
  if (/\/v\d+$/i.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function normalizeModelName(value) {
  return String(value || '').trim() || defaultLlmModel;
}

function modelListApiUrl(value) {
  const normalized = normalizeModelApiUrl(value);
  if (!normalized) return '';
  const url = new URL(normalized);
  url.search = '';
  url.pathname = url.pathname
    .replace(/\/chat\/completions\/?$/i, '/models')
    .replace(/\/responses\/?$/i, '/models');
  if (!/\/models\/?$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`;
  }
  return url.toString();
}

function membershipState(expiresAt) {
  if (!expiresAt) return { active: false, label: '未开通' };
  const time = new Date(expiresAt).getTime();
  if (!Number.isFinite(time)) return { active: false, label: '未开通' };
  return time > Date.now() ? { active: true, label: '有效中' } : { active: false, label: '已到期' };
}

function publicMembership(user) {
  const expiresAt = user?.membershipExpiresAt || '';
  const state = membershipState(expiresAt);
  return {
    expiresAt,
    active: state.active,
    label: state.label,
  };
}

function normalizePaymentPlan(input = {}, index = 0) {
  const cycle = String(input.cycle || 'month').trim();
  const defaultDaysMap = { week: 7, month: 30, quarter: 90, year: 365 };
  const days = Math.max(1, safeInt(input.days, defaultDaysMap[cycle] || 30));
  const price = Math.max(0.01, Number(Number(input.price || 0).toFixed(2)));
  const id = String(input.id || `${cycle}-${days}-${index + 1}`)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 60) || `plan-${index + 1}`;
  return {
    id,
    name: String(input.name || `会员 ${days} 天`).trim(),
    cycle,
    days,
    price,
    enabled: input.enabled !== false,
  };
}

function normalizePaymentSettings(input = {}) {
  const plans = Array.isArray(input.plans) && input.plans.length
    ? input.plans.map(normalizePaymentPlan).filter((plan) => plan.name && plan.price > 0 && plan.days > 0)
    : defaultPaymentSettings.plans.map(normalizePaymentPlan);
  return {
    enabled: input.enabled === true,
    apiUrl: String(input.apiUrl || '').trim().replace(/\/+$/, ''),
    pid: String(input.pid || '').trim(),
    key: String(input.key || '').trim(),
    sitename: String(input.sitename || defaultPaymentSettings.sitename).trim() || defaultPaymentSettings.sitename,
    plans: plans.length ? plans : defaultPaymentSettings.plans.map(normalizePaymentPlan),
    updatedAt: input.updatedAt || '',
  };
}

function publicPaymentSettings(settings) {
  const normalized = normalizePaymentSettings(settings);
  return {
    enabled: normalized.enabled,
    apiUrl: normalized.apiUrl,
    pid: normalized.pid,
    hasKey: Boolean(normalized.key),
    sitename: normalized.sitename,
    plans: normalized.plans,
    updatedAt: normalized.updatedAt,
  };
}

function publicPaymentConfig(settings) {
  const normalized = normalizePaymentSettings(settings);
  return {
    enabled: normalized.enabled && Boolean(normalized.apiUrl && normalized.pid && normalized.key),
    sitename: normalized.sitename,
    plans: normalized.plans.filter((plan) => plan.enabled),
  };
}

function normalizePaymentOrder(input = {}, index = 0) {
  return {
    id: Number(input.id || index + 1),
    userId: Number(input.userId || input.user_id || 0),
    username: String(input.username || ''),
    tradeNo: String(input.tradeNo || input.trade_no || ''),
    outTradeNo: String(input.outTradeNo || input.out_trade_no || ''),
    planId: String(input.planId || input.plan_id || ''),
    planName: String(input.planName || input.plan_name || ''),
    days: Math.max(1, safeInt(input.days, 1)),
    amount: Number(Number(input.amount || 0).toFixed(2)),
    type: String(input.type || 'alipay'),
    status: String(input.status || 'pending'),
    payUrl: String(input.payUrl || input.pay_url || ''),
    rawNotify: input.rawNotify || input.raw_notify || {},
    createdAt: input.createdAt || input.created_at || nowIso(),
    paidAt: input.paidAt || input.paid_at || '',
  };
}

function yipaySign(params, key) {
  const signText = Object.keys(params)
    .filter((name) => name !== 'sign' && name !== 'sign_type' && params[name] !== '' && params[name] !== undefined && params[name] !== null)
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join('&') + key;
  return crypto.createHash('md5').update(signText).digest('hex');
}

function yipaySubmitUrl(settings, params) {
  const base = settings.apiUrl.replace(/\/+$/, '');
  const endpoint = /\/submit\.php$/i.test(base) ? base : `${base}/submit.php`;
  const url = new URL(endpoint);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

function orderStatusLabel(status) {
  if (status === 'paid') return '已支付';
  if (status === 'failed') return '支付失败';
  return '待支付';
}

function publicPaymentOrder(order) {
  const normalized = normalizePaymentOrder(order);
  return {
    ...normalized,
    statusLabel: orderStatusLabel(normalized.status),
    rawNotify: undefined,
  };
}

async function loadPaymentSettings() {
  await mkdir(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(paymentPath, 'utf8'));
    return normalizePaymentSettings({ ...defaultPaymentSettings, ...parsed });
  } catch {
    const seeded = normalizePaymentSettings(defaultPaymentSettings);
    await savePaymentSettings(seeded);
    return seeded;
  }
}

async function savePaymentSettings(input) {
  const settings = normalizePaymentSettings({ ...input, updatedAt: nowIso() });
  await mkdir(dataDir, { recursive: true });
  await writeFile(paymentPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return settings;
}

async function loadJsonPaymentOrders() {
  await mkdir(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(paymentOrdersPath, 'utf8'));
    return Array.isArray(parsed) ? parsed.map(normalizePaymentOrder) : [];
  } catch {
    return [];
  }
}

async function saveJsonPaymentOrders(orders) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(paymentOrdersPath, `${JSON.stringify(orders.map(normalizePaymentOrder), null, 2)}\n`, 'utf8');
}

function sanitizeUser(user) {
  const isAdmin = isAdminUser(user);
  const mailConfig = isAdmin ? {
    mailNotifyEnabled: Boolean(user.mailNotifyEnabled),
    smtpHost: user.smtpHost || '',
    smtpPort: Number(user.smtpPort || 465),
    smtpSecure: user.smtpSecure !== false,
    smtpUser: user.smtpUser || '',
    hasSmtpPass: Boolean(user.smtpPass),
    smtpFrom: user.smtpFrom || user.smtpUser || user.email || '',
  } : {};
  return {
    id: Number(user.id),
    username: user.username,
    email: user.email || '',
    isAdmin,
    role: isAdmin ? 'admin' : (user.role || 'member'),
    status: user.status || 'active',
    llmApiUrl: user.llmApiUrl || '',
    hasLlmApiKey: Boolean(user.llmApiKey),
    llmModel: normalizeModelName(user.llmModel),
    defaultModel: defaultLlmModel,
    createdAt: user.createdAt || '',
    lastLoginAt: user.lastLoginAt || '',
    membership: publicMembership(user),
    ...mailConfig,
  };
}

function sanitizeMemberUser(user, stats = {}) {
  const safe = sanitizeUser(user);
  return {
    id: safe.id,
    username: safe.username,
    email: safe.email,
    isAdmin: safe.isAdmin,
    role: safe.role,
    status: safe.status,
    createdAt: safe.createdAt,
    lastLoginAt: safe.lastLoginAt,
    hasLlmApiKey: safe.hasLlmApiKey,
    llmModel: safe.llmModel,
    membership: safe.membership,
    siteCount: Number(stats.siteCount || 0),
    articleCount: Number(stats.articleCount || 0),
    scheduleCount: Number(stats.scheduleCount || 0),
  };
}

function isAdminUser(user) {
  if (!user) return false;
  return Number(user.id) === 1 || String(user.username || '') === bootstrapAdmin.username;
}

function normalizeEmail(value) {
  const email = String(value || '').trim();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('邮箱格式不正确');
  return email;
}

function sanitizeSite(site) {
  return {
    ...site,
    pbootToken: undefined,
    hasPbootToken: Boolean(site.pbootToken),
  };
}

function sanitizeSchedule(schedule) {
  return {
    ...schedule,
    active: Boolean(schedule.active),
    autoPublish: Boolean(schedule.autoPublish),
  };
}

function sanitizeDb(db) {
  return {
    sites: db.sites.map(sanitizeSite),
    articles: db.articles,
    logs: db.logs,
    anchors: db.anchors || [],
    schedules: (db.schedules || []).map(sanitizeSchedule),
    forbiddenWords: db.forbiddenWords || [],
  };
}

function normalizeImageRecord(image) {
  const name = String(image.name || image.filename || `image-${Number(image.id)}`).replace(/[\\/]/g, '');
  return {
    ...image,
    id: Number(image.id),
    userId: Number(image.userId || 1),
    name,
    url: `/api/image/${Number(image.id)}/${encodeURIComponent(name)}`,
  };
}

function publicBaseUrl(req, fallback = '') {
  if (fallback) return fallback.replace(/\/+$/, '');
  if (req?.headers?.host) {
    const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
    return `${proto}://${req.headers.host}`;
  }
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, '');
  return `http://127.0.0.1:${port}`;
}

function absoluteImageUrl(req, image, fallbackBaseUrl = '') {
  if (!image?.url) return '';
  if (/^https?:\/\//i.test(image.url)) return image.url;
  return `${publicBaseUrl(req, fallbackBaseUrl)}${image.url}`;
}

function publicImageRecord(req, image, fallbackBaseUrl = '') {
  const normalized = normalizeImageRecord(image);
  return { ...normalized, absoluteUrl: absoluteImageUrl(req, normalized, fallbackBaseUrl) };
}

function normalizeBranding(input = {}) {
  return {
    siteName: String(input.siteName || defaultBranding.siteName).trim() || defaultBranding.siteName,
    subtitle: String(input.subtitle || defaultBranding.subtitle).trim() || defaultBranding.subtitle,
    landingTitle: String(input.landingTitle || '').trim() || `${String(input.siteName || defaultBranding.siteName).trim() || defaultBranding.siteName} 智能文章生成与自动发布后台`,
    landingDescription: String(input.landingDescription || defaultBranding.landingDescription).trim() || defaultBranding.landingDescription,
    logoUrl: String(input.logoUrl || '').trim(),
    updatedAt: input.updatedAt || '',
  };
}

async function loadBranding() {
  await mkdir(dataDir, { recursive: true });
  let branding = { ...defaultBranding };
  try {
    const parsed = JSON.parse(await readFile(brandingPath, 'utf8'));
    branding = normalizeBranding({ ...branding, ...parsed });
  } catch {
    branding = normalizeBranding(branding);
    await saveBranding(branding);
  }
  return branding;
}

function publicBranding(branding) {
  if (!branding.logoUrl) return branding;
  return {
    ...branding,
    logoUrl: `${branding.logoUrl}${branding.logoUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(branding.updatedAt || '1')}`,
  };
}

async function saveBranding(input) {
  const branding = normalizeBranding({ ...input, updatedAt: nowIso() });
  await mkdir(dataDir, { recursive: true });
  await writeFile(brandingPath, `${JSON.stringify(branding, null, 2)}\n`, 'utf8');
  return branding;
}

async function saveBrandingLogo(req) {
  const raw = await readRawBody(req);
  const parts = parseMultipart(raw, req.headers['content-type'] || '');
  const file = parts.find((part) => part.name === 'logo' && part.filename);
  if (!file) throw new Error('请选择要上传的 logo 图片');
  const ext = safeImageExt(file.filename, file.mime);
  if (!ext || !String(file.mime || '').startsWith('image/')) throw new Error('Logo 只支持 jpg、png、gif、webp 图片');

  await mkdir(uploadDir, { recursive: true });
  const currentFiles = await readdir(uploadDir).catch(() => []);
  await Promise.all(
    currentFiles
      .filter((name) => name.startsWith(`${brandingLogoPrefix}.`) || name.startsWith(`${brandingLogoPrefix}-`))
      .map((name) => unlink(path.join(uploadDir, name)).catch(() => {})),
  );
  const filename = `${brandingLogoPrefix}${ext}`;
  await writeFile(path.join(uploadDir, filename), file.data);
  const current = await loadBranding();
  return saveBranding({
    ...current,
    logoUrl: '/api/branding/logo',
  });
}

async function serveBrandingLogo(req, res) {
  const files = await readdir(uploadDir).catch(() => []);
  const filename = files.find((name) => name.startsWith(`${brandingLogoPrefix}.`));
  if (!filename) return notFound(req, res);
  return staticFileResponse(req, res, path.join(uploadDir, filename), contentTypeForExt(path.extname(filename)));
}

function normalizeAd(input = {}, index = 0) {
  const now = nowIso();
  return {
    id: Number(input.id || Date.now() + index),
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    imageUrl: cleanAdUrl(input.imageUrl),
    linkUrl: cleanAdUrl(input.linkUrl),
    position: String(input.position || '首页横幅').trim() || '首页横幅',
    enabled: input.enabled !== false,
    sortOrder: safeInt(input.sortOrder, index + 1),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function cleanAdUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function assertAdUrl(value, fieldName) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const cleaned = cleanAdUrl(trimmed);
  if (!cleaned) throw new Error(`${fieldName}仅支持 http(s) 或站内 / 开头地址`);
  return cleaned;
}

async function loadAds() {
  await mkdir(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(adsPath, 'utf8'));
    return Array.isArray(parsed)
      ? parsed.map(normalizeAd).sort((a, b) => a.sortOrder - b.sortOrder || b.id - a.id)
      : [];
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to load ads.json:', error.message);
    return [];
  }
}

async function saveAds(ads) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(adsPath, `${JSON.stringify(ads.map(normalizeAd), null, 2)}\n`, 'utf8');
}

async function publicAds() {
  return (await loadAds()).filter((ad) => ad.enabled && (ad.title || ad.description || ad.imageUrl));
}

async function saveAd(input) {
  const title = String(input.title || '').trim();
  const imageUrl = assertAdUrl(input.imageUrl, '广告图片地址');
  const linkUrl = assertAdUrl(input.linkUrl, '广告跳转链接');
  const description = String(input.description || '').trim();
  if (!title && !imageUrl && !description) throw new Error('请至少填写广告标题、文案或图片地址');
  const normalizedInput = { ...input, title, description, imageUrl, linkUrl };
  const ads = await loadAds();
  const adId = Number(input.id || 0);
  const now = nowIso();
  if (adId) {
    const existing = ads.find((item) => Number(item.id) === adId);
    if (!existing) throw new Error('广告位不存在');
    Object.assign(existing, normalizeAd({ ...existing, ...normalizedInput, id: adId, updatedAt: now }));
  } else {
    ads.unshift(normalizeAd({ ...normalizedInput, id: Date.now() + Math.floor(Math.random() * 1000), createdAt: now, updatedAt: now }, ads.length));
  }
  await saveAds(ads);
  return (await loadAds()).find((item) => Number(item.id) === Number(adId || ads[0].id));
}

async function deleteAd(id) {
  const adId = Number(id);
  const ads = await loadAds();
  const next = ads.filter((item) => Number(item.id) !== adId);
  if (next.length === ads.length) throw new Error('广告位不存在');
  await saveAds(next);
}

async function loadImageDb() {
  await mkdir(dataDir, { recursive: true });
  try {
    const images = JSON.parse(await readFile(imageDbPath, 'utf8'));
    const normalized = Array.isArray(images) ? images.map(normalizeImageRecord) : [];
    if (JSON.stringify(images) !== JSON.stringify(normalized)) await saveImageDb(normalized);
    return normalized;
  } catch {
    await saveImageDb([]);
    return [];
  }
}

async function saveImageDb(images) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(imageDbPath, `${JSON.stringify(images, null, 2)}\n`, 'utf8');
}

async function saveUploadedImage(file, userId) {
  const ext = safeImageExt(file.filename, file.mime);
  if (!ext || !String(file.mime || '').startsWith('image/')) throw new Error('只支持 jpg、png、gif、webp 图片');

  await mkdir(uploadDir, { recursive: true });
  const id = Date.now() + Math.floor(Math.random() * 1000);
  const originalName = file.filename.replace(/[\\/]/g, '');
  const storedName = `${id}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  await writeFile(path.join(uploadDir, storedName), file.data);

  return {
    id,
    userId: Number(userId),
    name: originalName,
    filename: storedName,
    url: `/api/image/${id}/${encodeURIComponent(originalName)}`,
    mime: file.mime || contentTypeForExt(ext),
    size: file.data.length,
    createdAt: nowIso(),
  };
}

async function uploadImages(req, userId) {
  const raw = await readRawBody(req);
  const parts = parseMultipart(raw, req.headers['content-type'] || '');
  const files = parts.filter((part) => part.name === 'image' && part.filename);
  if (!files.length) throw new Error('请选择要上传的图片');

  const uploaded = [];
  for (const file of files) {
    uploaded.push(await saveUploadedImage(file, userId));
  }

  const images = await loadImageDb();
  images.unshift(...uploaded);
  await saveImageDb(images);
  return uploaded;
}

async function deleteImage(id, userId) {
  const images = await loadImageDb();
  const image = images.find((item) => Number(item.id) === Number(id) && Number(item.userId) === Number(userId));
  if (image) await unlink(path.join(uploadDir, image.filename)).catch(() => {});
  await saveImageDb(images.filter((item) => Number(item.id) !== Number(id) || Number(item.userId) !== Number(userId)));
}

async function deleteImages(ids, userId) {
  const selectedIds = new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Boolean));
  if (!selectedIds.size) throw new Error('请选择要删除的图片');
  const images = await loadImageDb();
  const deleted = images.filter((item) => selectedIds.has(Number(item.id)) && Number(item.userId) === Number(userId));
  for (const image of deleted) {
    await unlink(path.join(uploadDir, image.filename)).catch(() => {});
  }
  await saveImageDb(images.filter((item) => !(selectedIds.has(Number(item.id)) && Number(item.userId) === Number(userId))));
  return deleted.length;
}

async function listPublicImages(req, userId, fallbackBaseUrl = '') {
  return (await loadImageDb())
    .filter((item) => Number(item.userId) === Number(userId))
    .map((item) => publicImageRecord(req, item, fallbackBaseUrl));
}

async function pickRandomImage(req, userId, fallbackBaseUrl = '') {
  const images = (await loadImageDb()).filter((item) => Number(item.userId) === Number(userId));
  if (!images.length) return null;
  const image = images[Math.floor(Math.random() * images.length)];
  return publicImageRecord(req, image, fallbackBaseUrl);
}

function createDefaultUser() {
  return {
    id: 1,
    username: bootstrapAdmin.username,
    passwordHash: hashPassword(bootstrapAdmin.password),
    email: '',
    llmApiUrl: '',
    llmApiKey: '',
    llmModel: defaultLlmModel,
    mailNotifyEnabled: false,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    role: 'admin',
    status: 'active',
    membershipExpiresAt: '',
    lastLoginAt: '',
    createdAt: nowIso(),
  };
}

function createDefaultDb() {
  const admin = createDefaultUser();
  return {
    users: [admin],
    sites: [],
    articles: [],
    logs: [],
    anchors: [],
    schedules: [],
    forbiddenWords: [],
  };
}

function normalizeScheduleRecord(input, fallbackUserId = 1, index = 0) {
  const targetCount = Math.max(1, safeInt(input.targetCount, 1));
  const generatedCount = Math.max(0, safeInt(input.generatedCount, 0));
  const active = Boolean(input.active);
  const runTime = normalizeRunTime(input.runTime || input.run_time || '09:00');
  return {
    id: Number(input.id || index + 1),
    userId: Number(input.userId || fallbackUserId),
    name: String(input.name || `计划 ${index + 1}`).trim(),
    siteId: Number(input.siteId || 0),
    tag: String(input.tag || 'SEO软文'),
    keywordsText: String(input.keywordsText || ''),
    targetCount,
    generatedCount: Math.min(generatedCount, targetCount),
    nextKeywordIndex: Math.max(0, safeInt(input.nextKeywordIndex, generatedCount)),
    intervalMinutes: Math.max(1, safeInt(input.intervalMinutes, 60)),
    runTime,
    autoPublish: Boolean(input.autoPublish),
    active,
    status: normalizeScheduleStatus(input.status, active, generatedCount, targetCount),
    nextRunAt: input.nextRunAt || '',
    lastRunAt: input.lastRunAt || '',
    lastError: input.lastError || '',
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
  };
}

function migrateJsonDbShape(db) {
  const fallback = createDefaultDb();
  const next = cloneData(db || {});

  next.users = Array.isArray(next.users) && next.users.length
    ? next.users.map((user, index) => ({
        id: Number(user.id || index + 1),
        username: String(user.username || '').trim(),
        passwordHash: String(user.passwordHash || ''),
        email: String(user.email || ''),
        llmApiUrl: normalizeModelApiUrl(user.llmApiUrl || ''),
        llmApiKey: String(user.llmApiKey || ''),
        llmModel: normalizeModelName(user.llmModel),
        mailNotifyEnabled: Boolean(user.mailNotifyEnabled),
        smtpHost: String(user.smtpHost || ''),
        smtpPort: safeInt(user.smtpPort, 465),
        smtpSecure: user.smtpSecure !== false,
        smtpUser: String(user.smtpUser || ''),
        smtpPass: String(user.smtpPass || ''),
        smtpFrom: String(user.smtpFrom || user.smtpUser || user.email || ''),
        role: isAdminUser(user) ? 'admin' : String(user.role || 'member'),
        status: String(user.status || 'active'),
        membershipExpiresAt: user.membershipExpiresAt || user.membership_expires_at || '',
        lastLoginAt: user.lastLoginAt || '',
        createdAt: user.createdAt || nowIso(),
      }))
    : fallback.users;

  if (!next.users.find((item) => item.username === bootstrapAdmin.username)) {
    next.users.unshift(createDefaultUser());
  }

  const fallbackUserId = Number(next.users[0]?.id || 1);

  next.sites = (next.sites || fallback.sites).map((site, index) => ({
    id: Number(site.id || index + 1),
    userId: Number(site.userId || fallbackUserId),
    name: String(site.name || `站点 ${index + 1}`),
    domain: String(site.domain || ''),
    cms: String(site.cms || 'PbootCMS v2.1'),
    status: normalizeSiteStatus(site.status),
    lastSync: site.lastSync || '',
    pbootApiUrl: String(site.pbootApiUrl || ''),
    pbootToken: String(site.pbootToken || ''),
    pbootCategoryId: String(site.pbootCategoryId || ''),
    pbootCategoryName: String(site.pbootCategoryName || ''),
    createdAt: site.createdAt || nowIso(),
  }));

  next.articles = (next.articles || fallback.articles).map((article, index) => ({
    id: Number(article.id || index + 1),
    userId: Number(article.userId || fallbackUserId),
    title: String(article.title || `文章 ${index + 1}`),
    tag: String(article.tag || 'SEO软文'),
    status: normalizeArticleStatus(article.status),
    siteId: Number(article.siteId || next.sites[0]?.id || 0),
    topic: String(article.topic || article.title || ''),
    content: String(article.content || ''),
    publishMessage: String(article.publishMessage || ''),
    createdAt: article.createdAt || nowIso(),
    publishedAt: article.publishedAt || '',
  }));

  next.logs = (next.logs || fallback.logs).map((log, index) => ({
    id: Number(log.id || index + 1),
    userId: Number(log.userId || fallbackUserId),
    time: log.time || nowTime(),
    title: String(log.title || '系统日志'),
    site: String(log.site || '-'),
    result: normalizeLogResult(log.result),
    createdAt: log.createdAt || nowIso(),
  }));

  next.anchors = (next.anchors || fallback.anchors).map((anchor, index) => ({
    id: Number(anchor.id || index + 1),
    userId: Number(anchor.userId || fallbackUserId),
    siteId: Number(anchor.siteId || next.sites[0]?.id || 0),
    keyword: String(anchor.keyword || ''),
    url: String(anchor.url || ''),
    enabled: anchor.enabled !== false,
    createdAt: anchor.createdAt || nowIso(),
  }));

  next.schedules = (next.schedules || fallback.schedules).map((schedule, index) => normalizeScheduleRecord(schedule, fallbackUserId, index));

  next.forbiddenWords = (next.forbiddenWords || fallback.forbiddenWords).map((item, index) => ({
    id: Number(item.id || index + 1),
    userId: Number(item.userId || fallbackUserId),
    name: String(item.name || `违禁词 ${index + 1}`).trim(),
    wordsText: String(item.wordsText || item.words_text || ''),
    enabled: item.enabled !== false,
    createdAt: item.createdAt || nowIso(),
    updatedAt: item.updatedAt || item.createdAt || nowIso(),
  }));

  return next;
}

async function loadJsonDb() {
  await mkdir(dataDir, { recursive: true });
  try {
    const db = JSON.parse(await readFile(dbPath, 'utf8'));
    const migrated = migrateJsonDbShape(db);
    if (JSON.stringify(db) !== JSON.stringify(migrated)) await saveJsonDb(migrated);
    return migrated;
  } catch {
    const seeded = createDefaultDb();
    await saveJsonDb(seeded);
    return seeded;
  }
}

async function saveJsonDb(db) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
}

async function ensureMysqlColumn(pool, tableName, columnName, definition) {
  const [rows] = await pool.execute(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [tableName, columnName],
  );
  if (!rows.length) await pool.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

async function ensureMysqlIndex(pool, tableName, indexName, createSql) {
  const [rows] = await pool.execute(
    'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [tableName, indexName],
  );
  if (!rows.length) await pool.execute(createSql);
}

async function ensureMysqlSchema(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(80) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      email VARCHAR(160) NOT NULL DEFAULT '',
      llm_api_url VARCHAR(600) NOT NULL DEFAULT '',
      llm_api_key TEXT NOT NULL,
      llm_model VARCHAR(160) NOT NULL DEFAULT 'gpt-4.1-mini',
      mail_notify_enabled TINYINT(1) NOT NULL DEFAULT 0,
      smtp_host VARCHAR(255) NOT NULL DEFAULT '',
      smtp_port INT UNSIGNED NOT NULL DEFAULT 465,
      smtp_secure TINYINT(1) NOT NULL DEFAULT 1,
      smtp_user VARCHAR(255) NOT NULL DEFAULT '',
      smtp_pass TEXT NOT NULL,
      smtp_from VARCHAR(255) NOT NULL DEFAULT '',
      role VARCHAR(30) NOT NULL DEFAULT 'member',
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      membership_expires_at VARCHAR(60) NOT NULL DEFAULT '',
      last_login_at VARCHAR(60) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      username VARCHAR(80) NOT NULL DEFAULT '',
      trade_no VARCHAR(120) NOT NULL DEFAULT '',
      out_trade_no VARCHAR(120) NOT NULL,
      plan_id VARCHAR(80) NOT NULL,
      plan_name VARCHAR(120) NOT NULL,
      days INT UNSIGNED NOT NULL DEFAULT 1,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      pay_type VARCHAR(30) NOT NULL DEFAULT 'alipay',
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      pay_url TEXT NULL,
      raw_notify JSON NULL,
      created_at VARCHAR(60) NOT NULL,
      paid_at VARCHAR(60) NOT NULL DEFAULT '',
      PRIMARY KEY (id),
      UNIQUE KEY uniq_out_trade_no (out_trade_no),
      KEY idx_payment_user_id (user_id),
      KEY idx_payment_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sites (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL DEFAULT 1,
      name VARCHAR(120) NOT NULL,
      domain VARCHAR(255) NOT NULL,
      cms VARCHAR(80) NOT NULL DEFAULT 'PbootCMS v2.1',
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      last_sync VARCHAR(60) NOT NULL DEFAULT '',
      pboot_api_url VARCHAR(500) NOT NULL DEFAULT '',
      pboot_token VARCHAR(255) NOT NULL DEFAULT '',
      pboot_category_id VARCHAR(60) NOT NULL DEFAULT '',
      pboot_category_name VARCHAR(120) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS articles (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL DEFAULT 1,
      title VARCHAR(255) NOT NULL,
      tag VARCHAR(80) NOT NULL DEFAULT 'SEO软文',
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      site_id INT UNSIGNED NOT NULL,
      topic VARCHAR(255) NOT NULL DEFAULT '',
      content MEDIUMTEXT NOT NULL,
      publish_message TEXT NULL,
      created_at VARCHAR(60) NOT NULL,
      published_at VARCHAR(60) NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS anchors (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL DEFAULT 1,
      site_id INT UNSIGNED NOT NULL,
      keyword VARCHAR(120) NOT NULL,
      url VARCHAR(500) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS logs (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL DEFAULT 1,
      log_time VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      site VARCHAR(120) NOT NULL,
      result VARCHAR(30) NOT NULL DEFAULT 'success',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL DEFAULT 1,
      name VARCHAR(120) NOT NULL,
      site_id INT UNSIGNED NOT NULL,
      tag VARCHAR(80) NOT NULL DEFAULT 'SEO软文',
      keywords_text MEDIUMTEXT NOT NULL,
      target_count INT UNSIGNED NOT NULL DEFAULT 1,
      generated_count INT UNSIGNED NOT NULL DEFAULT 0,
      next_keyword_index INT UNSIGNED NOT NULL DEFAULT 0,
      interval_minutes INT UNSIGNED NOT NULL DEFAULT 60,
      run_time VARCHAR(5) NOT NULL DEFAULT '09:00',
      auto_publish TINYINT(1) NOT NULL DEFAULT 1,
      active TINYINT(1) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'paused',
      next_run_at VARCHAR(60) NOT NULL DEFAULT '',
      last_run_at VARCHAR(60) NOT NULL DEFAULT '',
      last_error TEXT NOT NULL,
      created_at VARCHAR(60) NOT NULL,
      updated_at VARCHAR(60) NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS forbidden_words (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL DEFAULT 1,
      name VARCHAR(120) NOT NULL,
      words_text MEDIUMTEXT NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at VARCHAR(60) NOT NULL,
      updated_at VARCHAR(60) NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureMysqlColumn(pool, 'sites', 'user_id', 'INT UNSIGNED NOT NULL DEFAULT 1');
  await ensureMysqlColumn(pool, 'articles', 'user_id', 'INT UNSIGNED NOT NULL DEFAULT 1');
  await ensureMysqlColumn(pool, 'articles', 'topic', "VARCHAR(255) NOT NULL DEFAULT ''");
  await ensureMysqlColumn(pool, 'anchors', 'user_id', 'INT UNSIGNED NOT NULL DEFAULT 1');
  await ensureMysqlColumn(pool, 'logs', 'user_id', 'INT UNSIGNED NOT NULL DEFAULT 1');
  await ensureMysqlColumn(pool, 'schedules', 'run_time', "VARCHAR(5) NOT NULL DEFAULT '09:00'");
  await ensureMysqlColumn(pool, 'users', 'llm_api_url', "VARCHAR(600) NOT NULL DEFAULT ''");
  await ensureMysqlColumn(pool, 'users', 'llm_api_key', 'TEXT NOT NULL');
  await ensureMysqlColumn(pool, 'users', 'llm_model', "VARCHAR(160) NOT NULL DEFAULT 'gpt-4.1-mini'");
  await ensureMysqlColumn(pool, 'users', 'email', "VARCHAR(160) NOT NULL DEFAULT ''");
  await ensureMysqlColumn(pool, 'users', 'mail_notify_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
  await ensureMysqlColumn(pool, 'users', 'smtp_host', "VARCHAR(255) NOT NULL DEFAULT ''");
  await ensureMysqlColumn(pool, 'users', 'smtp_port', 'INT UNSIGNED NOT NULL DEFAULT 465');
  await ensureMysqlColumn(pool, 'users', 'smtp_secure', 'TINYINT(1) NOT NULL DEFAULT 1');
  await ensureMysqlColumn(pool, 'users', 'smtp_user', "VARCHAR(255) NOT NULL DEFAULT ''");
  await ensureMysqlColumn(pool, 'users', 'smtp_pass', 'TEXT NOT NULL');
  await ensureMysqlColumn(pool, 'users', 'smtp_from', "VARCHAR(255) NOT NULL DEFAULT ''");
  await ensureMysqlColumn(pool, 'users', 'role', "VARCHAR(30) NOT NULL DEFAULT 'member'");
  await ensureMysqlColumn(pool, 'users', 'status', "VARCHAR(30) NOT NULL DEFAULT 'active'");
  await ensureMysqlColumn(pool, 'users', 'membership_expires_at', "VARCHAR(60) NOT NULL DEFAULT ''");
  await ensureMysqlColumn(pool, 'users', 'last_login_at', "VARCHAR(60) NOT NULL DEFAULT ''");

  const [legacyIndex] = await pool.execute(
    'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    ['sites', 'uniq_domain'],
  );
  if (legacyIndex.length) await pool.execute('DROP INDEX uniq_domain ON sites');

  await ensureMysqlIndex(pool, 'sites', 'uniq_user_domain', 'CREATE UNIQUE INDEX uniq_user_domain ON sites (user_id, domain)');
  await ensureMysqlIndex(pool, 'articles', 'idx_articles_user_id', 'CREATE INDEX idx_articles_user_id ON articles (user_id)');
  await ensureMysqlIndex(pool, 'anchors', 'idx_anchors_user_id', 'CREATE INDEX idx_anchors_user_id ON anchors (user_id)');
  await ensureMysqlIndex(pool, 'logs', 'idx_logs_user_id', 'CREATE INDEX idx_logs_user_id ON logs (user_id)');
  await ensureMysqlIndex(pool, 'schedules', 'idx_schedules_user_id', 'CREATE INDEX idx_schedules_user_id ON schedules (user_id)');
  await ensureMysqlIndex(pool, 'schedules', 'idx_schedules_active', 'CREATE INDEX idx_schedules_active ON schedules (active, next_run_at)');
  await ensureMysqlIndex(pool, 'forbidden_words', 'idx_forbidden_words_user_id', 'CREATE INDEX idx_forbidden_words_user_id ON forbidden_words (user_id)');

  const [adminRows] = await pool.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [bootstrapAdmin.username]);
  let adminId = adminRows[0]?.id;
  if (!adminId) {
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash, email, llm_api_url, llm_api_key, llm_model, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [bootstrapAdmin.username, hashPassword(bootstrapAdmin.password), '', '', '', defaultLlmModel, 'admin', 'active'],
    );
    adminId = result.insertId;
  }
  await pool.execute('UPDATE users SET role = ?, status = ? WHERE id = ? OR username = ?', ['admin', 'active', adminId, bootstrapAdmin.username]);

  await pool.execute('UPDATE sites SET user_id = ? WHERE user_id IS NULL OR user_id = 0', [adminId]);
  await pool.execute('UPDATE articles SET user_id = ? WHERE user_id IS NULL OR user_id = 0', [adminId]);
  await pool.execute('UPDATE anchors SET user_id = ? WHERE user_id IS NULL OR user_id = 0', [adminId]);
  await pool.execute('UPDATE logs SET user_id = ? WHERE user_id IS NULL OR user_id = 0', [adminId]);
}

async function createMysqlPool() {
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'aigou',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'aigou_admin',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
    charset: 'utf8mb4',
  });
  await ensureMysqlSchema(pool);
  return pool;
}

async function getMysqlPool() {
  mysqlPoolPromise ||= createMysqlPool();
  return mysqlPoolPromise;
}

async function mysqlRows(sql, params = []) {
  const pool = await getMysqlPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function mysqlRun(sql, params = []) {
  const pool = await getMysqlPool();
  const [result] = await pool.execute(sql, params);
  return result;
}

function rowToUser(row) {
  return {
    id: Number(row.id),
    username: row.username,
    passwordHash: row.password_hash,
    email: row.email || '',
    llmApiUrl: normalizeModelApiUrl(row.llm_api_url || ''),
    llmApiKey: row.llm_api_key || '',
    llmModel: normalizeModelName(row.llm_model),
    mailNotifyEnabled: Boolean(row.mail_notify_enabled),
    smtpHost: row.smtp_host || '',
    smtpPort: Number(row.smtp_port || 465),
    smtpSecure: row.smtp_secure !== 0,
    smtpUser: row.smtp_user || '',
    smtpPass: row.smtp_pass || '',
    smtpFrom: row.smtp_from || '',
    role: row.role || (Number(row.id) === 1 ? 'admin' : 'member'),
    status: row.status || 'active',
    membershipExpiresAt: row.membership_expires_at || '',
    lastLoginAt: row.last_login_at || '',
    createdAt: row.created_at,
  };
}

function rowToPaymentOrder(row) {
  return normalizePaymentOrder({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    tradeNo: row.trade_no,
    outTradeNo: row.out_trade_no,
    planId: row.plan_id,
    planName: row.plan_name,
    days: row.days,
    amount: row.amount,
    type: row.pay_type,
    status: row.status,
    payUrl: row.pay_url,
    rawNotify: row.raw_notify ? (typeof row.raw_notify === 'string' ? JSON.parse(row.raw_notify) : row.raw_notify) : {},
    createdAt: row.created_at,
    paidAt: row.paid_at,
  });
}

function rowToSite(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id || 1),
    name: row.name,
    domain: row.domain,
    cms: row.cms,
    status: normalizeSiteStatus(row.status),
    lastSync: row.last_sync || '',
    pbootApiUrl: row.pboot_api_url || '',
    pbootToken: row.pboot_token || '',
    pbootCategoryId: row.pboot_category_id || '',
    pbootCategoryName: row.pboot_category_name || '',
    createdAt: row.created_at || '',
  };
}

function rowToArticle(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id || 1),
    title: row.title,
    tag: row.tag,
    status: normalizeArticleStatus(row.status),
    siteId: Number(row.site_id),
    topic: row.topic || '',
    content: row.content,
    publishMessage: row.publish_message || '',
    createdAt: row.created_at,
    publishedAt: row.published_at || '',
  };
}

function rowToLog(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id || 1),
    time: row.log_time,
    title: row.title,
    site: row.site,
    result: normalizeLogResult(row.result),
    createdAt: row.created_at || '',
  };
}

function rowToAnchor(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id || 1),
    siteId: Number(row.site_id),
    keyword: row.keyword,
    url: row.url,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at || '',
  };
}

function rowToForbiddenWords(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id || 1),
    name: row.name,
    wordsText: row.words_text || '',
    enabled: Boolean(row.enabled),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || row.created_at || '',
  };
}

function rowToSchedule(row) {
  return normalizeScheduleRecord({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    siteId: row.site_id,
    tag: row.tag,
    keywordsText: row.keywords_text,
    targetCount: row.target_count,
    generatedCount: row.generated_count,
    nextKeywordIndex: row.next_keyword_index,
    intervalMinutes: row.interval_minutes,
    runTime: row.run_time,
    autoPublish: Boolean(row.auto_publish),
    active: Boolean(row.active),
    status: row.status,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function getUserById(userId) {
  const id = Number(userId);
  if (!id) return null;
  if (storageMode === 'mysql') {
    const [row] = await mysqlRows('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    return row ? rowToUser(row) : null;
  }
  const db = await loadJsonDb();
  return db.users.find((item) => Number(item.id) === id) || null;
}

async function getUserByUsername(username) {
  const value = String(username || '').trim();
  if (!value) return null;
  if (storageMode === 'mysql') {
    const [row] = await mysqlRows('SELECT * FROM users WHERE username = ? LIMIT 1', [value]);
    return row ? rowToUser(row) : null;
  }
  const db = await loadJsonDb();
  return db.users.find((item) => item.username === value) || null;
}

async function registerUser(input) {
  const username = String(input.username || '').trim();
  const password = String(input.password || '');
  if (username.length < 3) throw new Error('用户名至少需要 3 个字符');
  if (password.length < 6) throw new Error('密码至少需要 6 个字符');
  if (await getUserByUsername(username)) throw new Error('该用户名已存在');

  if (storageMode === 'mysql') {
    const result = await mysqlRun(
      'INSERT INTO users (username, password_hash, email, llm_api_url, llm_api_key, llm_model, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [username, hashPassword(password), '', '', '', defaultLlmModel, 'member', 'active'],
    );
    return {
      id: result.insertId,
      username,
      passwordHash: '',
      email: '',
      llmApiUrl: '',
      llmApiKey: '',
      llmModel: defaultLlmModel,
      mailNotifyEnabled: false,
      smtpHost: '',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: '',
      smtpPass: '',
      smtpFrom: '',
      role: 'member',
      status: 'active',
      lastLoginAt: '',
      membershipExpiresAt: '',
      createdAt: nowIso(),
    };
  }

  const db = await loadJsonDb();
  const user = {
    id: nextId(db.users),
    username,
    passwordHash: hashPassword(password),
    email: '',
    llmApiUrl: '',
    llmApiKey: '',
    llmModel: defaultLlmModel,
    mailNotifyEnabled: false,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    role: 'member',
    status: 'active',
    membershipExpiresAt: '',
    lastLoginAt: '',
    createdAt: nowIso(),
  };
  db.users.push(user);
  await saveJsonDb(db);
  return user;
}

async function authenticateUser(username, password) {
  const user = await getUserByUsername(username);
  if (!user || !verifyPassword(String(password || ''), user.passwordHash)) return null;
  if (user.status === 'disabled') throw new Error('账号已被禁用，请联系管理员');
  return user;
}

async function touchUserLogin(userId) {
  const lastLoginAt = nowIso();
  if (storageMode === 'mysql') {
    await mysqlRun('UPDATE users SET last_login_at = ? WHERE id = ?', [lastLoginAt, Number(userId)]);
    return;
  }
  const db = await loadJsonDb();
  const user = db.users.find((item) => Number(item.id) === Number(userId));
  if (user) {
    user.lastLoginAt = lastLoginAt;
    await saveJsonDb(db);
  }
}

async function saveUserModelConfig(userId, input) {
  const existing = await getUserById(userId);
  if (!existing) throw new Error('用户不存在');

  const llmApiUrl = normalizeModelApiUrl(input.apiUrl || existing.llmApiUrl || '');
  const nextApiKey = String(input.apiKey || '').trim() || existing.llmApiKey || '';
  const llmModel = normalizeModelName(input.model || input.llmModel || existing.llmModel || defaultLlmModel);

  if (storageMode === 'mysql') {
    await mysqlRun('UPDATE users SET llm_api_url = ?, llm_api_key = ?, llm_model = ? WHERE id = ?', [llmApiUrl, nextApiKey, llmModel, Number(userId)]);
    return { ...existing, llmApiUrl, llmApiKey: nextApiKey, llmModel };
  }

  const db = await loadJsonDb();
  const user = db.users.find((item) => Number(item.id) === Number(userId));
  if (!user) throw new Error('用户不存在');
  user.llmApiUrl = llmApiUrl;
  user.llmApiKey = nextApiKey;
  user.llmModel = llmModel;
  await saveJsonDb(db);
  return user;
}

async function extendUserMembership(userId, days) {
  const existing = await getUserById(userId);
  if (!existing) throw new Error('用户不存在');
  const currentExpires = new Date(existing.membershipExpiresAt || 0).getTime();
  const base = Number.isFinite(currentExpires) && currentExpires > Date.now() ? currentExpires : Date.now();
  const membershipExpiresAt = new Date(base + Number(days) * 24 * 60 * 60 * 1000).toISOString();

  if (storageMode === 'mysql') {
    await mysqlRun('UPDATE users SET membership_expires_at = ? WHERE id = ?', [membershipExpiresAt, Number(userId)]);
    return { ...existing, membershipExpiresAt };
  }

  const db = await loadJsonDb();
  const user = db.users.find((item) => Number(item.id) === Number(userId));
  if (!user) throw new Error('用户不存在');
  user.membershipExpiresAt = membershipExpiresAt;
  await saveJsonDb(db);
  return user;
}

async function listPaymentOrders(user, limit = 80) {
  const safeLimit = Math.max(1, Math.min(300, safeInt(limit, 80)));
  if (storageMode === 'mysql') {
    const rows = isAdminUser(user)
      ? await mysqlRows(`SELECT * FROM payment_orders ORDER BY id DESC LIMIT ${safeLimit}`)
      : await mysqlRows(`SELECT * FROM payment_orders WHERE user_id = ? ORDER BY id DESC LIMIT ${safeLimit}`, [Number(user.id)]);
    return rows.map(rowToPaymentOrder).map(publicPaymentOrder);
  }
  const orders = await loadJsonPaymentOrders();
  return orders
    .filter((order) => isAdminUser(user) || Number(order.userId) === Number(user.id))
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, Number(limit))
    .map(publicPaymentOrder);
}

async function getPaymentOrderByOutTradeNo(outTradeNo) {
  const value = String(outTradeNo || '').trim();
  if (!value) return null;
  if (storageMode === 'mysql') {
    const [row] = await mysqlRows('SELECT * FROM payment_orders WHERE out_trade_no = ? LIMIT 1', [value]);
    return row ? rowToPaymentOrder(row) : null;
  }
  const orders = await loadJsonPaymentOrders();
  return orders.find((order) => order.outTradeNo === value) || null;
}

async function insertPaymentOrder(order) {
  const normalized = normalizePaymentOrder(order);
  if (storageMode === 'mysql') {
    const result = await mysqlRun(
      'INSERT INTO payment_orders (user_id, username, trade_no, out_trade_no, plan_id, plan_name, days, amount, pay_type, status, pay_url, raw_notify, created_at, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        normalized.userId,
        normalized.username,
        normalized.tradeNo,
        normalized.outTradeNo,
        normalized.planId,
        normalized.planName,
        normalized.days,
        normalized.amount,
        normalized.type,
        normalized.status,
        normalized.payUrl,
        JSON.stringify(normalized.rawNotify || {}),
        normalized.createdAt,
        normalized.paidAt,
      ],
    );
    return { ...normalized, id: result.insertId };
  }
  const orders = await loadJsonPaymentOrders();
  const next = { ...normalized, id: nextId(orders) };
  orders.unshift(next);
  await saveJsonPaymentOrders(orders);
  return next;
}

async function updatePaymentOrder(outTradeNo, patch) {
  const value = String(outTradeNo || '').trim();
  if (!value) throw new Error('订单号不能为空');
  if (storageMode === 'mysql') {
    const existing = await getPaymentOrderByOutTradeNo(value);
    if (!existing) throw new Error('订单不存在');
    const next = normalizePaymentOrder({ ...existing, ...patch, outTradeNo: value });
    await mysqlRun(
      'UPDATE payment_orders SET trade_no = ?, status = ?, raw_notify = ?, paid_at = ? WHERE out_trade_no = ?',
      [next.tradeNo, next.status, JSON.stringify(next.rawNotify || {}), next.paidAt, value],
    );
    return next;
  }
  const orders = await loadJsonPaymentOrders();
  const order = orders.find((item) => item.outTradeNo === value);
  if (!order) throw new Error('订单不存在');
  Object.assign(order, patch);
  await saveJsonPaymentOrders(orders);
  return normalizePaymentOrder(order);
}

async function saveAdminPaymentSettings(input) {
  const next = normalizePaymentSettings(input);
  if (next.enabled) {
    if (!next.apiUrl) throw new Error('请填写易支付接口地址');
    if (!next.pid) throw new Error('请填写商户 ID');
    if (!next.key) throw new Error('请填写商户 Key');
    if (!next.plans.some((plan) => plan.enabled)) throw new Error('请至少启用一个收费套餐');
  }
  return savePaymentSettings(next);
}

async function createRechargeOrder(req, user, input) {
  const settings = normalizePaymentSettings(await loadPaymentSettings());
  if (!settings.enabled || !settings.apiUrl || !settings.pid || !settings.key) throw new Error('管理员暂未启用在线充值');
  const plan = settings.plans.find((item) => item.id === String(input.planId || '') && item.enabled);
  if (!plan) throw new Error('请选择有效的充值套餐');
  const type = ['alipay', 'wxpay', 'qqpay'].includes(String(input.type || 'alipay')) ? String(input.type || 'alipay') : 'alipay';
  const outTradeNo = `AG${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const baseUrl = publicBaseUrl(req, process.env.APP_BASE_URL || '');
  const params = {
    pid: settings.pid,
    type,
    out_trade_no: outTradeNo,
    notify_url: `${baseUrl}/api/payment/notify`,
    return_url: `${baseUrl}/`,
    name: `${settings.sitename || 'AIGOU'}-${plan.name}`,
    money: Number(plan.price).toFixed(2),
    sitename: settings.sitename || 'AIGOU',
  };
  params.sign = yipaySign(params, settings.key);
  params.sign_type = 'MD5';
  const payUrl = yipaySubmitUrl(settings, params);
  const order = await insertPaymentOrder({
    userId: user.id,
    username: user.username,
    outTradeNo,
    planId: plan.id,
    planName: plan.name,
    days: plan.days,
    amount: plan.price,
    type,
    status: 'pending',
    payUrl,
    createdAt: nowIso(),
  });
  await addLog(`创建充值订单：${plan.name}`, '会员充值', LOG_RESULT.success, user.id);
  return { order: publicPaymentOrder(order), payUrl };
}

async function handlePaymentNotify(params) {
  const settings = normalizePaymentSettings(await loadPaymentSettings());
  if (!settings.key) throw new Error('易支付 Key 未配置');
  const receivedSign = String(params.sign || '').toLowerCase();
  const expectedSign = yipaySign(params, settings.key).toLowerCase();
  if (!receivedSign || receivedSign !== expectedSign) throw new Error('支付回调签名错误');
  if (String(params.trade_status || '').toUpperCase() !== 'TRADE_SUCCESS') throw new Error('支付状态不是成功');

  const outTradeNo = String(params.out_trade_no || '').trim();
  const order = await getPaymentOrderByOutTradeNo(outTradeNo);
  if (!order) throw new Error('订单不存在');
  if (Math.abs(Number(params.money || 0) - Number(order.amount || 0)) > 0.01) throw new Error('支付金额不一致');
  if (order.status === 'paid') return order;

  const paidAt = nowIso();
  const paidOrder = await updatePaymentOrder(outTradeNo, {
    status: 'paid',
    tradeNo: String(params.trade_no || ''),
    rawNotify: params,
    paidAt,
  });
  const user = await extendUserMembership(order.userId, order.days);
  await addLog(`会员充值成功：${order.planName}，延期 ${order.days} 天`, '会员充值', LOG_RESULT.success, order.userId);
  return { ...paidOrder, membershipExpiresAt: user.membershipExpiresAt };
}

async function saveAccountProfile(userId, input) {
  const existing = await getUserById(userId);
  if (!existing) throw new Error('用户不存在');
  const email = normalizeEmail(input.email);

  if (storageMode === 'mysql') {
    await mysqlRun('UPDATE users SET email = ? WHERE id = ?', [email, Number(userId)]);
    return { ...existing, email };
  }

  const db = await loadJsonDb();
  const user = db.users.find((item) => Number(item.id) === Number(userId));
  if (!user) throw new Error('用户不存在');
  user.email = email;
  await saveJsonDb(db);
  return user;
}

async function changeUserPassword(userId, input) {
  const existing = await getUserById(userId);
  if (!existing) throw new Error('用户不存在');
  const currentPassword = String(input.currentPassword || '');
  const nextPassword = String(input.newPassword || input.password || '');
  if (!verifyPassword(currentPassword, existing.passwordHash)) throw new Error('当前密码不正确');
  if (nextPassword.length < 6) throw new Error('新密码至少需要 6 个字符');
  const passwordHash = hashPassword(nextPassword);

  if (storageMode === 'mysql') {
    await mysqlRun('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, Number(userId)]);
    return { ...existing, passwordHash };
  }

  const db = await loadJsonDb();
  const user = db.users.find((item) => Number(item.id) === Number(userId));
  if (!user) throw new Error('用户不存在');
  user.passwordHash = passwordHash;
  await saveJsonDb(db);
  return user;
}

async function listMembers() {
  if (storageMode === 'mysql') {
    const rows = await mysqlRows(`
      SELECT
        u.*,
        COALESCE(s.site_count, 0) AS site_count,
        COALESCE(a.article_count, 0) AS article_count,
        COALESCE(sc.schedule_count, 0) AS schedule_count
      FROM users u
      LEFT JOIN (SELECT user_id, COUNT(*) AS site_count FROM sites GROUP BY user_id) s ON s.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS article_count FROM articles GROUP BY user_id) a ON a.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS schedule_count FROM schedules GROUP BY user_id) sc ON sc.user_id = u.id
      ORDER BY u.id ASC
    `);
    return rows.map((row) => sanitizeMemberUser(rowToUser(row), {
      siteCount: row.site_count,
      articleCount: row.article_count,
      scheduleCount: row.schedule_count,
    }));
  }

  const db = await loadJsonDb();
  return db.users.map((user) => sanitizeMemberUser(user, {
    siteCount: db.sites.filter((item) => Number(item.userId) === Number(user.id)).length,
    articleCount: db.articles.filter((item) => Number(item.userId) === Number(user.id)).length,
    scheduleCount: (db.schedules || []).filter((item) => Number(item.userId) === Number(user.id)).length,
  }));
}

async function adminCreateMember(input) {
  const username = String(input.username || '').trim();
  const password = String(input.password || '');
  const email = normalizeEmail(input.email || '');
  if (username.length < 3) throw new Error('用户名至少需要 3 个字符');
  if (password.length < 6) throw new Error('密码至少需要 6 个字符');
  if (await getUserByUsername(username)) throw new Error('该用户名已存在');

  if (storageMode === 'mysql') {
    const result = await mysqlRun(
      'INSERT INTO users (username, password_hash, email, llm_api_url, llm_api_key, llm_model, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [username, hashPassword(password), email, '', '', defaultLlmModel, 'member', 'active'],
    );
    return sanitizeMemberUser(await getUserById(result.insertId));
  }

  const db = await loadJsonDb();
  const user = {
    id: nextId(db.users),
    username,
    passwordHash: hashPassword(password),
    email,
    llmApiUrl: '',
    llmApiKey: '',
    llmModel: defaultLlmModel,
    mailNotifyEnabled: false,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    role: 'member',
    status: 'active',
    membershipExpiresAt: '',
    lastLoginAt: '',
    createdAt: nowIso(),
  };
  db.users.push(user);
  await saveJsonDb(db);
  return sanitizeMemberUser(user);
}

function assertManageableMember(target, currentUserId) {
  if (!target) throw new Error('会员不存在');
  if (isAdminUser(target)) throw new Error('默认管理员账号不能在会员管理中操作');
  if (Number(target.id) === Number(currentUserId)) throw new Error('不能操作当前登录账号');
}

async function adminUpdateMember(memberId, input, currentUserId) {
  const target = await getUserById(memberId);
  assertManageableMember(target, currentUserId);
  const email = normalizeEmail(input.email || '');
  const status = input.status === 'disabled' ? 'disabled' : 'active';

  if (storageMode === 'mysql') {
    await mysqlRun('UPDATE users SET email = ?, status = ? WHERE id = ?', [email, status, Number(memberId)]);
    return sanitizeMemberUser(await getUserById(memberId));
  }

  const db = await loadJsonDb();
  const user = db.users.find((item) => Number(item.id) === Number(memberId));
  assertManageableMember(user, currentUserId);
  user.email = email;
  user.status = status;
  user.role = 'member';
  await saveJsonDb(db);
  return sanitizeMemberUser(user);
}

async function adminResetMemberPassword(memberId, input, currentUserId) {
  const target = await getUserById(memberId);
  assertManageableMember(target, currentUserId);
  const password = String(input.password || input.newPassword || '');
  if (password.length < 6) throw new Error('新密码至少需要 6 个字符');
  const passwordHash = hashPassword(password);

  if (storageMode === 'mysql') {
    await mysqlRun('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, Number(memberId)]);
    return sanitizeMemberUser(await getUserById(memberId));
  }

  const db = await loadJsonDb();
  const user = db.users.find((item) => Number(item.id) === Number(memberId));
  assertManageableMember(user, currentUserId);
  user.passwordHash = passwordHash;
  await saveJsonDb(db);
  return sanitizeMemberUser(user);
}

async function adminDeleteMember(memberId, currentUserId) {
  const target = await getUserById(memberId);
  assertManageableMember(target, currentUserId);

  if (storageMode === 'mysql') {
    await mysqlRun('DELETE FROM users WHERE id = ?', [Number(memberId)]);
    await mysqlRun('DELETE FROM sites WHERE user_id = ?', [Number(memberId)]);
    await mysqlRun('DELETE FROM articles WHERE user_id = ?', [Number(memberId)]);
    await mysqlRun('DELETE FROM anchors WHERE user_id = ?', [Number(memberId)]);
    await mysqlRun('DELETE FROM logs WHERE user_id = ?', [Number(memberId)]);
    await mysqlRun('DELETE FROM schedules WHERE user_id = ?', [Number(memberId)]);
    await mysqlRun('DELETE FROM forbidden_words WHERE user_id = ?', [Number(memberId)]);
    await mysqlRun('DELETE FROM payment_orders WHERE user_id = ?', [Number(memberId)]);
    return true;
  }

  const db = await loadJsonDb();
  db.users = db.users.filter((item) => Number(item.id) !== Number(memberId));
  db.sites = db.sites.filter((item) => Number(item.userId) !== Number(memberId));
  db.articles = db.articles.filter((item) => Number(item.userId) !== Number(memberId));
  db.anchors = (db.anchors || []).filter((item) => Number(item.userId) !== Number(memberId));
  db.logs = db.logs.filter((item) => Number(item.userId) !== Number(memberId));
  db.schedules = (db.schedules || []).filter((item) => Number(item.userId) !== Number(memberId));
  db.forbiddenWords = (db.forbiddenWords || []).filter((item) => Number(item.userId) !== Number(memberId));
  await saveJsonDb(db);
  await saveJsonPaymentOrders((await loadJsonPaymentOrders()).filter((item) => Number(item.userId) !== Number(memberId)));
  return true;
}

async function getAdminUser() {
  const byName = await getUserByUsername(bootstrapAdmin.username);
  if (byName) return byName;
  return getUserById(1);
}

async function saveMailSettings(userId, input) {
  const existing = await getUserById(userId);
  if (!isAdminUser(existing)) throw new Error('只有管理员可以配置邮件通知');

  const mailNotifyEnabled = input.mailNotifyEnabled === true || input.enabled === true;
  const smtpHost = String(input.smtpHost || '').trim();
  const smtpPort = Math.max(1, Math.min(65535, safeInt(input.smtpPort, 465)));
  const smtpSecure = input.smtpSecure !== false;
  const smtpUser = String(input.smtpUser || '').trim();
  const smtpPass = String(input.smtpPass || '').trim() || existing.smtpPass || '';
  const smtpFrom = String(input.smtpFrom || smtpUser || existing.email || '').trim();

  if (mailNotifyEnabled) {
    if (!smtpHost) throw new Error('请填写 SMTP 服务器地址');
    if (!smtpUser) throw new Error('请填写 SMTP 用户名');
    if (!smtpPass) throw new Error('请填写 SMTP 密码或授权码');
    if (!smtpFrom) throw new Error('请填写发件人邮箱');
  }
  if (smtpFrom) normalizeEmail(smtpFrom);
  if (existing.email) normalizeEmail(existing.email);

  if (storageMode === 'mysql') {
    await mysqlRun(
      'UPDATE users SET mail_notify_enabled = ?, smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_user = ?, smtp_pass = ?, smtp_from = ? WHERE id = ?',
      [mailNotifyEnabled ? 1 : 0, smtpHost, smtpPort, smtpSecure ? 1 : 0, smtpUser, smtpPass, smtpFrom, Number(userId)],
    );
    return { ...existing, mailNotifyEnabled, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom };
  }

  const db = await loadJsonDb();
  const user = db.users.find((item) => Number(item.id) === Number(userId));
  if (!user) throw new Error('用户不存在');
  Object.assign(user, { mailNotifyEnabled, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom });
  await saveJsonDb(db);
  return user;
}

function createMailTransport(admin) {
  return nodemailer.createTransport({
    host: admin.smtpHost,
    port: Number(admin.smtpPort || 465),
    secure: admin.smtpSecure !== false,
    auth: admin.smtpUser ? {
      user: admin.smtpUser,
      pass: admin.smtpPass,
    } : undefined,
  });
}

async function sendMailWithAdminConfig(admin, options) {
  if (!admin?.mailNotifyEnabled) throw new Error('管理员未启用邮件通知');
  if (!admin.smtpHost || !admin.smtpUser || !admin.smtpPass) throw new Error('管理员 SMTP 配置不完整');
  const transporter = createMailTransport(admin);
  return transporter.sendMail({
    from: admin.smtpFrom || admin.smtpUser,
    ...options,
  });
}

async function sendPublishSuccessNotification(article, site, userId) {
  const recipient = await getUserById(userId);
  const to = normalizeEmail(recipient?.email || '');
  if (!to) return { skipped: true, reason: '会员未填写邮箱' };
  const admin = await getAdminUser();
  if (!admin?.mailNotifyEnabled) return { skipped: true, reason: '管理员未启用邮件通知' };

  const subject = `文章发布成功：${article.title}`;
  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.7;color:#1f2937">',
    '<h2 style="margin:0 0 12px">文章发布成功</h2>',
    `<p><strong>文章标题：</strong>${escapeHtml(article.title)}</p>`,
    `<p><strong>发布站点：</strong>${escapeHtml(site?.name || '-')}</p>`,
    `<p><strong>发布时间：</strong>${escapeHtml(formatDateTimeForMail(article.publishedAt || nowIso()))}</p>`,
    article.publishMessage ? `<p><strong>发布结果：</strong>${escapeHtml(article.publishMessage)}</p>` : '',
    '<p style="color:#64748b">本邮件由 AIGOU 智能发布后台自动发送。</p>',
    '</div>',
  ].join('');

  await sendMailWithAdminConfig(admin, {
    to,
    subject,
    text: `文章发布成功\n标题：${article.title}\n站点：${site?.name || '-'}\n时间：${formatDateTimeForMail(article.publishedAt || nowIso())}`,
    html,
  });
  return { skipped: false };
}

function formatDateTimeForMail(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleString('zh-CN', { hour12: false });
}

async function getDb(userId) {
  const ownerId = Number(userId || 0);
  if (storageMode === 'mysql') {
    const where = ownerId ? ' WHERE user_id = ?' : '';
    const params = ownerId ? [ownerId] : [];
    const [sites, articles, logs, anchors, schedules, forbiddenWords] = await Promise.all([
      mysqlRows(`SELECT * FROM sites${where} ORDER BY id DESC`, params),
      mysqlRows(`SELECT * FROM articles${where} ORDER BY id DESC`, params),
      mysqlRows(`SELECT * FROM logs${where} ORDER BY id DESC LIMIT 80`, params),
      mysqlRows(`SELECT * FROM anchors${where} ORDER BY id DESC`, params),
      mysqlRows(`SELECT * FROM schedules${where} ORDER BY id DESC`, params),
      mysqlRows(`SELECT * FROM forbidden_words${where} ORDER BY id DESC`, params),
    ]);
    return {
      sites: sites.map(rowToSite),
      articles: articles.map(rowToArticle),
      logs: logs.map(rowToLog),
      anchors: anchors.map(rowToAnchor),
      schedules: schedules.map(rowToSchedule),
      forbiddenWords: forbiddenWords.map(rowToForbiddenWords),
    };
  }

  const db = await loadJsonDb();
  if (!ownerId) return db;
  return {
    users: db.users,
    sites: db.sites.filter((item) => Number(item.userId) === ownerId),
    articles: db.articles.filter((item) => Number(item.userId) === ownerId),
    logs: db.logs.filter((item) => Number(item.userId) === ownerId),
    anchors: db.anchors.filter((item) => Number(item.userId) === ownerId),
    schedules: db.schedules.filter((item) => Number(item.userId) === ownerId),
    forbiddenWords: (db.forbiddenWords || []).filter((item) => Number(item.userId) === ownerId),
  };
}

async function addLog(title, site, result, userId) {
  const normalizedResult = normalizeLogResult(result);
  if (storageMode === 'mysql') {
    await mysqlRun('INSERT INTO logs (user_id, log_time, title, site, result) VALUES (?, ?, ?, ?, ?)', [Number(userId), nowTime(), title, site, normalizedResult]);
    return;
  }
  const db = await loadJsonDb();
  db.logs.unshift({
    id: nextId(db.logs),
    userId: Number(userId),
    time: nowTime(),
    title,
    site,
    result: normalizedResult,
    createdAt: nowIso(),
  });
  db.logs = db.logs.slice(0, 80);
  await saveJsonDb(db);
}

async function createSite(input, userId) {
  const siteId = Number(input.id || 0);
  const domain = normalizeDomain(input.domain || input.url);
  if (!input.name && !domain) throw new Error('请填写站点名称和网站地址');
  if (!domain) throw new Error('请输入网站地址');

  const payload = {
    userId: Number(userId),
    name: String(input.name || siteNameFromDomain(domain)).trim(),
    domain,
    cms: String(input.cms || 'PbootCMS v2.1'),
    status: String(input.pbootApiUrl || '').trim() ? SITE_STATUS.ready : SITE_STATUS.pending,
    lastSync: input.lastSync || '',
    pbootApiUrl: String(input.pbootApiUrl || '').trim(),
    pbootToken: String(input.pbootToken || '').trim(),
    pbootCategoryId: String(input.pbootCategoryId || '').trim(),
    pbootCategoryName: String(input.pbootCategoryName || '').trim(),
    createdAt: input.createdAt || nowIso(),
  };

  if (storageMode === 'mysql') {
    if (siteId) {
      const [existing] = await mysqlRows('SELECT * FROM sites WHERE id = ? AND user_id = ? LIMIT 1', [siteId, Number(userId)]);
      if (!existing) throw new Error('站点不存在');
      const nextToken = payload.pbootToken || existing.pboot_token || '';
      await mysqlRun(
        'UPDATE sites SET name = ?, domain = ?, cms = ?, status = ?, last_sync = ?, pboot_api_url = ?, pboot_token = ?, pboot_category_id = ?, pboot_category_name = ? WHERE id = ? AND user_id = ?',
        [payload.name, payload.domain, payload.cms, payload.status, payload.lastSync, payload.pbootApiUrl, nextToken, payload.pbootCategoryId, payload.pbootCategoryName, siteId, Number(userId)],
      );
      return { id: siteId, ...payload, pbootToken: nextToken };
    }

    const [duplicate] = await mysqlRows('SELECT id FROM sites WHERE user_id = ? AND domain = ? LIMIT 1', [Number(userId), payload.domain]);
    if (duplicate) throw new Error('该域名已存在');

    const result = await mysqlRun(
      'INSERT INTO sites (user_id, name, domain, cms, status, last_sync, pboot_api_url, pboot_token, pboot_category_id, pboot_category_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [Number(userId), payload.name, payload.domain, payload.cms, payload.status, payload.lastSync, payload.pbootApiUrl, payload.pbootToken, payload.pbootCategoryId, payload.pbootCategoryName],
    );
    return { id: result.insertId, ...payload };
  }

  const db = await loadJsonDb();
  if (siteId) {
    const existing = db.sites.find((item) => Number(item.id) === siteId && Number(item.userId) === Number(userId));
    if (!existing) throw new Error('站点不存在');
    const duplicate = db.sites.find((item) => Number(item.id) !== siteId && Number(item.userId) === Number(userId) && item.domain === payload.domain);
    if (duplicate) throw new Error('该域名已存在');
    Object.assign(existing, payload, { pbootToken: payload.pbootToken || existing.pbootToken || '' });
    await saveJsonDb(db);
    return existing;
  }

  const duplicate = db.sites.find((item) => Number(item.userId) === Number(userId) && item.domain === payload.domain);
  if (duplicate) throw new Error('该域名已存在');
  const created = { id: nextId(db.sites), ...payload };
  db.sites.unshift(created);
  await saveJsonDb(db);
  return created;
}

async function deleteSite(id, userId) {
  if (storageMode === 'mysql') {
    const [site] = await mysqlRows('SELECT * FROM sites WHERE id = ? AND user_id = ? LIMIT 1', [Number(id), Number(userId)]);
    if (!site) return null;
    await mysqlRun('DELETE FROM sites WHERE id = ? AND user_id = ?', [Number(id), Number(userId)]);
    await mysqlRun('DELETE FROM anchors WHERE site_id = ? AND user_id = ?', [Number(id), Number(userId)]);
    await mysqlRun('DELETE FROM schedules WHERE site_id = ? AND user_id = ?', [Number(id), Number(userId)]);
    return rowToSite(site);
  }

  const db = await loadJsonDb();
  const site = db.sites.find((item) => Number(item.id) === Number(id) && Number(item.userId) === Number(userId));
  db.sites = db.sites.filter((item) => Number(item.id) !== Number(id) || Number(item.userId) !== Number(userId));
  db.anchors = db.anchors.filter((item) => Number(item.siteId) !== Number(id) || Number(item.userId) !== Number(userId));
  db.schedules = db.schedules.filter((item) => Number(item.siteId) !== Number(id) || Number(item.userId) !== Number(userId));
  await saveJsonDb(db);
  return site || null;
}

async function updateSiteSync(id, userId) {
  if (storageMode === 'mysql') {
    await mysqlRun('UPDATE sites SET status = ?, last_sync = ? WHERE id = ? AND user_id = ?', [SITE_STATUS.ready, nowIso(), Number(id), Number(userId)]);
    const [site] = await mysqlRows('SELECT * FROM sites WHERE id = ? AND user_id = ? LIMIT 1', [Number(id), Number(userId)]);
    return site ? rowToSite(site) : null;
  }

  const db = await loadJsonDb();
  const site = db.sites.find((item) => Number(item.id) === Number(id) && Number(item.userId) === Number(userId));
  if (!site) return null;
  site.status = SITE_STATUS.ready;
  site.lastSync = nowIso();
  await saveJsonDb(db);
  return site;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function insertImageIntoContent(content, image) {
  if (!image?.absoluteUrl) return content;
  const html = `<p><img src="${escapeHtmlAttr(image.absoluteUrl)}" alt="${escapeHtmlAttr(image.name || '文章配图')}" style="max-width:100%;height:auto;" /></p>`;
  const blocks = String(content).split('\n\n');
  const index = Math.min(2, Math.max(1, blocks.length));
  blocks.splice(index, 0, html);
  return blocks.join('\n\n');
}

function createArticleTemplate(topic, tag, siteName, sequenceNumber = 1) {
  const title = sequenceNumber > 1 ? `${topic}（第 ${sequenceNumber} 篇）` : topic;
  return [
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>这篇内容围绕“${escapeHtml(topic)}”整理，适合发布到 ${escapeHtml(siteName)}，可以直接作为站点文章草稿使用。</p>`,
    '<h2>核心信息</h2>',
    `<p>建议从用户常见问题、适用场景、选择标准和注意事项四个角度展开，让文章兼顾可读性和搜索覆盖。</p>`,
    '<h2>正文展开</h2>',
    `<p>当前内容类型为 ${escapeHtml(tag)}。写作时尽量保持小标题清晰、段落简洁、结论直接，避免单纯堆砌关键词。</p>`,
    '<h2>发布建议</h2>',
    '<p>正式发布前，请结合你的业务资料补充真实参数、价格、案例或联系方式，确保信息准确可用。</p>',
  ].join('\n\n');
}

function stripCodeFence(text) {
  return String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function extractJsonObject(text) {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeGeneratedArticle(topic, tag, siteName, text, sequenceNumber = 1) {
  const parsed = extractJsonObject(text);
  const fallbackTitle = sequenceNumber > 1 ? `${topic}（第 ${sequenceNumber} 篇）` : topic.length > 36 ? `${topic.slice(0, 36)}...` : topic;
  if (parsed && typeof parsed === 'object') {
    const title = String(parsed.title || fallbackTitle).trim() || fallbackTitle;
    const content = String(parsed.content || '').trim();
    if (content) return { title, content };
  }

  const raw = String(text || '').trim();
  if (!raw) {
    return { title: fallbackTitle, content: createArticleTemplate(topic, tag, siteName, sequenceNumber) };
  }

  return {
    title: fallbackTitle,
    content: raw.includes('<p>') || raw.includes('<h')
      ? raw
      : raw
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((block) => `<p>${escapeHtml(block.trim())}</p>`)
          .join('\n\n'),
  };
}

function parseKeywordText(value) {
  return [...new Set(
    String(value || '')
      .split(/[\n,，]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function parseTopics(input) {
  const list = [];
  const topic = String(input.topic || '').trim();
  if (topic) list.push(topic);
  if (Array.isArray(input.keywords)) {
    for (const item of input.keywords) {
      const value = String(item || '').trim();
      if (value) list.push(value);
    }
  } else {
    list.push(...parseKeywordText(input.keywords || input.keywordsText || ''));
  }
  return [...new Set(list)].slice(0, 100);
}

function buildTopicPlan(input) {
  const baseTopics = parseTopics(input);
  const targetCount = Math.max(1, safeInt(input.targetCount, baseTopics.length || 1));
  if (!baseTopics.length) throw new Error('请至少输入一个关键词或主题');

  const plan = [];
  for (let index = 0; index < targetCount; index += 1) {
    plan.push({
      topic: baseTopics[index % baseTopics.length],
      sequenceNumber: index + 1,
      totalCount: targetCount,
    });
  }
  return plan;
}

function normalizePbootCategories(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const id = item.id ?? item.scode ?? item.value ?? item.code;
      const name = item.name ?? item.label ?? item.title ?? '';
      if (id === undefined || id === null || name === '') return null;
      return {
        id: String(id),
        name: String(name),
        children: normalizePbootCategories(item.children || item.son || item.sons || item.subsorts || []),
      };
    })
    .filter(Boolean);
}

function extractPbootCategorySource(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return (
    payload.categories ||
    payload.data?.categories ||
    payload.data?.list ||
    payload.data ||
    payload.result?.list ||
    payload.result ||
    payload.list ||
    []
  );
}

async function parseResponsePayload(response) {
  const text = await response.text();
  try {
    return { text, data: text ? JSON.parse(text) : {} };
  } catch {
    return { text, data: { raw: text } };
  }
}

function postJson(targetUrl, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const body = JSON.stringify(payload);
    const transport = url.protocol === 'https:' ? import('node:https') : import('node:http');
    transport.then((module) => {
      const request = module.request(
        {
          method: 'POST',
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            ...extraHeaders,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              text: async () => text,
              json: async () => JSON.parse(text || '{}'),
            });
          });
        },
      );
      request.on('error', reject);
      request.write(body);
      request.end();
    }).catch(reject);
  });
}

function requestJson(targetUrl, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const transport = url.protocol === 'https:' ? import('node:https') : import('node:http');
    transport.then((module) => {
      const request = module.request(
        {
          method: 'GET',
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          headers: {
            Accept: 'application/json',
            ...extraHeaders,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              text: async () => text,
              json: async () => JSON.parse(text || '{}'),
            });
          });
        },
      );
      request.on('error', reject);
      request.end();
    }).catch(reject);
  });
}

function pbootPublicNavUrl(pbootApiUrl = '', site = null) {
  const candidates = [
    String(pbootApiUrl || '').trim(),
    site?.domain ? `https://${site.domain}` : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.startsWith('http') ? candidate : `https://${candidate}`);
      return `${url.protocol}//${url.host}/api.php/cms/nav`;
    } catch {
      // Try the next candidate.
    }
  }
  return '';
}

function pbootSiteRootUrl(pbootApiUrl = '', site = null) {
  const candidates = [
    String(pbootApiUrl || '').trim(),
    site?.domain ? `https://${site.domain}` : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.startsWith('http') ? candidate : `https://${candidate}`);
      return `${url.protocol}//${url.host}/`;
    } catch {
      // Try the next candidate.
    }
  }
  return '';
}

function decodeHtmlText(value = '') {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPbootCategoriesFromHtml(html = '') {
  const result = [];
  const seen = new Set();
  const ignoredNames = new Set(['首页', '网站首页', '详情', '全部', '探索更多', '一键拨打', 'XML地图', 'Link友情链接']);
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(String(html || '')))) {
    const href = String(match[1] || '').trim();
    const name = decodeHtmlText(match[2]);
    if (!name || ignoredNames.has(name)) continue;

    const slugMatch = href.match(/(?:^|\/)\?([A-Za-z0-9_-]+)\/?$/);
    if (!slugMatch) continue;
    const slug = slugMatch[1];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push({ id: slug, name });
  }
  return result;
}

async function fetchPbootCategoriesFromPublicNav(pbootApiUrl, site) {
  const url = pbootPublicNavUrl(pbootApiUrl, site);
  if (!url) return [];
  const response = await requestJson(url, { Accept: 'application/json' });
  const payload = await parseResponsePayload(response);
  if (!response.ok) {
    const message = payload.data?.error?.message || payload.data?.message || payload.text || `公共栏目接口返回 HTTP ${response.status}`;
    throw new Error(message);
  }
  if (payload.data?.code === 0 || payload.data?.success === false || payload.data?.status === 0) {
    throw new Error(payload.data?.data || payload.data?.msg || payload.data?.message || '公共栏目接口返回失败');
  }
  return normalizePbootCategories(extractPbootCategorySource(payload.data));
}

async function fetchPbootCategoriesFromHomepage(pbootApiUrl, site) {
  const url = pbootSiteRootUrl(pbootApiUrl, site);
  if (!url) return [];
  const response = await requestJson(url, { Accept: 'text/html,application/xhtml+xml' });
  const payload = await parseResponsePayload(response);
  if (!response.ok) {
    const message = payload.data?.message || payload.text || `首页返回 HTTP ${response.status}`;
    throw new Error(message);
  }
  return extractPbootCategoriesFromHtml(payload.text);
}

function extractLlmModels(payload) {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload?.result)
          ? payload.result
          : [];
  const models = source
    .map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return '';
      return item.id || item.name || item.model || '';
    })
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return [...new Set(models)];
}

async function fetchSupportedModels(user, input = {}) {
  const apiUrl = normalizeModelApiUrl(input.apiUrl || user.llmApiUrl || '');
  const apiKey = String(input.apiKey || '').trim() || user.llmApiKey || '';
  if (!apiUrl) throw new Error('请先填写 API 地址');
  if (!apiKey) throw new Error('请先填写 API Key');

  let targetUrl = '';
  try {
    targetUrl = modelListApiUrl(apiUrl);
  } catch {
    throw new Error('API 地址格式不正确，请填写完整的 http 或 https 地址');
  }

  const response = await requestJson(targetUrl, {
    Authorization: `Bearer ${apiKey}`,
  });
  const { text, data } = await parseResponsePayload(response);
  if (!response.ok) {
    const message = data?.error?.message || data?.message || text.slice(0, 180) || '接口无返回内容';
    throw new Error(`读取模型失败（HTTP ${response.status}）：${message}`);
  }

  const models = extractLlmModels(data);
  if (!models.length) throw new Error('接口返回成功，但没有读取到可用模型');
  const selectedModel = normalizeModelName(input.model || user.llmModel || models[0]);
  return {
    models,
    selectedModel,
    listApiUrl: targetUrl,
  };
}

async function callLlmToGenerateArticle(user, payload) {
  if (!user?.llmApiUrl || !user?.llmApiKey) return null;
  const { topic, tag, site, sequenceNumber, totalCount } = payload;
  const response = await postJson(
    user.llmApiUrl,
    {
      model: normalizeModelName(user.llmModel),
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            '你是中文网站内容编辑。请严格输出 JSON：{"title":"...","content":"..."}。content 必须是可直接发布的 HTML 片段，包含 h1、h2、p，不要输出 Markdown 代码块和额外说明。',
        },
        {
          role: 'user',
          content: [
            `目标站点：${site.name}`,
            `内容类型：${tag}`,
            `关键词/主题：${topic}`,
            `当前序号：第 ${sequenceNumber} / ${totalCount} 篇`,
            '要求：',
            '1. 面向中文网站发布；',
            '2. 包含引言、2-3 个小标题和结尾；',
            '3. 长度约 600-900 字；',
            '4. 不编造无法验证的数据；',
            '5. 标题尽量避免与前文完全重复；',
            '6. 直接返回 JSON。',
          ].join('\n'),
        },
      ],
    },
    { Authorization: `Bearer ${user.llmApiKey}` },
  );
  const { data, text } = await parseResponsePayload(response);
  if (!response.ok) throw new Error(data.error?.message || data.message || data.msg || `模型接口返回 HTTP ${response.status}`);
  const content =
    data.choices?.[0]?.message?.content ||
    data.output_text ||
    data.output?.[0]?.content?.[0]?.text ||
    data.raw ||
    text;
  return normalizeGeneratedArticle(topic, tag, site.name, content, sequenceNumber);
}

async function composeArticleDraft(input, context, user) {
  const topic = String(input.topic || '').trim();
  const tag = String(input.tag || 'SEO软文').trim() || 'SEO软文';
  const sequenceNumber = Math.max(1, safeInt(input.sequenceNumber, 1));
  const totalCount = Math.max(sequenceNumber, safeInt(input.totalCount, sequenceNumber));
  if (!topic) throw new Error('请输入文章主题');

  const db = await getDb(user.id);
  const siteId = Number(input.siteId || 0);
  if (!siteId) throw new Error('请选择发布站点');
  const site = db.sites.find((item) => Number(item.id) === siteId);
  if (!site) throw new Error('选择的发布站点不存在，请刷新页面后重新选择');

  let generated = null;
  let llmError = '';
  try {
    generated = await callLlmToGenerateArticle(user, { topic, tag, site, sequenceNumber, totalCount });
  } catch (error) {
    llmError = error.message || String(error);
  }
  const pickedImage = await pickRandomImage(context?.req, user.id, context?.baseUrl || '');
  const draft = generated || {
    title: sequenceNumber > 1 ? `${topic}（第 ${sequenceNumber} 篇）` : topic.length > 36 ? `${topic.slice(0, 36)}...` : topic,
    content: createArticleTemplate(topic, tag, site.name, sequenceNumber),
  };

  return sanitizeForbiddenWordsInArticle({
    userId: Number(user.id),
    title: draft.title,
    tag,
    status: ARTICLE_STATUS.draft,
    siteId: Number(site.id),
    topic,
    content: insertImageIntoContent(draft.content, pickedImage),
    createdAt: nowIso(),
    publishedAt: '',
    publishMessage: llmError ? `LLM fallback: ${llmError}` : '',
  }, user.id);
}

async function saveArticleRecord(article) {
  if (storageMode === 'mysql') {
    const result = await mysqlRun(
      'INSERT INTO articles (user_id, title, tag, status, site_id, topic, content, created_at, published_at, publish_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [article.userId, article.title, article.tag, article.status, article.siteId, article.topic || '', article.content, article.createdAt, article.publishedAt || '', article.publishMessage || ''],
    );
    return { id: result.insertId, ...article };
  }

  const db = await loadJsonDb();
  const created = { id: nextId(db.articles), ...article };
  db.articles.unshift(created);
  await saveJsonDb(db);
  return created;
}

async function updateArticleRecord(article) {
  if (storageMode === 'mysql') {
    await mysqlRun(
      'UPDATE articles SET title = ?, tag = ?, status = ?, topic = ?, content = ?, publish_message = ?, published_at = ? WHERE id = ? AND user_id = ?',
      [article.title, article.tag, article.status, article.topic || '', article.content, article.publishMessage || '', article.publishedAt || '', Number(article.id), Number(article.userId)],
    );
    return article;
  }

  const db = await loadJsonDb();
  const existing = db.articles.find((item) => Number(item.id) === Number(article.id) && Number(item.userId) === Number(article.userId));
  if (!existing) return null;
  Object.assign(existing, article);
  await saveJsonDb(db);
  return existing;
}

async function deleteArticles(ids, userId) {
  const selectedIds = new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean));
  if (!selectedIds.size) throw new Error('请选择要删除的文章');

  if (storageMode === 'mysql') {
    const placeholders = [...selectedIds].map(() => '?').join(',');
    const result = await mysqlRun(
      `DELETE FROM articles WHERE user_id = ? AND id IN (${placeholders})`,
      [Number(userId), ...selectedIds],
    );
    return result.affectedRows || 0;
  }

  const db = await loadJsonDb();
  const before = db.articles.length;
  db.articles = db.articles.filter((item) => !(Number(item.userId) === Number(userId) && selectedIds.has(Number(item.id))));
  await saveJsonDb(db);
  return before - db.articles.length;
}

async function listPendingArticlesForSchedule(schedule) {
  const userId = Number(schedule.userId);
  const siteId = Number(schedule.siteId);
  if (storageMode === 'mysql') {
    const rows = await mysqlRows(
      `SELECT * FROM articles
       WHERE user_id = ? AND site_id = ? AND status = ?
       ORDER BY id ASC`,
      [userId, siteId, ARTICLE_STATUS.draft],
    );
    return rows.map(rowToArticle);
  }

  const db = await loadJsonDb();
  return db.articles
    .filter((item) => Number(item.userId) === userId && Number(item.siteId) === siteId && item.status === ARTICLE_STATUS.draft)
    .sort((a, b) => Number(a.id) - Number(b.id));
}

async function claimArticleForSending(article, userId) {
  const articleId = Number(article.id);
  const ownerId = Number(userId);
  const claimedAt = nowIso();

  if (storageMode === 'mysql') {
    const result = await mysqlRun(
      `UPDATE articles
       SET status = ?, publish_message = ?, published_at = ?
       WHERE id = ? AND user_id = ? AND status = ?`,
      [ARTICLE_STATUS.sending, '发送中', claimedAt, articleId, ownerId, ARTICLE_STATUS.draft],
    );
    if (!result.affectedRows) return null;
    const [row] = await mysqlRows('SELECT * FROM articles WHERE id = ? AND user_id = ? LIMIT 1', [articleId, ownerId]);
    return row ? rowToArticle(row) : null;
  }

  const db = await loadJsonDb();
  const existing = db.articles.find((item) => Number(item.id) === articleId && Number(item.userId) === ownerId);
  if (!existing || existing.status !== ARTICLE_STATUS.draft) return null;
  existing.status = ARTICLE_STATUS.sending;
  existing.publishMessage = '发送中';
  existing.publishedAt = claimedAt;
  await saveJsonDb(db);
  return { ...existing };
}

async function findArticleAndSite(articleId, userId) {
  const db = await getDb(userId);
  const article = db.articles.find((item) => Number(item.id) === Number(articleId));
  const site = article ? db.sites.find((item) => Number(item.id) === Number(article.siteId)) : null;
  return { article, site };
}

async function listAnchors(siteId, userId) {
  const id = Number(siteId);
  if (storageMode === 'mysql') {
    const rows = id
      ? await mysqlRows('SELECT * FROM anchors WHERE user_id = ? AND site_id = ? ORDER BY id DESC', [Number(userId), id])
      : await mysqlRows('SELECT * FROM anchors WHERE user_id = ? ORDER BY id DESC', [Number(userId)]);
    return rows.map(rowToAnchor);
  }

  const db = await loadJsonDb();
  const owned = db.anchors.filter((item) => Number(item.userId) === Number(userId));
  return id ? owned.filter((item) => Number(item.siteId) === id) : owned;
}

async function saveAnchor(input, userId) {
  const siteId = Number(input.siteId);
  const keyword = String(input.keyword || '').trim();
  const url = String(input.url || '').trim();
  const enabled = input.enabled !== false;
  if (!siteId || !keyword || !url) throw new Error('请填写站点、关键词和链接');

  if (storageMode === 'mysql') {
    if (input.id) {
      await mysqlRun(
        'UPDATE anchors SET site_id = ?, keyword = ?, url = ?, enabled = ? WHERE id = ? AND user_id = ?',
        [siteId, keyword, url, enabled ? 1 : 0, Number(input.id), Number(userId)],
      );
      return { id: Number(input.id), userId: Number(userId), siteId, keyword, url, enabled };
    }
    const result = await mysqlRun(
      'INSERT INTO anchors (user_id, site_id, keyword, url, enabled) VALUES (?, ?, ?, ?, ?)',
      [Number(userId), siteId, keyword, url, enabled ? 1 : 0],
    );
    return { id: result.insertId, userId: Number(userId), siteId, keyword, url, enabled };
  }

  const db = await loadJsonDb();
  if (input.id) {
    const existing = db.anchors.find((item) => Number(item.id) === Number(input.id) && Number(item.userId) === Number(userId));
    if (!existing) throw new Error('锚文本不存在');
    Object.assign(existing, { siteId, keyword, url, enabled });
    await saveJsonDb(db);
    return existing;
  }

  const created = {
    id: nextId(db.anchors),
    userId: Number(userId),
    siteId,
    keyword,
    url,
    enabled,
    createdAt: nowIso(),
  };
  db.anchors.unshift(created);
  await saveJsonDb(db);
  return created;
}

async function deleteAnchor(id, userId) {
  if (storageMode === 'mysql') {
    await mysqlRun('DELETE FROM anchors WHERE id = ? AND user_id = ?', [Number(id), Number(userId)]);
    return;
  }
  const db = await loadJsonDb();
  db.anchors = db.anchors.filter((item) => Number(item.id) !== Number(id) || Number(item.userId) !== Number(userId));
  await saveJsonDb(db);
}

async function applyAnchorsToContent(siteId, userId, content) {
  const anchors = (await listAnchors(siteId, userId))
    .filter((item) => item.enabled && item.keyword && item.url);

  const nextContent = String(content || '');
  if (!anchors.length) return nextContent;

  const anchor = anchors[Math.floor(Math.random() * anchors.length)];
  const anchorHtml = `<a href="${escapeHtmlAttr(anchor.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(anchor.keyword)}</a>`;
  const keywordPattern = new RegExp(`(?![^<]*>)${escapeRegExp(anchor.keyword)}`, 'i');
  if (keywordPattern.test(nextContent)) {
    return nextContent.replace(keywordPattern, anchorHtml);
  }

  const insertHtml = `<p>${anchorHtml}</p>`;
  if (/<\/p>\s*$/i.test(nextContent)) return `${nextContent}\n${insertHtml}`;
  return `${nextContent}\n\n${insertHtml}`;
}

function parseForbiddenWordRules(text) {
  const seen = new Set();
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf('=');
      const source = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : line;
      const replacement = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : '*';
      return { source, replacement: replacement || '*', raw: line };
    })
    .filter((rule) => {
      if (!rule.source || seen.has(rule.source)) return false;
      seen.add(rule.source);
      return true;
    })
    .sort((a, b) => b.source.length - a.source.length);
}

async function listForbiddenWords(userId) {
  if (storageMode === 'mysql') {
    const rows = await mysqlRows('SELECT * FROM forbidden_words WHERE user_id = ? ORDER BY id DESC', [Number(userId)]);
    return rows.map(rowToForbiddenWords);
  }
  const db = await loadJsonDb();
  return (db.forbiddenWords || []).filter((item) => Number(item.userId) === Number(userId));
}

async function saveForbiddenWords(input, userId) {
  const name = String(input.name || '').trim();
  const wordsText = String(input.wordsText || input.words_text || '').trim();
  const enabled = input.enabled !== false;
  if (!name) throw new Error('请填写分类名称');
  if (!wordsText) throw new Error('请填写违禁词');
  if (!parseForbiddenWordRules(wordsText).length) throw new Error('请至少填写一个有效违禁词');
  const now = nowIso();

  if (storageMode === 'mysql') {
    if (input.id) {
      const result = await mysqlRun(
        'UPDATE forbidden_words SET name = ?, words_text = ?, enabled = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        [name, wordsText, enabled ? 1 : 0, now, Number(input.id), Number(userId)],
      );
      if (!result.affectedRows) throw new Error('违禁词分类不存在');
      const [row] = await mysqlRows('SELECT * FROM forbidden_words WHERE id = ? AND user_id = ? LIMIT 1', [Number(input.id), Number(userId)]);
      return rowToForbiddenWords(row);
    }
    const result = await mysqlRun(
      'INSERT INTO forbidden_words (user_id, name, words_text, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [Number(userId), name, wordsText, enabled ? 1 : 0, now, now],
    );
    const [row] = await mysqlRows('SELECT * FROM forbidden_words WHERE id = ? AND user_id = ? LIMIT 1', [result.insertId, Number(userId)]);
    return rowToForbiddenWords(row);
  }

  const db = await loadJsonDb();
  db.forbiddenWords ||= [];
  if (input.id) {
    const existing = db.forbiddenWords.find((item) => Number(item.id) === Number(input.id) && Number(item.userId) === Number(userId));
    if (!existing) throw new Error('违禁词分类不存在');
    Object.assign(existing, { name, wordsText, enabled, updatedAt: now });
    await saveJsonDb(db);
    return existing;
  }

  const created = {
    id: nextId(db.forbiddenWords),
    userId: Number(userId),
    name,
    wordsText,
    enabled,
    createdAt: now,
    updatedAt: now,
  };
  db.forbiddenWords.unshift(created);
  await saveJsonDb(db);
  return created;
}

async function deleteForbiddenWords(id, userId) {
  if (storageMode === 'mysql') {
    await mysqlRun('DELETE FROM forbidden_words WHERE id = ? AND user_id = ?', [Number(id), Number(userId)]);
    return;
  }
  const db = await loadJsonDb();
  db.forbiddenWords = (db.forbiddenWords || []).filter((item) => Number(item.id) !== Number(id) || Number(item.userId) !== Number(userId));
  await saveJsonDb(db);
}

async function sanitizeForbiddenWordsInText(text, userId) {
  let next = String(text || '');
  const groups = await listForbiddenWords(userId);
  const rules = groups
    .filter((item) => item.enabled !== false)
    .flatMap((item) => parseForbiddenWordRules(item.wordsText));
  for (const rule of rules) {
    next = next.replace(new RegExp(escapeRegExp(rule.source), 'g'), rule.replacement);
  }
  return next;
}

async function sanitizeForbiddenWordsInArticle(article, userId) {
  return {
    ...article,
    title: await sanitizeForbiddenWordsInText(article.title, userId),
    topic: await sanitizeForbiddenWordsInText(article.topic, userId),
    content: await sanitizeForbiddenWordsInText(article.content, userId),
  };
}

async function publishToPboot(site, article, userId) {
  if (!site?.pbootApiUrl) throw new Error('该站点未配置发布接口地址');
  const cleanedArticle = await sanitizeForbiddenWordsInArticle(article, userId);
  const content = await applyAnchorsToContent(site.id, userId, cleanedArticle.content);
  const response = await postJson(
    site.pbootApiUrl,
    {
      action: 'publish',
      token: site.pbootToken,
      title: cleanedArticle.title,
      content,
      tag: cleanedArticle.tag,
      tags: article.tag,
      keywords: cleanedArticle.topic || cleanedArticle.title,
      description: String(cleanedArticle.title || '').slice(0, 120),
      categoryId: site.pbootCategoryId || '1',
      category_ids: site.pbootCategoryId || '1',
      scode: site.pbootCategoryId || '1',
      subscode: '',
    },
    site.pbootToken ? { 'X-AIGOU-TOKEN': site.pbootToken } : {},
  );
  const payload = await parseResponsePayload(response);
  if (!response.ok) throw new Error(payload.data.error?.message || payload.data.message || payload.text || `发布接口返回 HTTP ${response.status}`);
  if (payload.data.success === false || payload.data.status === 0) {
    throw new Error(payload.data.msg || payload.data.message || '发布接口返回失败');
  }
  return { ...payload.data, publishedContent: content };
}

async function fetchPbootCategories(input, userId) {
  const siteId = Number(input.siteId || 0);
  const db = await getDb(userId);
  const site = db.sites.find((item) => Number(item.id) === siteId);
  const pbootApiUrl = String(input.pbootApiUrl || site?.pbootApiUrl || '').trim();
  const pbootToken = String(input.pbootToken || site?.pbootToken || '').trim();
  if (!pbootApiUrl) throw new Error('请先填写 PbootCMS 发布接口地址');

  const errors = [];
  try {
    const response = await postJson(
      pbootApiUrl,
      { action: 'categories', token: pbootToken },
      pbootToken ? { 'X-AIGOU-TOKEN': pbootToken } : {},
    );
    const payload = await parseResponsePayload(response);
    if (!response.ok) throw new Error(payload.data.error?.message || payload.data.message || payload.text || `栏目接口返回 HTTP ${response.status}`);
    if (payload.data.success === false || payload.data.status === 0) {
      throw new Error(payload.data.msg || payload.data.message || '目标站桥接接口返回失败');
    }
    const categories = normalizePbootCategories(extractPbootCategorySource(payload.data));
    if (categories.length) return categories;
    errors.push('桥接接口已连通，但返回栏目为空');
  } catch (error) {
    errors.push(`桥接读取失败：${error.message || String(error)}`);
  }

  try {
    const publicCategories = await fetchPbootCategoriesFromPublicNav(pbootApiUrl, site);
    if (publicCategories.length) return publicCategories;
    errors.push('公共栏目接口 /api.php/cms/nav 返回为空');
  } catch (error) {
    errors.push(`公共栏目接口读取失败：${error.message || String(error)}`);
  }

  try {
    const htmlCategories = await fetchPbootCategoriesFromHomepage(pbootApiUrl, site);
    if (htmlCategories.length) return htmlCategories;
    errors.push('首页导航识别不到可用栏目');
  } catch (error) {
    errors.push(`首页导航识别失败：${error.message || String(error)}`);
  }

  throw new Error(`没有读取到目标站栏目。${errors.join('；')}`);
}

function formatPublishMessage(result) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '发送成功';
  const parts = [];
  const message = result.msg || result.message || (result.success === true ? '发送成功' : '');
  if (message) parts.push(String(message));
  if (result.id) parts.push(`ID: ${result.id}`);
  if (result.url) parts.push(`URL: ${result.url}`);
  return parts.length ? parts.join('；') : '发送成功';
}

async function markArticlePublished(article, result) {
  article.status = ARTICLE_STATUS.published;
  article.publishMessage = formatPublishMessage(result);
  article.publishedAt = nowIso();
  return updateArticleRecord(article);
}

async function markArticleFailed(article, errorMessage) {
  article.status = ARTICLE_STATUS.failed;
  article.publishMessage = errorMessage;
  article.publishedAt = nowIso();
  return updateArticleRecord(article);
}

async function publishArticleByRecord(article, userId) {
  const db = await getDb(userId);
  const site = db.sites.find((item) => Number(item.id) === Number(article.siteId));
  if (!site) throw new Error('站点不存在');

  if (!site.pbootApiUrl) {
    return markArticlePublished({ ...article }, '站点未配置 PbootCMS 接口，已仅更新本地状态');
  }

  const result = await publishToPboot(site, article, userId);
  return markArticlePublished({ ...article, content: result.publishedContent || article.content }, result);
}

async function publishArticle(articleId, userId) {
  const { article, site } = await findArticleAndSite(articleId, userId);
  if (!article) throw new Error('文章不存在');
  if (!site) throw new Error('站点不存在');
  if (article.status === ARTICLE_STATUS.published) throw new Error('该文章已发送，不能重复发送');
  if (article.status !== ARTICLE_STATUS.draft) throw new Error('只有待发送文章可以发送');

  let claimed = null;
  try {
    claimed = await claimArticleForSending(article, userId);
    if (!claimed) throw new Error('文章正在发送或状态已变化，请刷新后重试');
    const published = await publishArticleByRecord(claimed, userId);
    await addLog(`发布文章：${published.title}`, site.name, LOG_RESULT.success, userId);
    try {
      const mailResult = await sendPublishSuccessNotification(published, site, userId);
      if (!mailResult.skipped) await addLog(`邮件通知：${published.title}`, site.name, LOG_RESULT.success, userId);
    } catch (mailError) {
      await addLog(`邮件通知失败：${mailError.message || '发送失败'}`, site.name, LOG_RESULT.failed, userId);
    }
    return published;
  } catch (error) {
    if (claimed) await markArticleFailed(claimed, error.message || '发布失败');
    await addLog(`发布失败：${article.title}`, site.name, LOG_RESULT.failed, userId);
    throw error;
  }
}

async function createArticles(input, context, user) {
  const plan = buildTopicPlan(input);
  const autoPublish = Boolean(input.autoPublish);
  const articles = [];
  const errors = [];
  const siteId = Number(input.siteId || 0);
  if (!siteId) throw new Error('请选择发布站点');
  const db = await getDb(user.id);
  const selectedSite = db.sites.find((item) => Number(item.id) === siteId);
  if (!selectedSite) throw new Error('选择的发布站点不存在，请先重新添加站点');

  for (const item of plan) {
    try {
      const draft = await composeArticleDraft(
        {
          siteId: input.siteId,
          topic: item.topic,
          tag: input.tag,
          sequenceNumber: item.sequenceNumber,
          totalCount: item.totalCount,
        },
        context,
        user,
      );
      let article = await saveArticleRecord(draft);
      if (autoPublish) article = await publishArticleByRecord(article, user.id);
      articles.push(article);
    } catch (error) {
      errors.push({ topic: item.topic, message: error.message || String(error) });
    }
  }

  if (!articles.length) throw new Error(errors[0]?.message || '文章生成失败');
  return {
    articles,
    errors,
    summary: {
      requestedCount: plan.length,
      successCount: articles.length,
      failedCount: errors.length,
    },
  };
}

function createInstallToken() {
  return crypto.randomBytes(18).toString('hex');
}

async function createPbootBridgePhp(token) {
  const template = await readFile(bridgeTemplatePath, 'utf8');
  return template.split('CHANGE_THIS_TOKEN').join(token);
}

async function resolvePbootBridgeToken(input, userId) {
  const queryToken = String(input.token || '').trim();
  if (queryToken) return queryToken;

  const siteId = Number(input.siteId || 0);
  if (siteId) {
    const db = await getDb(userId);
    const site = db.sites.find((item) => Number(item.id) === siteId);
    if (!site) throw new Error('站点不存在');
    if (site.pbootToken) return site.pbootToken;
  }

  throw new Error('请先生成或保存桥接 Token，再下载 aigou-publish.php');
}

function normalizeScheduleInput(input) {
  const targetCount = Math.max(1, Math.min(1000, safeInt(input.targetCount, 1)));
  const intervalMinutes = Math.max(1, safeInt(input.intervalMinutes, 60));
  const runTime = normalizeRunTime(input.runTime || input.run_time || '09:00');
  return {
    id: Number(input.id || 0),
    name: String(input.name || '').trim(),
    siteId: Number(input.siteId || 0),
    tag: String(input.tag || 'SEO软文').trim() || 'SEO软文',
    keywordsText: String(input.keywordsText || '').trim(),
    targetCount,
    intervalMinutes,
    runTime,
    autoPublish: true,
    active: input.active !== false,
    resetProgress: Boolean(input.resetProgress),
  };
}

function validateScheduleInput(input) {
  if (!input.name) throw new Error('请填写任务名称');
  if (!input.siteId) throw new Error('请选择站点');
  if (!input.targetCount || input.targetCount < 1) throw new Error('请填写发送数量');
}

async function listSchedules(userId) {
  if (storageMode === 'mysql') {
    const rows = await mysqlRows('SELECT * FROM schedules WHERE user_id = ? ORDER BY id DESC', [Number(userId)]);
    return rows.map(rowToSchedule);
  }
  const db = await loadJsonDb();
  return db.schedules.filter((item) => Number(item.userId) === Number(userId)).map((item, index) => normalizeScheduleRecord(item, userId, index));
}

async function getScheduleById(id, userId) {
  const scheduleId = Number(id);
  const ownerId = Number(userId);
  if (!scheduleId || !ownerId) return null;
  if (storageMode === 'mysql') {
    const [row] = await mysqlRows('SELECT * FROM schedules WHERE id = ? AND user_id = ? LIMIT 1', [scheduleId, ownerId]);
    return row ? rowToSchedule(row) : null;
  }
  const db = await loadJsonDb();
  const schedule = db.schedules.find((item) => Number(item.id) === scheduleId && Number(item.userId) === ownerId);
  return schedule ? normalizeScheduleRecord(schedule, ownerId, 0) : null;
}

async function saveSchedule(input, userId) {
  const payload = normalizeScheduleInput(input);
  validateScheduleInput(payload);
  const now = nowIso();
  const plannedNextRunAt = payload.active ? nextRunTimeIso(payload.runTime) : '';

  if (storageMode === 'mysql') {
    if (payload.id) {
      const existing = await getScheduleById(payload.id, userId);
      if (!existing) throw new Error('任务不存在');
      const generatedCount = payload.resetProgress ? 0 : existing.generatedCount;
      const nextKeywordIndex = payload.resetProgress ? 0 : existing.nextKeywordIndex;
      const active = payload.active && generatedCount < payload.targetCount;
      const nextRunAt = active ? plannedNextRunAt : '';
      const status = generatedCount >= payload.targetCount ? SCHEDULE_STATUS.completed : (active ? SCHEDULE_STATUS.running : SCHEDULE_STATUS.paused);
      await mysqlRun(
        `UPDATE schedules
         SET name = ?, site_id = ?, tag = ?, keywords_text = ?, target_count = ?, generated_count = ?, next_keyword_index = ?,
             interval_minutes = ?, run_time = ?, auto_publish = ?, active = ?, status = ?, next_run_at = ?, updated_at = ?, last_error = ?
         WHERE id = ? AND user_id = ?`,
        [
          payload.name,
          payload.siteId,
          payload.tag,
          payload.keywordsText,
          payload.targetCount,
          generatedCount,
          nextKeywordIndex,
          payload.intervalMinutes,
          payload.runTime,
          payload.autoPublish ? 1 : 0,
          active ? 1 : 0,
          status,
          nextRunAt,
          now,
          payload.resetProgress ? '' : existing.lastError || '',
          payload.id,
          Number(userId),
        ],
      );
      return getScheduleById(payload.id, userId);
    }

    const result = await mysqlRun(
      `INSERT INTO schedules
       (user_id, name, site_id, tag, keywords_text, target_count, generated_count, next_keyword_index, interval_minutes, run_time, auto_publish, active, status, next_run_at, last_run_at, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, '', '', ?, ?)`,
      [
        Number(userId),
        payload.name,
        payload.siteId,
        payload.tag,
        payload.keywordsText,
        payload.targetCount,
        payload.intervalMinutes,
        payload.runTime,
        payload.autoPublish ? 1 : 0,
        payload.active ? 1 : 0,
        payload.active ? SCHEDULE_STATUS.running : SCHEDULE_STATUS.paused,
        plannedNextRunAt,
        now,
        now,
      ],
    );
    return getScheduleById(result.insertId, userId);
  }

  const db = await loadJsonDb();
  if (payload.id) {
    const existing = db.schedules.find((item) => Number(item.id) === payload.id && Number(item.userId) === Number(userId));
    if (!existing) throw new Error('任务不存在');
    const generatedCount = payload.resetProgress ? 0 : existing.generatedCount;
    const nextKeywordIndex = payload.resetProgress ? 0 : existing.nextKeywordIndex;
    const active = payload.active && generatedCount < payload.targetCount;
    existing.name = payload.name;
    existing.siteId = payload.siteId;
    existing.tag = payload.tag;
    existing.keywordsText = payload.keywordsText;
    existing.targetCount = payload.targetCount;
    existing.generatedCount = generatedCount;
    existing.nextKeywordIndex = nextKeywordIndex;
    existing.intervalMinutes = payload.intervalMinutes;
    existing.runTime = payload.runTime;
    existing.autoPublish = payload.autoPublish;
    existing.active = active;
    existing.status = generatedCount >= payload.targetCount ? SCHEDULE_STATUS.completed : (active ? SCHEDULE_STATUS.running : SCHEDULE_STATUS.paused);
    existing.nextRunAt = active ? plannedNextRunAt : '';
    existing.lastError = payload.resetProgress ? '' : existing.lastError || '';
    existing.updatedAt = now;
    await saveJsonDb(db);
    return normalizeScheduleRecord(existing, userId, 0);
  }

  const created = normalizeScheduleRecord({
    id: nextId(db.schedules),
    userId: Number(userId),
    name: payload.name,
    siteId: payload.siteId,
    tag: payload.tag,
    keywordsText: payload.keywordsText,
    targetCount: payload.targetCount,
    generatedCount: 0,
    nextKeywordIndex: 0,
    intervalMinutes: payload.intervalMinutes,
    runTime: payload.runTime,
    autoPublish: payload.autoPublish,
    active: payload.active,
    status: payload.active ? SCHEDULE_STATUS.running : SCHEDULE_STATUS.paused,
    nextRunAt: plannedNextRunAt,
    lastRunAt: '',
    lastError: '',
    createdAt: now,
    updatedAt: now,
  }, userId, db.schedules.length);
  db.schedules.unshift(created);
  await saveJsonDb(db);
  return created;
}

async function updateScheduleState(id, userId, patch) {
  const schedule = await getScheduleById(id, userId);
  if (!schedule) throw new Error('任务不存在');
  const next = { ...schedule, ...patch, updatedAt: nowIso() };
  next.status = normalizeScheduleStatus(next.status, next.active, next.generatedCount, next.targetCount);
  if (!next.active && next.status === SCHEDULE_STATUS.running) next.status = SCHEDULE_STATUS.paused;
  if (next.generatedCount >= next.targetCount) {
    next.status = SCHEDULE_STATUS.completed;
    next.active = false;
    next.nextRunAt = '';
  }

  if (storageMode === 'mysql') {
    await mysqlRun(
      `UPDATE schedules
       SET generated_count = ?, next_keyword_index = ?, active = ?, status = ?, next_run_at = ?, last_run_at = ?, last_error = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        next.generatedCount,
        next.nextKeywordIndex,
        next.active ? 1 : 0,
        next.status,
        next.nextRunAt || '',
        next.lastRunAt || '',
        next.lastError || '',
        next.updatedAt,
        Number(id),
        Number(userId),
      ],
    );
    return getScheduleById(id, userId);
  }

  const db = await loadJsonDb();
  const existing = db.schedules.find((item) => Number(item.id) === Number(id) && Number(item.userId) === Number(userId));
  if (!existing) throw new Error('任务不存在');
  Object.assign(existing, next);
  await saveJsonDb(db);
  return normalizeScheduleRecord(existing, userId, 0);
}

async function deleteSchedule(id, userId) {
  if (storageMode === 'mysql') {
    await mysqlRun('DELETE FROM schedules WHERE id = ? AND user_id = ?', [Number(id), Number(userId)]);
    return;
  }
  const db = await loadJsonDb();
  db.schedules = db.schedules.filter((item) => Number(item.id) !== Number(id) || Number(item.userId) !== Number(userId));
  await saveJsonDb(db);
}

async function runScheduleOnce(id, userId) {
  const schedule = await getScheduleById(id, userId);
  if (!schedule) throw new Error('任务不存在');
  return executeSchedule(schedule, { manual: true });
}

async function executeSchedule(schedule, options = {}) {
  const scheduleId = Number(schedule.id);
  const shouldLock = !options.skipLock;
  if (!scheduleId || (shouldLock && runningSchedules.has(scheduleId))) return null;
  if (shouldLock) runningSchedules.add(scheduleId);

  try {
    let latest = await getScheduleById(scheduleId, schedule.userId);
    if (!latest) return null;
    if (!options.manual && (!latest.active || latest.status === SCHEDULE_STATUS.completed)) return latest;

    let sentCount = 0;
    let updated = latest;
    const remainingCount = Math.max(0, Number(latest.targetCount || 1) - Number(latest.generatedCount || 0));
    if (remainingCount <= 0) {
      return updateScheduleState(scheduleId, latest.userId, {
        active: false,
        status: SCHEDULE_STATUS.completed,
        nextRunAt: '',
        lastRunAt: nowIso(),
        lastError: '',
      });
    }
    const maxSendCount = options.manual ? 1 : Math.min(remainingCount, 500);

    while (sentCount < maxSendCount) {
      latest = await getScheduleById(scheduleId, schedule.userId);
      if (!latest) return updated;
      if (options.manual && sentCount >= 1) break;
      if (Number(latest.generatedCount || 0) >= Number(latest.targetCount || 1)) break;

      const [article] = await listPendingArticlesForSchedule(latest);
      if (!article) break;

      const claimed = await claimArticleForSending(article, latest.userId);
      if (!claimed) continue;
      let published;
      try {
        published = await publishArticleByRecord(claimed, latest.userId);
      } catch (error) {
        await markArticleFailed(claimed, error.message || '发送失败');
        await addLog(`定时发送失败：${claimed.title}`, latest.name, LOG_RESULT.failed, latest.userId).catch(() => {});
        throw error;
      }
      sentCount += 1;
      updated = await updateScheduleState(scheduleId, latest.userId, {
        generatedCount: Number(latest.generatedCount || 0) + 1,
        nextKeywordIndex: Number(latest.nextKeywordIndex || 0) + 1,
        active: latest.active,
        status: latest.active ? SCHEDULE_STATUS.running : SCHEDULE_STATUS.paused,
        nextRunAt: latest.active ? nextRunTimeIso(latest.runTime, new Date(Date.now() + 1000)) : '',
        lastRunAt: nowIso(),
        lastError: '',
      });

      const db = await getDb(latest.userId);
      const site = db.sites.find((item) => Number(item.id) === Number(latest.siteId));
      await addLog(`定时发送文章：${published.title}`, site?.name || latest.name, LOG_RESULT.success, latest.userId);
    }

    if (!sentCount) {
      return updateScheduleState(scheduleId, latest.userId, {
        active: latest.active,
        status: latest.active ? SCHEDULE_STATUS.running : SCHEDULE_STATUS.paused,
        nextRunAt: latest.active ? nextRunTimeIso(latest.runTime, new Date(Date.now() + 1000)) : '',
        lastRunAt: nowIso(),
        lastError: '',
      });
    }

    await addLog(
      options.manual ? `手动发送文章：${sentCount} 篇` : `定时发送完成：${sentCount} 篇`,
      latest.name,
      LOG_RESULT.success,
      latest.userId,
    ).catch(() => {});

    return updated;
  } catch (error) {
    const failed = await updateScheduleState(schedule.id, schedule.userId, {
      active: false,
      status: SCHEDULE_STATUS.error,
      nextRunAt: '',
      lastRunAt: nowIso(),
      lastError: error.message || String(error),
    }).catch(() => null);
    await addLog(`计划任务失败：${schedule.name}`, `任务 #${schedule.id}`, LOG_RESULT.failed, schedule.userId).catch(() => {});
    return failed;
  } finally {
    if (shouldLock) runningSchedules.delete(scheduleId);
  }
}

async function loadDueSchedules() {
  if (storageMode === 'mysql') {
    const rows = await mysqlRows(
      `SELECT * FROM schedules
       WHERE active = 1
         AND status IN (?, ?)
         AND next_run_at <> ''
         AND next_run_at <= ?
       ORDER BY id ASC`,
      [SCHEDULE_STATUS.running, SCHEDULE_STATUS.paused, nowIso()],
    );
    return rows.map(rowToSchedule);
  }

  const db = await loadJsonDb();
  const now = nowIso();
  return db.schedules
    .map((item, index) => normalizeScheduleRecord(item, item.userId, index))
    .filter((item) => item.active && item.nextRunAt && item.nextRunAt <= now && item.status !== SCHEDULE_STATUS.completed);
}

async function scheduleLoop() {
  if (scheduleLoopBusy) return;
  scheduleLoopBusy = true;
  try {
    const dueSchedules = await loadDueSchedules();
    for (const schedule of dueSchedules) {
      // eslint-disable-next-line no-await-in-loop
      await executeSchedule(schedule);
    }
  } finally {
    scheduleLoopBusy = false;
  }
}

function startScheduleLoop() {
  if (scheduleTimer) return;
  scheduleTimer = setInterval(() => {
    scheduleLoop().catch(() => {});
  }, schedulePollMs);
}

function stopScheduleLoop() {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = null;
}

async function serveApp(req, res, pathname) {
  if (!existsSync(distDir)) return notFound(req, res);
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const assetPath = path.join(distDir, safePath);
  try {
    const fileInfo = await stat(assetPath);
    if (fileInfo.isFile()) {
      return staticFileResponse(req, res, assetPath, contentTypeForExt(path.extname(assetPath)));
    }
  } catch {
    // ignore and fall back to SPA entry
  }
  return staticFileResponse(req, res, path.join(distDir, 'index.html'), 'text/html; charset=utf-8');
}

async function handleApi(req, res) {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'OPTIONS') return jsonResponse(req, res, 204, {});

  if (req.method === 'GET' && pathname === '/api/health') {
    return jsonResponse(req, res, 200, { ok: true, storage: storageMode, schedulePollMs });
  }

  const imageViewMatch = pathname.match(/^\/api\/image\/(\d+)(?:\/[^/]+)?$/);
  if ((req.method === 'GET' || req.method === 'HEAD') && imageViewMatch) {
    const images = await loadImageDb();
    const image = images.find((item) => Number(item.id) === Number(imageViewMatch[1]));
    if (!image) return notFound(req, res);
    return staticFileResponse(req, res, path.join(uploadDir, image.filename), image.mime || contentTypeForExt(path.extname(image.filename)));
  }

  if (req.method === 'GET' && pathname === '/api/public/branding') {
    return jsonResponse(req, res, 200, { branding: publicBranding(await loadBranding()) });
  }

  if (req.method === 'GET' && pathname === '/api/public/ads') {
    return jsonResponse(req, res, 200, { ads: await publicAds() });
  }

  if (req.method === 'GET' && pathname === '/api/public/payment') {
    return jsonResponse(req, res, 200, { payment: publicPaymentConfig(await loadPaymentSettings()) });
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/api/branding/logo') {
    return serveBrandingLogo(req, res);
  }

  if ((req.method === 'GET' || req.method === 'POST') && pathname === '/api/payment/notify') {
    try {
      const params = req.method === 'POST' ? await readPaymentParams(req) : Object.fromEntries(url.searchParams.entries());
      await handlePaymentNotify(params);
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end('success');
    } catch (error) {
      console.error('Payment notify failed:', error.message);
      res.writeHead(400, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end('fail');
    }
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const user = await registerUser(await readBody(req));
    await touchUserLogin(user.id);
    const token = createSession(user);
    return jsonResponse(req, res, 201, { user: sanitizeUser(user) }, { 'Set-Cookie': makeAuthCookie(token) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    let user = null;
    try {
      user = await authenticateUser(body.username, body.password);
    } catch (error) {
      return unauthorized(req, res, error.message);
    }
    if (!user) return unauthorized(req, res, '用户名或密码错误');
    await touchUserLogin(user.id);
    const token = createSession(user);
    return jsonResponse(req, res, 200, { user: sanitizeUser(user) }, { 'Set-Cookie': makeAuthCookie(token) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    clearSession(req);
    return jsonResponse(req, res, 200, { ok: true }, { 'Set-Cookie': makeAuthCookie('', 0) });
  }

  const sessionUser = getSessionUser(req);
  const currentUser = sessionUser ? await getUserById(sessionUser.userId) : null;
  if (currentUser?.status === 'disabled') {
    clearSession(req);
    return unauthorized(req, res, '账号已被禁用，请联系管理员');
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    if (!currentUser) return unauthorized(req, res);
    return jsonResponse(req, res, 200, { user: sanitizeUser(currentUser), storage: storageMode });
  }

  if (!currentUser) return unauthorized(req, res);

  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    const db = sanitizeDb(await getDb(currentUser.id));
    return jsonResponse(req, res, 200, {
      ...db,
      images: await listPublicImages(req, currentUser.id),
      branding: publicBranding(await loadBranding()),
      ads: isAdminUser(currentUser) ? await loadAds() : await publicAds(),
      payment: isAdminUser(currentUser) ? publicPaymentSettings(await loadPaymentSettings()) : publicPaymentConfig(await loadPaymentSettings()),
      paymentOrders: await listPaymentOrders(currentUser),
      members: isAdminUser(currentUser) ? await listMembers() : [],
      user: sanitizeUser(currentUser),
      storage: storageMode,
    });
  }

  if (req.method === 'POST' && pathname === '/api/settings/llm') {
    const user = await saveUserModelConfig(currentUser.id, await readBody(req));
    return jsonResponse(req, res, 200, { user: sanitizeUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/settings/llm/models') {
    const result = await fetchSupportedModels(currentUser, await readBody(req));
    return jsonResponse(req, res, 200, result);
  }

  if (req.method === 'POST' && pathname === '/api/account/profile') {
    const user = await saveAccountProfile(currentUser.id, await readBody(req));
    return jsonResponse(req, res, 200, { user: sanitizeUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/account/password') {
    const user = await changeUserPassword(currentUser.id, await readBody(req));
    clearSession(req);
    const token = createSession(user);
    return jsonResponse(req, res, 200, { user: sanitizeUser(user) }, { 'Set-Cookie': makeAuthCookie(token) });
  }

  if (req.method === 'POST' && pathname === '/api/settings/mail') {
    const user = await saveMailSettings(currentUser.id, await readBody(req));
    return jsonResponse(req, res, 200, { user: sanitizeUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/settings/mail/test') {
    if (!isAdminUser(currentUser)) throw new Error('只有管理员可以发送测试邮件');
    const body = await readBody(req);
    const to = normalizeEmail(body.to || currentUser.email || '');
    if (!to) throw new Error('请先填写测试收件邮箱');
    const admin = await getUserById(currentUser.id);
    await sendMailWithAdminConfig(admin, {
      to,
      subject: 'AIGOU 邮件通知测试',
      text: '这是一封 AIGOU 智能发布后台的测试邮件。收到此邮件说明 SMTP 配置可用。',
      html: '<p>这是一封 <strong>AIGOU 智能发布后台</strong> 的测试邮件。收到此邮件说明 SMTP 配置可用。</p>',
    });
    return jsonResponse(req, res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/settings/payment') {
    if (!isAdminUser(currentUser)) return jsonResponse(req, res, 403, { error: '只有管理员可以配置易支付' });
    const payment = await saveAdminPaymentSettings(await readBody(req));
    await addLog('更新易支付收款配置', '系统设置', LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 200, { payment: publicPaymentSettings(payment) });
  }

  if (req.method === 'GET' && pathname === '/api/payment/orders') {
    return jsonResponse(req, res, 200, { orders: await listPaymentOrders(currentUser) });
  }

  if (req.method === 'POST' && pathname === '/api/payment/recharge') {
    const result = await createRechargeOrder(req, currentUser, await readBody(req));
    return jsonResponse(req, res, 201, result);
  }

  if (req.method === 'GET' && pathname === '/api/admin/members') {
    if (!isAdminUser(currentUser)) return jsonResponse(req, res, 403, { error: '只有管理员可以管理会员' });
    return jsonResponse(req, res, 200, { members: await listMembers() });
  }

  if (req.method === 'POST' && pathname === '/api/admin/members') {
    if (!isAdminUser(currentUser)) return jsonResponse(req, res, 403, { error: '只有管理员可以新增会员' });
    const member = await adminCreateMember(await readBody(req));
    await addLog(`新增会员：${member.username}`, '会员管理', LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 201, { member, members: await listMembers() });
  }

  const memberManageMatch = pathname.match(/^\/api\/admin\/members\/(\d+)$/);
  if (req.method === 'PATCH' && memberManageMatch) {
    if (!isAdminUser(currentUser)) return jsonResponse(req, res, 403, { error: '只有管理员可以修改会员' });
    const member = await adminUpdateMember(Number(memberManageMatch[1]), await readBody(req), currentUser.id);
    await addLog(`更新会员：${member.username}`, '会员管理', LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 200, { member, members: await listMembers() });
  }

  if (req.method === 'DELETE' && memberManageMatch) {
    if (!isAdminUser(currentUser)) return jsonResponse(req, res, 403, { error: '只有管理员可以删除会员' });
    await adminDeleteMember(Number(memberManageMatch[1]), currentUser.id);
    await addLog(`删除会员 #${memberManageMatch[1]}`, '会员管理', LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 200, { ok: true, members: await listMembers() });
  }

  const memberPasswordMatch = pathname.match(/^\/api\/admin\/members\/(\d+)\/password$/);
  if (req.method === 'POST' && memberPasswordMatch) {
    if (!isAdminUser(currentUser)) return jsonResponse(req, res, 403, { error: '只有管理员可以重置会员密码' });
    const member = await adminResetMemberPassword(Number(memberPasswordMatch[1]), await readBody(req), currentUser.id);
    await addLog(`重置会员密码：${member.username}`, '会员管理', LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 200, { member, members: await listMembers() });
  }

  if (req.method === 'POST' && pathname === '/api/settings/branding') {
    if (!isAdminUser(currentUser)) throw new Error('只有管理员可以修改网站品牌');
    const current = await loadBranding();
    const branding = await saveBranding({ ...current, ...(await readBody(req)), logoUrl: current.logoUrl });
    return jsonResponse(req, res, 200, { branding: publicBranding(branding) });
  }

  if (req.method === 'POST' && pathname === '/api/settings/branding/logo') {
    if (!isAdminUser(currentUser)) throw new Error('只有管理员可以更换 Logo');
    const branding = await saveBrandingLogo(req);
    return jsonResponse(req, res, 200, { branding: publicBranding(branding) });
  }

  if (req.method === 'POST' && pathname === '/api/settings/ads') {
    if (!isAdminUser(currentUser)) return jsonResponse(req, res, 403, { error: '只有管理员可以管理广告位' });
    try {
      const ad = await saveAd(await readBody(req));
      return jsonResponse(req, res, 200, { ad, ads: await loadAds() });
    } catch (error) {
      return jsonResponse(req, res, 400, { error: error.message });
    }
  }

  const adDeleteMatch = pathname.match(/^\/api\/settings\/ads\/(\d+)$/);
  if (req.method === 'DELETE' && adDeleteMatch) {
    if (!isAdminUser(currentUser)) return jsonResponse(req, res, 403, { error: '只有管理员可以删除广告位' });
    try {
      await deleteAd(Number(adDeleteMatch[1]));
      return jsonResponse(req, res, 200, { ok: true, ads: await loadAds() });
    } catch (error) {
      return jsonResponse(req, res, 400, { error: error.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/sites') {
    const site = await createSite(await readBody(req), currentUser.id);
    return jsonResponse(req, res, 201, { site: sanitizeSite(site) });
  }

  if (req.method === 'POST' && pathname === '/api/sites/connect') {
    const site = await createSite(await readBody(req), currentUser.id);
    await addLog(`接入站点：${site.name}`, site.name, LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 201, { site: sanitizeSite(site) });
  }

  const siteDeleteMatch = pathname.match(/^\/api\/sites\/(\d+)$/);
  if (req.method === 'DELETE' && siteDeleteMatch) {
    const site = await deleteSite(Number(siteDeleteMatch[1]), currentUser.id);
    if (site) await addLog(`删除站点：${site.name}`, site.name, LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 200, { ok: true });
  }

  const siteSyncMatch = pathname.match(/^\/api\/sites\/(\d+)\/sync$/);
  if (req.method === 'POST' && siteSyncMatch) {
    const site = await updateSiteSync(Number(siteSyncMatch[1]), currentUser.id);
    if (!site) return badRequest(req, res, '站点不存在');
    await addLog(`站点联通校验：${site.name}`, site.name, LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 200, { site: sanitizeSite(site) });
  }

  if (req.method === 'POST' && pathname === '/api/articles/generate') {
    const result = await createArticles(await readBody(req), { req }, currentUser);
    const first = result.articles[0];
    const db = await getDb(currentUser.id);
    const site = db.sites.find((item) => Number(item.id) === Number(first.siteId));
    await addLog(
      result.summary.requestedCount > 1
        ? `顺序生成文章 ${result.summary.successCount}/${result.summary.requestedCount} 篇`
        : `生成文章：${first.title}`,
      site?.name || '未知站点',
      result.errors.length ? LOG_RESULT.failed : LOG_RESULT.success,
      currentUser.id,
    );
    return jsonResponse(req, res, 201, {
      article: result.articles[0],
      articles: result.articles,
      errors: result.errors,
      summary: result.summary,
    });
  }

  if (req.method === 'POST' && pathname === '/api/articles/batch-delete') {
    const deleted = await deleteArticles((await readBody(req)).ids, currentUser.id);
    await addLog('批量删除文章', `${deleted} 篇文章`, LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 200, { ok: true, deleted });
  }

  const articleDeleteMatch = pathname.match(/^\/api\/articles\/(\d+)$/);
  if (req.method === 'DELETE' && articleDeleteMatch) {
    const deleted = await deleteArticles([Number(articleDeleteMatch[1])], currentUser.id);
    if (!deleted) return badRequest(req, res, '文章不存在');
    await addLog('删除文章', `文章 #${articleDeleteMatch[1]}`, LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 200, { ok: true, deleted });
  }

  const articlePublishMatch = pathname.match(/^\/api\/articles\/(\d+)\/publish$/);
  if (req.method === 'POST' && articlePublishMatch) {
    try {
      return jsonResponse(req, res, 200, {
        article: await publishArticle(Number(articlePublishMatch[1]), currentUser.id),
      });
    } catch (error) {
      return badRequest(req, res, error.message);
    }
  }

  if (req.method === 'GET' && pathname === '/api/anchors') {
    return jsonResponse(req, res, 200, { anchors: await listAnchors(requestUrl.searchParams.get('siteId'), currentUser.id) });
  }

  if (req.method === 'POST' && pathname === '/api/anchors') {
    const anchor = await saveAnchor(await readBody(req), currentUser.id);
    await addLog('保存关键词锚文本', `站点 ${anchor.siteId}`, LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 201, { anchor });
  }

  const anchorDeleteMatch = pathname.match(/^\/api\/anchors\/(\d+)$/);
  if (req.method === 'DELETE' && anchorDeleteMatch) {
    await deleteAnchor(Number(anchorDeleteMatch[1]), currentUser.id);
    return jsonResponse(req, res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/forbidden-words') {
    return jsonResponse(req, res, 200, { forbiddenWords: await listForbiddenWords(currentUser.id) });
  }

  if (req.method === 'GET' && pathname === '/api/forbidden-words/template') {
    return jsonResponse(req, res, 200, { name: '违禁词', wordsText: defaultForbiddenWordsText });
  }

  if (req.method === 'POST' && pathname === '/api/forbidden-words') {
    const item = await saveForbiddenWords(await readBody(req), currentUser.id);
    await addLog(`保存违禁词：${item.name}`, '违禁词管理', LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 201, { item });
  }

  const forbiddenDeleteMatch = pathname.match(/^\/api\/forbidden-words\/(\d+)$/);
  if (req.method === 'DELETE' && forbiddenDeleteMatch) {
    await deleteForbiddenWords(Number(forbiddenDeleteMatch[1]), currentUser.id);
    await addLog('删除违禁词分类', `分类 #${forbiddenDeleteMatch[1]}`, LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/images') {
    return jsonResponse(req, res, 200, { images: await listPublicImages(req, currentUser.id) });
  }

  if (req.method === 'POST' && pathname === '/api/images') {
    const images = await uploadImages(req, currentUser.id);
    await addLog('上传图片素材', `${images.length} 张图片`, LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 201, {
      images: images.map((image) => publicImageRecord(req, image)),
      image: images[0] ? publicImageRecord(req, images[0]) : null,
    });
  }

  if (req.method === 'POST' && pathname === '/api/images/batch-delete') {
    const deleted = await deleteImages((await readBody(req)).ids, currentUser.id);
    await addLog('批量删除图片素材', `${deleted} 张图片`, LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 200, { ok: true, deleted });
  }

  const imageDeleteMatch = pathname.match(/^\/api\/images\/(\d+)$/);
  if (req.method === 'DELETE' && imageDeleteMatch) {
    await deleteImage(Number(imageDeleteMatch[1]), currentUser.id);
    return jsonResponse(req, res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/pboot/token') {
    return jsonResponse(req, res, 200, { token: createInstallToken() });
  }

  if (req.method === 'POST' && pathname === '/api/pboot/categories') {
    return jsonResponse(req, res, 200, { categories: await fetchPbootCategories(await readBody(req), currentUser.id) });
  }

  if (req.method === 'GET' && pathname === '/api/pboot/bridge-download') {
    const token = await resolvePbootBridgeToken({
      token: requestUrl.searchParams.get('token'),
      siteId: requestUrl.searchParams.get('siteId'),
    }, currentUser.id);
    return fileResponse(req, res, 'aigou-publish.php', await createPbootBridgePhp(token), 'application/x-httpd-php; charset=utf-8');
  }

  if (req.method === 'GET' && pathname === '/api/schedules') {
    return jsonResponse(req, res, 200, { schedules: (await listSchedules(currentUser.id)).map(sanitizeSchedule) });
  }

  if (req.method === 'POST' && pathname === '/api/schedules') {
    const schedule = await saveSchedule(await readBody(req), currentUser.id);
    await addLog(`保存定时任务：${schedule.name}`, schedule.name, LOG_RESULT.success, currentUser.id);
    return jsonResponse(req, res, 201, { schedule: sanitizeSchedule(schedule) });
  }

  const scheduleDeleteMatch = pathname.match(/^\/api\/schedules\/(\d+)$/);
  if (req.method === 'DELETE' && scheduleDeleteMatch) {
    await deleteSchedule(Number(scheduleDeleteMatch[1]), currentUser.id);
    return jsonResponse(req, res, 200, { ok: true });
  }

  const scheduleRunMatch = pathname.match(/^\/api\/schedules\/(\d+)\/run$/);
  if (req.method === 'POST' && scheduleRunMatch) {
    const schedule = await runScheduleOnce(Number(scheduleRunMatch[1]), currentUser.id);
    return jsonResponse(req, res, 200, { schedule: sanitizeSchedule(schedule) });
  }

  const scheduleToggleMatch = pathname.match(/^\/api\/schedules\/(\d+)\/toggle$/);
  if (req.method === 'POST' && scheduleToggleMatch) {
    const body = await readBody(req);
    const schedule = await updateScheduleState(Number(scheduleToggleMatch[1]), currentUser.id, {
      active: body.active !== false,
      status: body.active === false ? SCHEDULE_STATUS.paused : SCHEDULE_STATUS.running,
      nextRunAt: body.active === false ? '' : nextRunTimeIso((await getScheduleById(Number(scheduleToggleMatch[1]), currentUser.id))?.runTime || '09:00'),
      lastError: body.active === false ? '' : body.lastError || '',
    });
    return jsonResponse(req, res, 200, { schedule: sanitizeSchedule(schedule) });
  }

  return notFound(req, res);
}

export function createApiServer() {
  startScheduleLoop();
  return createServer((req, res) => {
    const pathname = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`).pathname;
    if (pathname.startsWith('/api/')) {
      handleApi(req, res).catch((error) => {
        jsonResponse(req, res, 500, { error: error.message || '服务器内部错误' });
      });
      return;
    }

    serveApp(req, res, pathname).catch((error) => {
      jsonResponse(req, res, 500, { error: error.message || '静态资源加载失败' });
    });
  });
}

if (process.env.pm_id !== undefined || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
  const server = createApiServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`AIGOU API listening on http://127.0.0.1:${port}`);
    console.log(`Storage mode: ${storageMode}`);
    console.log(`Schedule poll: ${schedulePollMs}ms`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log('Default admin password is Admin@123456. Please change ADMIN_PASSWORD in production.');
    }
  });
  const shutdown = () => {
    stopScheduleLoop();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
