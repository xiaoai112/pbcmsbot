/*! 版权所有：1330600100。二次开发与定制合作请联系 QQ。 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Cpu,
  Eye,
  FileText,
  Globe2,
  Image,
  CreditCard,
  Link2,
  ListChecks,
  Loader2,
  LogIn,
  LogOut,
  PauseCircle,
  PlayCircle,
  Plus,
  RadioTower,
  Repeat2,
  Save,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2,
  UploadCloud,
  UserPlus,
  Users,
  X,
  Ban,
} from 'lucide-react';
import './styles.css';

const navItems = [
  { icon: Link2, label: '站点管理', view: 'sites', hint: '站点、桥接、锚文本与统计' },
  { icon: Sparkles, label: '文章生成', view: 'generator', hint: '按关键词逐篇生成内容' },
  { icon: FileText, label: '我的文章', view: 'articles', hint: '集中管理草稿与已发文章' },
  { icon: Clock3, label: '定时发送', view: 'schedules', hint: '按时间批量派发文章' },
  { icon: Globe2, label: '发布日志', view: 'logs', hint: '查看发送回执与执行轨迹' },
  { icon: Image, label: '图片管理', view: 'images', hint: '上传、筛选与批量清理配图' },
  { icon: Ban, label: '违禁词管理', view: 'forbidden', hint: '替换高风险表述与模板词' },
  { icon: CreditCard, label: '在线充值', view: 'recharge', hint: '会员套餐、支付订单与有效期' },
  { icon: Users, label: '会员管理', view: 'members', hint: '账号、状态、邮箱与密码' },
  { icon: Cpu, label: '系统设置', view: 'settings', hint: '模型、账号、品牌与广告位' },
];

function ModalLayer({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}

const viewMeta = {
  sites: {
    eyebrow: '发布资产',
    title: '站点管理',
    description: '统一管理目标站、桥接接口、锚文本和站点发布情况。',
  },
  generator: {
    eyebrow: '内容生产',
    title: '文章生成',
    description: '按关键词逐篇生成文章，保留草稿后再进入发送流程。',
  },
  articles: {
    eyebrow: '内容库',
    title: '我的文章',
    description: '查看、筛选、删除和手动发送已经生成的文章内容。',
  },
  schedules: {
    eyebrow: '自动执行',
    title: '定时发送',
    description: '每天按设定时刻，从“我的文章”中抽取指定数量的待发文章。',
  },
  logs: {
    eyebrow: '执行回执',
    title: '发布日志',
    description: '快速定位成功、失败和异常中断的发布任务。',
  },
  images: {
    eyebrow: '素材中心',
    title: '图片管理',
    description: '批量上传配图，统一作为文章插图与封面素材池。',
  },
  forbidden: {
    eyebrow: '合规过滤',
    title: '违禁词管理',
    description: '在生成和发送前替换高风险词，降低广告法相关内容风险。',
  },
  recharge: {
    eyebrow: '会员服务',
    title: '在线充值',
    description: '选择会员套餐并通过易支付完成充值，支付成功后自动延长有效期。',
  },
  members: {
    eyebrow: '账号权限',
    title: '会员管理',
    description: '管理员统一维护会员账号、登录状态、邮箱和密码。',
  },
  settings: {
    eyebrow: '系统控制',
    title: '系统设置',
    description: '配置模型接口、通知邮箱、品牌信息和首页广告位。',
  },
};

const articleStatusMap = {
  draft: '待发送',
  sending: '发送中',
  published: '已发送',
  failed: '发送失败',
};

const siteStatusMap = {
  pending: '待配置接口',
  ready: '接口已配置',
};

const logResultMap = {
  success: '成功',
  failed: '失败',
};

const scheduleStatusMap = {
  paused: '已暂停',
  running: '运行中',
  completed: '已完成',
  error: '异常停止',
};

const defaultBranding = {
  siteName: 'AIGOU',
  subtitle: '智能发布后台',
  landingTitle: 'AIGOU 智能文章生成与自动发布后台',
  landingDescription: '面向 PbootCMS 站群和内容运营场景，把关键词生成、模型配置、图片素材、定时发布和多用户管理放到一个后台里。',
  logoUrl: '',
};

const emptyAdForm = {
  id: '',
  title: '',
  description: '',
  imageUrl: '',
  linkUrl: '',
  position: '首页横幅',
  sortOrder: 1,
  enabled: true,
};

function displayArticleStatus(value) {
  return articleStatusMap[value] || value || '-';
}

function displaySiteStatus(value) {
  return siteStatusMap[value] || value || '-';
}

function displayLogResult(value) {
  return logResultMap[value] || value || '-';
}

function displayScheduleStatus(value) {
  return scheduleStatusMap[value] || value || '-';
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || '请求失败，请稍后重试');
    error.status = response.status;
    throw error;
  }
  return data;
}

function normalizeDomain(value) {
  return String(value || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
}

function flattenCategories(categories = [], depth = 0) {
  return categories.flatMap((category) => [
    {
      id: String(category.id),
      name: `${'　'.repeat(depth)}${category.name}`,
      rawName: category.name,
    },
    ...flattenCategories(category.children || [], depth + 1),
  ]);
}

function parseKeywordInput(value) {
  return [...new Set(
    String(value || '')
      .split(/[\n,，]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function displayMembership(user) {
  const membership = user?.membership || {};
  if (user?.isAdmin) return '管理员账号';
  if (!membership.expiresAt) return '未开通会员';
  return `${membership.label || '会员'} · 到期 ${formatDateTime(membership.expiresAt)}`;
}

function displayOrderStatus(order) {
  return order?.statusLabel || (order?.status === 'paid' ? '已支付' : '待支付');
}

function isSameDate(value, target) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth() && date.getDate() === target.getDate();
}

function isSameMonth(value, target) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
}

function statusClass(status) {
  return status === 'ready' ? 'state state--ok' : 'state state--warn';
}

function scheduleStatusClass(status) {
  return status === 'running' || status === 'completed' ? 'state state--ok' : 'state state--warn';
}

function BrandMark({ branding, className = 'brand-mark' }) {
  const name = branding?.siteName || defaultBranding.siteName;
  return (
    <div className={className}>
      {branding?.logoUrl ? <img src={branding.logoUrl} alt={name} /> : name.slice(0, 2)}
    </div>
  );
}

function CopyrightNotice({ compact = false }) {
  return (
    <footer className={compact ? 'copyright-notice copyright-notice--compact' : 'copyright-notice'}>
      版权所有：1330600100。二次开发与定制合作请联系 QQ。
    </footer>
  );
}

function safeAdUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

function LandingAds({ ads = [] }) {
  const visibleAds = ads.filter((ad) => ad.enabled !== false && (ad.title || ad.description || ad.imageUrl));
  if (!visibleAds.length) return null;

  return (
    <section className="landing-ads" aria-label="首页广告位">
      {visibleAds.map((ad) => {
        const imageUrl = safeAdUrl(ad.imageUrl);
        const linkUrl = safeAdUrl(ad.linkUrl);
        const content = (
          <>
            {imageUrl && <img src={imageUrl} alt={ad.title || '广告'} />}
            <div>
              <span>{ad.position || '推荐'}</span>
              {ad.title && <strong>{ad.title}</strong>}
              {ad.description && <p>{ad.description}</p>}
            </div>
          </>
        );
        return linkUrl ? (
          <a className="landing-ad-card" href={linkUrl} target="_blank" rel="noreferrer" key={ad.id}>
            {content}
          </a>
        ) : (
          <article className="landing-ad-card" key={ad.id}>{content}</article>
        );
      })}
    </section>
  );
}

function Sidebar({ activeView, onChange, branding, user }) {
  const visibleNavItems = navItems.filter((item) => item.view !== 'members' || user?.isAdmin);
  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark branding={branding} />
        <div>
          <strong>{branding?.siteName || defaultBranding.siteName}</strong>
          <span>{branding?.subtitle || defaultBranding.subtitle}</span>
        </div>
      </div>
      <nav className="nav-list">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={`nav-item ${activeView === item.view ? 'nav-item--active' : ''}`}
              key={item.view}
              onClick={() => onChange(item.view)}
            >
              <Icon size={20} />
              <div>
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </div>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-note">
        <strong>发布工作台</strong>
        <span>从生成、审稿到定时发送，流程都留在一个后台里。</span>
      </div>
    </aside>
  );
}

function LoginView({ onAuthSuccess, initialMode = 'login', onBack, branding }) {
  const consolePoints = [
    '多用户独立数据空间',
    '从文章库中定时抽取发送',
    '支持读取模型列表与自由切换',
  ];
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!form.username.trim()) {
      setError('请输入用户名');
      return;
    }
    if (!form.password) {
      setError('请输入密码');
      return;
    }
    if (mode === 'register' && form.password !== form.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      await api(path, {
        method: 'POST',
        body: JSON.stringify({
          username: form.username,
          password: form.password,
        }),
      });
      await onAuthSuccess();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      {onBack && (
        <button className="login-back" type="button" onClick={onBack}>
          返回首页
        </button>
      )}
      <div className="login-stack">
        <form className="login-card" onSubmit={handleSubmit} autoComplete="off">
          <div className="login-card__intro">
            <BrandMark branding={branding} />
            <p>{branding?.siteName || defaultBranding.siteName} Console</p>
            <h1>{branding?.subtitle || defaultBranding.subtitle}</h1>
            <span>把内容生产、审核、素材管理和定时发布收进同一套后台，日常运营更稳。</span>
            <div className="login-metrics">
              <strong>多用户</strong>
              <strong>文章库派发</strong>
              <strong>模型可切换</strong>
            </div>
            <div className="login-points">
              {consolePoints.map((item) => (
                <div key={item}>
                  <CheckCircle2 size={16} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="login-card__form">
            <div className="login-form-title">
              <p>{mode === 'login' ? '账号登录' : '创建账号'}</p>
              <h2>{mode === 'login' ? '进入管理后台' : '注册新的使用账号'}</h2>
            </div>

            <div className="auth-switch">
              <button
                className={mode === 'login' ? 'auth-switch__item auth-switch__item--active' : 'auth-switch__item'}
                type="button"
                onClick={() => setMode('login')}
              >
                登录
              </button>
              <button
                className={mode === 'register' ? 'auth-switch__item auth-switch__item--active' : 'auth-switch__item'}
                type="button"
                onClick={() => setMode('register')}
              >
                注册
              </button>
            </div>

            <label>用户名</label>
            <input
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              placeholder="请输入用户名"
              autoComplete="off"
              autoFocus
            />

            <label>密码</label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder={mode === 'login' ? '请输入密码' : '至少 6 位'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />

            {mode === 'register' && (
              <>
                <label>确认密码</label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                  placeholder="请再次输入密码"
                  autoComplete="new-password"
                />
              </>
            )}

            <div className="auth-hint">
              {mode === 'login'
                ? '登录后可以管理自己的站点、文章、模型配置和图片素材。'
                : '注册成功后会自动登录，并拥有独立的数据空间。'}
            </div>
            {error && <p className="form-error">{error}</p>}

            <button className="primary-action" type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="spin" size={18} />
              ) : mode === 'login' ? (
                <ShieldAlert size={18} />
              ) : (
                <UserPlus size={18} />
              )}
              {mode === 'login' ? '登录后台' : '注册并进入'}
            </button>
          </div>
        </form>
        <CopyrightNotice compact />
      </div>
    </main>
  );
}

function LandingPage({ onLogin, onRegister, branding, ads }) {
  const highlights = [
    { value: '模型接入', label: '接口自定义', text: '填写 API 地址和 Key 后读取模型列表，按账号独立保存。' },
    { value: 'PbootCMS', label: '发布桥接', text: '站点接入、栏目同步、文章发送和图片落库放在同一条链路里。' },
    { value: '多账号', label: '独立空间', text: '每个账号都有自己的站点、文章、素材、邮箱和模型配置。' },
  ];
  const features = [
    { icon: Sparkles, title: '逐篇生成，不一口气灌满', text: '输入多个关键词后，系统会按顺序逐篇生成文章，生成到目标数量就停止。' },
    { icon: Clock3, title: '从文章库抽取定时发送', text: '定时任务不再现场生成，而是从“我的文章”里抽取指定数量的待发内容。' },
    { icon: Cpu, title: '模型读取与切换合在一起', text: '支持读取接口返回的模型列表，也保留手动填写自定义模型名称的方式。' },
    { icon: Image, title: '图片、违禁词、锚文本一起管', text: '发文前统一处理配图、合规替换和随机锚文本插入，减少人工补救。' },
  ];
  const consoleStats = [
    { label: '待生成关键词', value: '24', note: '按优先级排队' },
    { label: '文章库存', value: '128', note: '待发与已发分开管理' },
    { label: '今日发送计划', value: '09:00', note: '按任务自动执行' },
  ];

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <div className="landing-brand">
          <BrandMark branding={branding} />
          <div>
            <strong>{branding?.siteName || defaultBranding.siteName}</strong>
            <span>{branding?.subtitle || '智能文章发布系统'}</span>
          </div>
        </div>
        <nav>
          <a href="#features">功能</a>
          <a href="#workflow">流程</a>
          <a href="#deploy">上线</a>
        </nav>
        <button className="landing-login" type="button" onClick={onLogin}>
          <LogIn size={17} />
          登录
        </button>
      </header>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <span className="landing-kicker">内容发布工作台</span>
          <h1>{branding?.landingTitle || defaultBranding.landingTitle}</h1>
          <p>
            {branding?.landingDescription || defaultBranding.landingDescription}
          </p>
          <div className="landing-actions">
            <button className="primary-action" type="button" onClick={onRegister}>
              <UserPlus size={18} />
              注册使用
            </button>
            <button className="secondary-action" type="button" onClick={onLogin}>
              进入后台
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
        <div className="landing-console" aria-label={`${branding?.siteName || defaultBranding.siteName} dashboard preview`}>
          <div className="console-top">
            <span />
            <span />
            <span />
            <strong>运营总览</strong>
          </div>
          <div className="console-grid">
            {consoleStats.map((item) => (
              <div key={item.label}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
                <em>{item.note}</em>
              </div>
            ))}
          </div>
          <div className="console-flow">
            <span>关键词池</span>
            <ArrowRight size={16} />
            <span>我的文章</span>
            <ArrowRight size={16} />
            <span>定时任务</span>
          </div>
        </div>
      </section>

      <LandingAds ads={ads} />

      <section className="landing-strip">
        {highlights.map((item) => (
          <article key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <section className="landing-section" id="features">
        <div className="landing-section__heading">
          <span>核心能力</span>
          <h2>从生成到发布，一套后台闭环处理</h2>
        </div>
        <div className="landing-feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title}>
                <Icon size={24} />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landing-workflow" id="workflow">
        <div>
          <span>工作流程</span>
          <h2>配置一次，后续按任务稳定执行</h2>
          <p>先接入站点和模型，再批量生成文章；定时任务按每天固定时间从我的文章里逐篇发送。</p>
        </div>
        <ol>
          <li><strong>1</strong><span>添加 PbootCMS 站点和桥接接口</span></li>
          <li><strong>2</strong><span>填写大模型 API 地址、Key，读取模型列表</span></li>
          <li><strong>3</strong><span>输入关键词数量，逐篇生成并保存文章</span></li>
          <li><strong>4</strong><span>启动定时发送，自动完成发布日志记录</span></li>
        </ol>
      </section>

      <section className="landing-final" id="deploy">
        <h2>现在就进入后台配置你的发布系统</h2>
        <p>支持注册多账号，也可以直接使用管理员账号登录。</p>
        <button className="primary-action" type="button" onClick={onLogin}>
          <LogIn size={18} />
          登录后台
        </button>
      </section>
    </main>
  );
}

function PlaceholderView({ title, description }) {
  return (
    <section className="section-card placeholder-view">
      <Sparkles size={36} />
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

function DashboardStats({ sites, articles, logs, schedules }) {
  const configuredSites = sites.filter((site) => site.pbootApiUrl).length;
  const publishedArticles = articles.filter((article) => article.status === 'published').length;
  const runningSchedules = schedules.filter((schedule) => schedule.status === 'running').length;
  const stats = [
    { label: '站点总数', value: sites.length, hint: `${configuredSites} 个已配置发布接口` },
    { label: '文章总数', value: articles.length, hint: `${publishedArticles} 篇已发布` },
    { label: '定时任务', value: schedules.length, hint: runningSchedules ? `${runningSchedules} 个运行中` : '暂无运行中的任务' },
    { label: '发布日志', value: logs.length, hint: '保留最近 80 条执行记录' },
  ];

  return (
    <section className="stats-grid stats-grid--four">
      {stats.map((stat) => (
        <article className="stat-card" key={stat.label}>
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
          <em>{stat.hint}</em>
        </article>
      ))}
    </section>
  );
}

function buildSiteStats(site, articles = [], anchors = [], logs = []) {
  const siteId = Number(site.id);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const siteArticles = articles.filter((article) => Number(article.siteId) === siteId);
  const published = siteArticles.filter((article) => article.status === 'published');
  const siteAnchors = anchors.filter((anchor) => Number(anchor.siteId) === siteId);
  const siteLogs = logs.filter((log) => log.site === site.name);
  const lastPublished = published
    .map((article) => article.publishedAt || article.createdAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];

  return {
    totalArticles: siteArticles.length,
    draftCount: siteArticles.filter((article) => article.status === 'draft').length,
    failedCount: siteArticles.filter((article) => article.status === 'failed').length,
    today: published.filter((article) => isSameDate(article.publishedAt || article.createdAt, now)).length,
    yesterday: published.filter((article) => isSameDate(article.publishedAt || article.createdAt, yesterday)).length,
    thisMonth: published.filter((article) => isSameMonth(article.publishedAt || article.createdAt, now)).length,
    lastMonth: published.filter((article) => isSameMonth(article.publishedAt || article.createdAt, previousMonth)).length,
    cumulative: published.length,
    anchors: siteAnchors.length,
    enabledAnchors: siteAnchors.filter((anchor) => anchor.enabled !== false).length,
    baiduSubmit: siteLogs.filter((log) => log.result === 'success' && /百度|baidu/i.test(log.title || '')).length,
    bingSubmit: siteLogs.filter((log) => log.result === 'success' && /bing|必应/i.test(log.title || '')).length,
    lastPublished,
  };
}

function SiteManagement({ sites, articles, anchors, logs, onOpenAdd, onOpenEdit, onOpenBridge, onOpenAnchors, onOpenStats, onDelete, onSync }) {
  return (
    <section className="section-card">
      <div className="section-heading">
        <div>
          <p>站点管理</p>
          <h2>已接入站点</h2>
        </div>
        <button className="primary-action" onClick={onOpenAdd}>
          <Plus size={18} />
          添加站点
        </button>
      </div>

      <div className="site-table">
        <div className="site-row site-row--head">
          <span>编号</span>
          <span>站点名称</span>
          <span>通信状态</span>
          <span>CMS 类型</span>
          <span>发布接口</span>
          <span>发布统计</span>
          <span>操作</span>
        </div>
        {sites.map((site) => {
          const stats = buildSiteStats(site, articles, anchors, logs);
          return (
            <div className="site-row" key={site.id}>
              <span className="site-id">#{site.id}</span>
              <span>
                <button className="site-name-button" type="button" onClick={() => onOpenStats(site)}>
                  {site.name}
                </button>
                <em>{site.domain}</em>
              </span>
              <span className={statusClass(site.status)}>
                {site.status === 'ready' ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
                {displaySiteStatus(site.status)}
              </span>
              <span>
                <b className="cms-pill">{site.cms}</b>
              </span>
              <span>
                {site.pbootApiUrl ? <b className="api-pill api-pill--ok">已配置</b> : <b className="api-pill">未配置</b>}
                {site.hasPbootToken ? <em>Token 已保存</em> : <em>建议配置 Token</em>}
              </span>
              <span className="site-mini-stats">
                <b>已发 {stats.cumulative}</b>
                <em>今日 {stats.today} / 锚文本 {stats.enabledAnchors}</em>
              </span>
              <span className="row-actions">
                <button title="站点统计" onClick={() => onOpenStats(site)}>
                  <Eye size={16} />
                  统计
                </button>
                <button title="桥接安装" onClick={() => onOpenBridge(site)}>
                  <RadioTower size={16} />
                  桥接
                </button>
                <button title="锚文本管理" onClick={() => onOpenAnchors(site)}>
                  <Link2 size={16} />
                  锚文本
                </button>
                <button title="编辑站点" onClick={() => onOpenEdit(site)}>
                  <Settings size={16} />
                  配置
                </button>
                <button title="检测通信" onClick={() => onSync(site.id)}>
                  <ListChecks size={16} />
                  检测
                </button>
                <button className="danger-action" title="删除" onClick={() => onDelete(site.id)}>
                  <Trash2 size={16} />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {sites.length === 0 && <p className="empty-state">还没有站点，请先点击右上角“添加站点”。</p>}
    </section>
  );
}

function SiteStatsModal({ site, articles, anchors, logs, onClose, onOpenAnchors, onNavigate }) {
  const stats = useMemo(() => buildSiteStats(site, articles, anchors, logs), [site, articles, anchors, logs]);
  const statItems = [
    { label: '今日发布', value: stats.today },
    { label: '昨日发布', value: stats.yesterday },
    { label: '本月发布', value: stats.thisMonth },
    { label: '上个月发布', value: stats.lastMonth },
    { label: '累计发布', value: stats.cumulative },
    { label: '锚链接', value: `${stats.enabledAnchors}/${stats.anchors}` },
    { label: '百度提交', value: stats.baiduSubmit },
    { label: 'Bing 提交', value: stats.bingSubmit },
  ];

  function jump(view) {
    onClose();
    onNavigate(view);
  }

  function openAnchors() {
    onClose();
    onOpenAnchors(site);
  }

  return (
    <ModalLayer>
      <div className="modal-backdrop">
      <section className="modal modal--site-stats">
        <div className="modal-heading">
          <div className="site-stats-title">
            <div className="site-logo">{site.name?.slice(0, 1) || '站'}</div>
            <div>
              <p className="modal-kicker">站点发布统计</p>
              <h2>{site.name}</h2>
              <span>{site.domain}</span>
            </div>
          </div>
          <button type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="site-stats-grid">
          {statItems.map((item) => (
            <div className="site-stat-box" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="site-stats-summary">
          <div>
            <span>文章库存</span>
            <strong>{stats.totalArticles} 篇</strong>
            <em>待发 {stats.draftCount} 篇 / 失败 {stats.failedCount} 篇</em>
          </div>
          <div>
            <span>最近发布</span>
            <strong>{formatDateTime(stats.lastPublished)}</strong>
            <em>{site.pbootApiUrl ? '发布接口已配置' : '发布接口未配置'}</em>
          </div>
        </div>

        <div className="site-stats-actions">
          <button type="button" onClick={openAnchors}>
            <Link2 size={16} />
            锚链接设置
          </button>
          <button type="button" onClick={() => jump('forbidden')}>
            <Ban size={16} />
            关键词过滤设置
          </button>
          <button type="button" onClick={() => jump('logs')}>
            <Globe2 size={16} />
            发布日志
          </button>
          <button type="button" onClick={() => jump('schedules')}>
            <Clock3 size={16} />
            发布计划
          </button>
        </div>
      </section>
      </div>
    </ModalLayer>
  );
}

function BridgeWizard({ site, onClose, onSave }) {
  const [step, setStep] = useState(1);
  const [token, setToken] = useState(site.pbootToken || '');
  const [form, setForm] = useState({
    pbootApiUrl: site.pbootApiUrl || `https://${site.domain}/aigou-publish.php`,
    pbootCategoryId: site.pbootCategoryId || '',
    pbootCategoryName: site.pbootCategoryName || '',
  });
  const [categories, setCategories] = useState([]);
  const [loadingToken, setLoadingToken] = useState(!site.hasPbootToken);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [error, setError] = useState('');
  const categoryOptions = useMemo(() => flattenCategories(categories), [categories]);

  useEffect(() => {
    async function loadToken() {
      if (site.hasPbootToken) return;
      const data = await api('/api/pboot/token', { method: 'POST' });
      setToken(data.token);
      setLoadingToken(false);
    }
    loadToken().catch((apiError) => {
      setError(apiError.message);
      setLoadingToken(false);
    });
  }, [site.hasPbootToken]);

  async function loadCategories() {
    setError('');
    setLoadingCategories(true);
    try {
      const data = await api('/api/pboot/categories', {
        method: 'POST',
        body: JSON.stringify({
          siteId: site.id,
          pbootApiUrl: form.pbootApiUrl,
          pbootToken: token,
        }),
      });
      setCategories(data.categories || []);
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoadingCategories(false);
    }
  }

  function downloadBridge() {
    if (!token && !site.hasPbootToken) return;
    const params = new URLSearchParams({ siteId: String(site.id) });
    if (token) params.set('token', token);
    window.location.href = `/api/pboot/bridge-download?${params.toString()}`;
  }

  function chooseCategory(value) {
    const category = categoryOptions.find((item) => item.id === value);
    setForm({
      ...form,
      pbootCategoryId: value,
      pbootCategoryName: category?.rawName || '',
    });
  }

  async function saveConfig() {
    await onSave({
      ...site,
      pbootApiUrl: form.pbootApiUrl,
      pbootToken: token,
      pbootCategoryId: form.pbootCategoryId,
      pbootCategoryName: form.pbootCategoryName,
    });
    onClose();
  }

  return (
    <ModalLayer>
      <div className="modal-backdrop">
      <section className="modal modal--wizard">
        <div className="modal-heading">
          <h2>PbootCMS 桥接安装向导</h2>
          <button type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="wizard-steps">
          {['生成 Token', '上传桥接文件', '保存发布配置'].map((label, index) => (
            <button
              className={step === index + 1 ? 'wizard-step wizard-step--active' : 'wizard-step'}
              key={label}
              onClick={() => setStep(index + 1)}
            >
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>

        {step === 1 && (
          <div className="wizard-panel">
            <h3>1. 生成桥接 Token</h3>
            <p>系统会生成一串专用 Token，并在下载桥接文件时自动写入其中。</p>
            <label>桥接 Token</label>
            <div className="copy-row">
              <input value={loadingToken ? '正在生成...' : token || (site.hasPbootToken ? '已保存，下载时自动写入' : '')} readOnly />
              <button type="button" onClick={() => token && navigator.clipboard?.writeText(token)} disabled={!token}>复制</button>
            </div>
            <button className="primary-action wide-action" type="button" onClick={downloadBridge} disabled={!token && !site.hasPbootToken}>
              下载 aigou-publish.php
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-panel">
            <h3>2. 上传到站点根目录</h3>
            <p>把刚下载的桥接文件上传到 PbootCMS 站点根目录，默认访问地址如下：</p>
            <pre className="install-code">{`https://${site.domain}/aigou-publish.php`}</pre>
            <div className="wizard-note">上传后可以直接访问该地址。若返回 JSON 或 Token 校验提示，说明文件可用。</div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-panel">
            <h3>3. 保存发布配置</h3>
            <label>PbootCMS 发布接口地址</label>
            <input value={form.pbootApiUrl} onChange={(event) => setForm({ ...form, pbootApiUrl: event.target.value })} />

            <div className="label-row">
              <label>PbootCMS 发布栏目</label>
              <button type="button" onClick={loadCategories} disabled={loadingCategories}>
                {loadingCategories ? '读取中...' : '读取目标站栏目'}
              </button>
            </div>

            {categoryOptions.length > 0 ? (
              <select value={form.pbootCategoryId} onChange={(event) => chooseCategory(event.target.value)}>
                <option value="">请选择栏目</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} (ID: {category.id})
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form.pbootCategoryId}
                onChange={(event) => setForm({ ...form, pbootCategoryId: event.target.value, pbootCategoryName: '' })}
                placeholder="读取失败时可手动填写栏目 ID，例如：1"
              />
            )}

            {form.pbootCategoryName && <div className="wizard-note">当前选择：{form.pbootCategoryName}</div>}
            {error && <p className="form-error">{error}</p>}

            <button className="primary-action wide-action" type="button" onClick={saveConfig}>
              保存发布配置
            </button>
          </div>
        )}
      </section>
      </div>
    </ModalLayer>
  );
}

function AnchorModal({ site, onClose, onChanged }) {
  const [anchors, setAnchors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    id: '',
    keyword: '',
    url: `https://${site.domain}`,
    enabled: true,
  });

  async function loadAnchors() {
    setLoading(true);
    const data = await api(`/api/anchors?siteId=${site.id}`);
    setAnchors(data.anchors || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAnchors().catch((apiError) => {
      setError(apiError.message);
      setLoading(false);
    });
  }, [site.id]);

  async function save(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/anchors', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          id: form.id || undefined,
          siteId: site.id,
        }),
      });
      setForm({ id: '', keyword: '', url: `https://${site.domain}`, enabled: true });
      await loadAnchors();
      await onChanged?.();
    } catch (apiError) {
      setError(apiError.message);
    }
  }

  async function remove(id) {
    await api(`/api/anchors/${id}`, { method: 'DELETE' });
    await loadAnchors();
    await onChanged?.();
  }

  return (
    <ModalLayer>
      <div className="modal-backdrop">
      <section className="modal modal--anchor">
        <div className="modal-heading">
          <h2>关键词锚文本</h2>
          <button type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <p className="modal-tip">发布文章时，系统会从启用的锚文本中随机选择 1 条插入文章。正文里出现关键词时优先替换第一次出现的位置，没有出现时会插入到文章末尾。</p>

        <form className="anchor-form" onSubmit={save}>
          <input
            value={form.keyword}
            onChange={(event) => setForm({ ...form, keyword: event.target.value })}
            placeholder="关键词，例如：工业废水处理"
          />
          <input
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
            placeholder="链接，例如：https://www.example.com"
          />
          <label className="check-row">
            <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
            启用
          </label>
          <button className="primary-action" type="submit">
            {form.id ? '保存修改' : '添加锚文本'}
          </button>
        </form>

        {error && <p className="form-error">{error}</p>}

        <div className="anchor-table">
          <div className="anchor-row anchor-row--head">
            <span>序号</span>
            <span>关键词</span>
            <span>链接</span>
            <span>状态</span>
            <span>操作</span>
          </div>
          {loading ? (
            <p className="empty-state">正在读取锚文本...</p>
          ) : (
            anchors.map((anchor, index) => (
              <div className="anchor-row" key={anchor.id}>
                <span>{index + 1}</span>
                <strong>{anchor.keyword}</strong>
                <a href={anchor.url} target="_blank" rel="noreferrer">
                  {anchor.url}
                </a>
                <span className={anchor.enabled ? 'state-text--ok' : 'state-text--warn'}>{anchor.enabled ? '启用' : '停用'}</span>
                <span className="row-actions">
                  <button type="button" onClick={() => setForm(anchor)}>编辑</button>
                  <button className="danger-action" type="button" onClick={() => remove(anchor.id)}>删除</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
      </div>
    </ModalLayer>
  );
}

function ArticleGenerator({ sites, user, onGenerated }) {
  const [keywordsText, setKeywordsText] = useState('黄金走势分析\n贵金属投资策略');
  const [contentType, setContentType] = useState('SEO软文');
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [targetCount, setTargetCount] = useState(3);
  const [autoPublish, setAutoPublish] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [lastBatch, setLastBatch] = useState([]);
  const [summary, setSummary] = useState(null);

  const parsedKeywords = useMemo(() => parseKeywordInput(keywordsText), [keywordsText]);
  const modelReady = Boolean(user?.llmApiUrl && user?.hasLlmApiKey);
  const activeModel = user?.llmModel || user?.defaultModel || 'gpt-4.1-mini';

  useEffect(() => {
    if (!siteId && sites[0]) setSiteId(sites[0].id);
  }, [siteId, sites]);

  async function generate(singleMode) {
    if (!siteId) {
      setError('请先选择发布站点');
      return;
    }
    if (!parsedKeywords.length) {
      setError('请至少输入一个关键词');
      return;
    }

    setLoading(true);
    setError('');
    setSummary(null);
    try {
      const payload = {
        siteId,
        tag: contentType,
        autoPublish,
      };
      if (singleMode) {
        payload.topic = parsedKeywords[0];
        payload.targetCount = 1;
      } else {
        payload.keywords = parsedKeywords;
        payload.targetCount = Math.max(1, Number(targetCount) || 1);
      }
      const data = await api('/api/articles/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDraft(data.article?.content || '');
      setLastBatch(data.articles || []);
      setSummary(data.summary || null);
      if (data.errors?.length) {
        setError(data.errors.map((item) => `${item.topic}: ${item.message}`).join('；'));
      }
      await onGenerated();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section-card generator generator-panel">
      <div className="section-heading generator-heading">
        <div>
          <p>文章生成</p>
          <h2>按数量顺序生成</h2>
          <span>输入关键词后，系统会按顺序逐篇生成，不会一次性并发乱跑。</span>
        </div>
        <div className="button-row">
          <button className="secondary-action" onClick={() => generate(true)} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Bot size={18} />}
            先生成 1 篇
          </button>
          <button className="primary-action" onClick={() => generate(false)} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            顺序生成目标数量
          </button>
        </div>
      </div>

      <div className="generator-overview">
        <article>
          <span>关键词</span>
          <strong>{parsedKeywords.length}</strong>
          <em>已识别</em>
        </article>
        <article>
          <span>目标数量</span>
          <strong>{Math.max(1, Number(targetCount) || 1)}</strong>
          <em>顺序生成</em>
        </article>
        <article>
          <span>发布方式</span>
          <strong>{autoPublish ? '自动发布' : '保存草稿'}</strong>
          <em>{modelReady ? activeModel : '本地模板'}</em>
        </article>
      </div>

      <div className="generator-grid">
        <div className="prompt-box">
          <div className="generator-card-title">
            <Sparkles size={20} />
            <div>
              <strong>关键词 / 主题</strong>
              <span>每行一个关键词，系统会循环使用关键词池</span>
            </div>
          </div>
          <textarea value={keywordsText} onChange={(event) => setKeywordsText(event.target.value)} />
          <div className="helper-text">支持按行、英文逗号、中文逗号输入多个关键词。系统会按顺序逐篇生成，直到达到目标数量。</div>
          <div className="keyword-preview">
            {parsedKeywords.length ? parsedKeywords.map((item) => (
              <span key={item}>{item}</span>
            )) : <em>还没有识别到关键词</em>}
          </div>
          {error && <p className="form-error">{error}</p>}
          {summary && (
            <div className="summary-panel">
              <strong>本次结果</strong>
              <span>请求 {summary.requestedCount} 篇，成功 {summary.successCount} 篇，失败 {summary.failedCount} 篇</span>
            </div>
          )}
          {draft && <pre className="draft-preview">{draft}</pre>}
        </div>

        <div className="generator-settings">
          <div className="generator-card-title">
            <Settings size={20} />
            <div>
              <strong>生成设置</strong>
              <span>选择站点、类型和生成数量</span>
            </div>
          </div>

          <label>内容类型</label>
          <select value={contentType} onChange={(event) => setContentType(event.target.value)}>
            <option>SEO软文</option>
            <option>资讯文章</option>
            <option>产品介绍</option>
          </select>

          <label>发布站点</label>
          <select value={siteId} onChange={(event) => setSiteId(Number(event.target.value))}>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>

          <label>目标数量</label>
          <input type="number" min="1" max="100" value={targetCount} onChange={(event) => setTargetCount(event.target.value)} />

          <label className="check-row">
            <input type="checkbox" checked={autoPublish} onChange={(event) => setAutoPublish(event.target.checked)} />
            生成后自动发布
          </label>

          <label>模型状态</label>
          <div className={modelReady ? 'status-chip status-chip--ok' : 'status-chip'}>
            {modelReady ? `已配置：${activeModel}` : '未配置模型接口，将使用本地模板生成'}
          </div>
          {user?.llmApiUrl && <div className="helper-text">接口地址：{user.llmApiUrl}</div>}
        </div>
      </div>

      {lastBatch.length > 0 && (
        <div className="batch-result">
          <div className="section-heading">
            <div>
              <p>最近一次生成</p>
              <h2>共创建 {lastBatch.length} 篇</h2>
            </div>
          </div>
          <div className="article-list article-list--wide">
            {lastBatch.map((article) => (
              <article key={article.id}>
                <strong>{article.title}</strong>
                <span>{article.tag}</span>
                <em>{displayArticleStatus(article.status)}</em>
                <div className="batch-row-actions">
                  <span>{formatDateTime(article.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ScheduleFormModal({ sites, initialSchedule, onClose, onSave }) {
  const [form, setForm] = useState({
    id: initialSchedule?.id || '',
    name: initialSchedule?.name || '',
    siteId: initialSchedule?.siteId || sites[0]?.id || '',
    targetCount: initialSchedule?.targetCount || 1,
    runTime: initialSchedule?.runTime || '09:00',
    active: initialSchedule?.active ?? true,
    resetProgress: false,
  });
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSave({
        ...form,
        siteId: Number(form.siteId),
        targetCount: Math.max(1, Number(form.targetCount) || 1),
        runTime: form.runTime || '09:00',
      });
      onClose();
    } catch (apiError) {
      setError(apiError.message);
    }
  }

  return (
    <ModalLayer>
      <div className="modal-backdrop">
      <form className="modal modal--wide" onSubmit={handleSubmit}>
        <div className="modal-heading">
          <h2>{initialSchedule ? '编辑定时任务' : '新建定时任务'}</h2>
          <button type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <label>任务名称</label>
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：黄金站点晚间自动更新" />

        <label>发布站点</label>
        <select value={form.siteId} onChange={(event) => setForm({ ...form, siteId: event.target.value })}>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>

        <label>每天发送时间</label>
        <input type="time" value={form.runTime} onChange={(event) => setForm({ ...form, runTime: event.target.value })} />

        <label>指定发送数量</label>
        <input
          className="schedule-count-input"
          type="number"
          min="1"
          max="1000"
          value={form.targetCount}
          onChange={(event) => setForm({ ...form, targetCount: event.target.value })}
          placeholder="例如：10"
        />

        <div className="helper-text">保存启用后，系统会在每天 {form.runTime || '09:00'} 从“我的文章”里抽取当前站点指定数量的待发送文章，最多发送 {Math.max(1, Number(form.targetCount) || 1)} 篇。每篇文章只发送一次，发送成功后标记为已发送。</div>

        <label className="check-row">
          <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          保存后立即启用
        </label>

        {initialSchedule && (
          <label className="check-row">
            <input type="checkbox" checked={form.resetProgress} onChange={(event) => setForm({ ...form, resetProgress: event.target.checked })} />
            重新统计发送进度
          </label>
        )}

        {error && <p className="form-error">{error}</p>}

        <button className="primary-action" type="submit">
          <Save size={18} />
          保存任务
        </button>
      </form>
      </div>
    </ModalLayer>
  );
}

function SchedulesView({ schedules, sites, onSave, onDelete, onToggle, onRun }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);

  function siteName(siteId) {
    return sites.find((site) => Number(site.id) === Number(siteId))?.name || '未找到站点';
  }

  return (
    <section className="section-card">
      <div className="section-heading">
        <div>
          <p>定时发送</p>
          <h2>任务队列</h2>
        </div>
        <button className="primary-action" onClick={() => setShowCreate(true)} disabled={!sites.length}>
          <Plus size={18} />
          新建任务
        </button>
      </div>

      {!sites.length && <p className="empty-state">请先添加发布站点，再创建定时任务。</p>}

      {sites.length > 0 && schedules.length === 0 && <p className="empty-state">暂时没有定时任务。</p>}

      {schedules.length > 0 && (
        <div className="schedule-list">
          {schedules.map((schedule) => (
            <article className="schedule-card" key={schedule.id}>
              <div className="schedule-card__header">
                <div>
                  <strong>{schedule.name}</strong>
                  <span>{siteName(schedule.siteId)}</span>
                </div>
                <div className={scheduleStatusClass(schedule.status)}>
                  {schedule.status === 'running' || schedule.status === 'completed' ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
                  {displayScheduleStatus(schedule.status)}
                </div>
              </div>

              <div className="schedule-grid">
                <div>
                  <span>发送来源</span>
                  <strong>我的文章</strong>
                </div>
                <div>
                  <span>已发送</span>
                  <strong>{schedule.generatedCount} / {schedule.targetCount} 篇</strong>
                </div>
                <div>
                  <span>指定数量</span>
                  <strong>{schedule.targetCount} 篇</strong>
                </div>
                <div>
                  <span>发送时间</span>
                  <strong>每天 {schedule.runTime || '09:00'}</strong>
                </div>
                <div>
                  <span>下次执行</span>
                  <strong>{formatDateTime(schedule.nextRunAt)}</strong>
                </div>
              </div>

              <div className="helper-text">
                每篇文章只发送一次。系统会跳过已发送文章，只从当前站点“我的文章”里抽取待发送文章，直到达到发送数量。
              </div>
              {schedule.lastError && <p className="form-error">最近错误：{schedule.lastError}</p>}

              <div className="schedule-actions">
                <button type="button" onClick={() => onRun(schedule.id)}>
                  <PlayCircle size={16} />
                  立即执行 1 篇
                </button>
                <button type="button" onClick={() => onToggle(schedule.id, !schedule.active)}>
                  {schedule.active ? <PauseCircle size={16} /> : <Repeat2 size={16} />}
                  {schedule.active ? '暂停' : '继续'}
                </button>
                <button type="button" onClick={() => setEditing(schedule)}>
                  <Settings size={16} />
                  编辑
                </button>
                <button className="danger-action" type="button" onClick={() => onDelete(schedule.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {showCreate && <ScheduleFormModal sites={sites} onClose={() => setShowCreate(false)} onSave={onSave} />}
      {editing && <ScheduleFormModal sites={sites} initialSchedule={editing} onClose={() => setEditing(null)} onSave={onSave} />}
    </section>
  );
}

function ArticleDetailModal({ article, onClose, onPublish }) {
  if (!article) return null;
  return (
    <ModalLayer>
      <div className="modal-backdrop">
      <article className="modal modal--article">
        <div className="modal-heading">
          <div>
            <p className="modal-kicker">文章详情</p>
            <h2>{article.title}</h2>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="关闭文章详情">
            <X size={20} />
          </button>
        </div>
        <div className="article-meta">
          <span>{article.tag}</span>
          <span>{displayArticleStatus(article.status)}</span>
          {article.createdAt && <span>{formatDateTime(article.createdAt)}</span>}
        </div>
        <pre className="article-content-preview">{article.content || '这篇文章暂时没有正文内容。'}</pre>
        {article.publishMessage && <p className="form-error">发布返回：{article.publishMessage}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>关闭</button>
          <button className="primary-action" type="button" onClick={() => onPublish(article.id)} disabled={article.status === 'published'}>
            {article.status === 'published' ? '已发送' : '发送文章'}
          </button>
        </div>
      </article>
      </div>
    </ModalLayer>
  );
}

function ArticlesView({ articles, onPublish, onDelete, onBatchDelete, publishError }) {
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = articles.length > 0 && selectedIds.length === articles.length;

  function toggleSelected(id) {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : articles.map((article) => article.id));
  }

  async function removeOne(id) {
    if (!window.confirm('确定删除这篇文章吗？')) return;
    setDeleting(true);
    try {
      await onDelete(id);
      setSelectedIds((current) => current.filter((item) => item !== id));
    } finally {
      setDeleting(false);
    }
  }

  async function removeSelected() {
    if (!selectedIds.length) return;
    if (!window.confirm(`确定删除选中的 ${selectedIds.length} 篇文章吗？`)) return;
    setDeleting(true);
    try {
      await onBatchDelete(selectedIds);
      setSelectedIds([]);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="section-card articles-panel">
      <div className="section-heading">
        <div>
          <p>我的文章</p>
          <h2>文章列表</h2>
        </div>
        {articles.length > 0 && (
          <div className="article-toolbar">
            <button className="secondary-action" type="button" onClick={toggleAll}>
              <ListChecks size={16} />
              {allSelected ? '取消全选' : '全选'}
            </button>
            <button className="danger-action danger-action--solid" type="button" onClick={removeSelected} disabled={!selectedIds.length || deleting}>
              <Trash2 size={16} />
              {deleting ? '删除中...' : `批量删除 ${selectedIds.length || ''}`}
            </button>
          </div>
        )}
      </div>
      {publishError && <p className="form-error">{publishError}</p>}
      {articles.length > 0 && (
        <div className="article-selection-tip">
          <span>共 {articles.length} 篇文章</span>
          <strong>{selectedIds.length ? `已选择 ${selectedIds.length} 篇` : '可勾选后批量删除'}</strong>
        </div>
      )}
      <div className="article-list article-list--wide">
        {articles.map((article) => (
          <article className={selectedSet.has(article.id) ? 'article-row article-row--selected' : 'article-row'} key={article.id}>
            <label className="article-select">
              <input
                type="checkbox"
                checked={selectedSet.has(article.id)}
                onChange={() => toggleSelected(article.id)}
              />
            </label>
            <button className="article-title-button" type="button" onClick={() => setSelectedArticle(article)}>
              {article.title}
            </button>
            <span>{article.tag}</span>
            <em>{displayArticleStatus(article.status)}</em>
            <div className="article-row-actions">
              <button type="button" onClick={() => setSelectedArticle(article)}>
                <Eye size={15} />
                查看
              </button>
              <button type="button" onClick={() => onPublish(article.id)} disabled={article.status === 'published'}>
                {article.status === 'published' ? '已发送' : '发送'}
              </button>
              <button className="danger-action" type="button" onClick={() => removeOne(article.id)} disabled={deleting}>
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      {articles.length === 0 && <p className="empty-state">还没有文章，请先去“文章生成”创建内容。</p>}
      <ArticleDetailModal article={selectedArticle} onClose={() => setSelectedArticle(null)} onPublish={onPublish} />
    </section>
  );
}

function LogsView({ logs }) {
  return (
    <section className="section-card compact-card">
      <div className="section-heading">
        <div>
          <p>发布日志</p>
          <h2>实时动态</h2>
        </div>
      </div>
      <div className="log-list">
        {logs.map((log) => (
          <article key={log.id}>
            <time>{log.time}</time>
            <div>
              <strong>{log.title}</strong>
              <span>{log.site}</span>
            </div>
            <em className={log.result === 'success' ? 'state-text--ok' : 'state-text--warn'}>{displayLogResult(log.result)}</em>
          </article>
        ))}
      </div>
      {logs.length === 0 && <p className="empty-state">暂无日志。</p>}
    </section>
  );
}

function ImageManager({ images, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState('');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = images.length > 0 && selectedIds.length === images.length;

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('image', file));
      await api('/api/images', {
        method: 'POST',
        body: formData,
      });
      event.target.value = '';
      await onUploaded();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setUploading(false);
    }
  }

  function toggleSelected(id) {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : images.map((image) => image.id));
  }

  async function removeImage(id) {
    if (deletingId) return;
    if (!window.confirm('确定删除这张图片吗？')) return;
    setDeletingId(id);
    setError('');
    try {
      await api(`/api/images/${id}`, { method: 'DELETE' });
      setSelectedIds((current) => current.filter((item) => item !== id));
      await onUploaded();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setDeletingId(0);
    }
  }

  async function removeSelectedImages() {
    if (!selectedIds.length) return;
    if (!window.confirm(`确定删除选中的 ${selectedIds.length} 张图片吗？`)) return;
    setDeleting(true);
    setError('');
    try {
      await api('/api/images/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      setSelectedIds([]);
      await onUploaded();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="section-card image-manager">
      <div className="section-heading">
        <div>
          <p>图片管理</p>
          <h2>文章配图库</h2>
        </div>
        <div className="image-actions">
          {images.length > 0 && (
            <>
              <button className="secondary-action" type="button" onClick={toggleAll}>
                <ListChecks size={17} />
                {allSelected ? '取消全选' : '全选'}
              </button>
              <button
                className="danger-action danger-action--solid"
                type="button"
                onClick={removeSelectedImages}
                disabled={!selectedIds.length || deleting}
              >
                <Trash2 size={17} />
                {deleting ? '删除中...' : `批量删除 ${selectedIds.length || ''}`}
              </button>
            </>
          )}
          <label className="upload-action">
            <UploadCloud size={18} />
            {uploading ? '上传中...' : '批量上传图片'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      <div className="image-help">
        支持一次选择多张图片上传。素材只属于当前账号，生成文章时系统会随机选用一张配图插入正文。
        {selectedIds.length > 0 && <strong> 已选择 {selectedIds.length} 张图片。</strong>}
      </div>
      {error && <p className="form-error">{error}</p>}

      {images.length > 0 ? (
        <div className="image-grid">
          {images.map((image) => (
            <article className={`image-card ${selectedSet.has(image.id) ? 'image-card--selected' : ''}`} key={image.id}>
              <label className="image-select">
                <input
                  type="checkbox"
                  checked={selectedSet.has(image.id)}
                  onChange={() => toggleSelected(image.id)}
                />
                选择
              </label>
              <img src={image.absoluteUrl || image.url} alt={image.name} onClick={() => toggleSelected(image.id)} />
              <div>
                <strong>{image.name}</strong>
                <span>{Math.max(1, Math.round((image.size || 0) / 1024))} KB</span>
              </div>
              <button className="danger-action" type="button" onClick={() => removeImage(image.id)} disabled={deletingId === image.id}>
                {deletingId === image.id ? '删除中...' : '删除'}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">还没有图片，先上传几张文章配图。</p>
      )}
    </section>
  );
}

const forbiddenTemplate = [
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

function countForbiddenRules(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}

function ForbiddenWordsModal({ initialItem, onClose, onSave }) {
  const [form, setForm] = useState({
    id: initialItem?.id || '',
    name: initialItem?.name || '违禁词',
    wordsText: initialItem?.wordsText || '',
    enabled: initialItem?.enabled ?? true,
  });
  const [error, setError] = useState('');

  function useTemplate() {
    setForm((current) => ({
      ...current,
      name: current.name || '违禁词',
      wordsText: current.wordsText ? `${current.wordsText.trim()}\n${forbiddenTemplate}` : forbiddenTemplate,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (apiError) {
      setError(apiError.message);
    }
  }

  return (
    <ModalLayer>
      <div className="modal-backdrop">
      <form className="modal modal--forbidden" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <p className="modal-kicker">添加/编辑</p>
            <h2>违禁词分类</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <label>名称</label>
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：广告法违禁词" />

        <div className="label-row">
          <label>违禁词</label>
          <button type="button" onClick={useTemplate}>填入常用模板</button>
        </div>
        <textarea
          className="forbidden-textarea"
          value={form.wordsText}
          onChange={(event) => setForm({ ...form, wordsText: event.target.value })}
          placeholder="一行一个，例如：&#10;世界第一=行业靠前&#10;最=非常"
        />
        <div className="auth-hint">格式：违禁词=替换词。没有填写替换词时，系统会用 * 替换。</div>

        <label className="check-row">
          <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
          启用这组违禁词
        </label>

        {error && <p className="form-error">{error}</p>}
        <button className="primary-action" type="submit">
          <Save size={18} />
          保存
        </button>
      </form>
      </div>
    </ModalLayer>
  );
}

function ForbiddenWordsView({ items, onSave, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyTemplate() {
    await navigator.clipboard.writeText(forbiddenTemplate);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="section-card forbidden-panel">
      <div className="section-heading">
        <div>
          <p>合规过滤</p>
          <h2>违禁词管理</h2>
        </div>
        <button className="primary-action" type="button" onClick={() => setShowCreate(true)}>
          <Plus size={18} />
          添加分类
        </button>
      </div>

      <div className="forbidden-help">
        <div>
          <strong>使用说明</strong>
          <p>AI 生成内容可能出现“世界第一”“最高级”“最”等广告法风险词。添加违禁词后，系统会在文章生成后和发布前自动替换，降低内容风险。</p>
          <p>每行一个词，推荐使用 <code>违禁词=替换词</code>。例如 <code>世界第一=行业靠前</code>。只写违禁词时，会用 * 替换。</p>
        </div>
        <button type="button" onClick={copyTemplate}>
          <ListChecks size={17} />
          {copied ? '已复制模板' : '复制常用违禁词'}
        </button>
      </div>

      <div className="forbidden-table">
        <div className="forbidden-row forbidden-row--head">
          <span>ID</span>
          <span>分类</span>
          <span>违禁词</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        {items.map((item) => (
          <div className="forbidden-row" key={item.id}>
            <span>{item.id}</span>
            <strong>{item.name}</strong>
            <p>{String(item.wordsText || '').replace(/\n/g, ' ')}</p>
            <em>{item.enabled === false ? '停用' : '启用'}</em>
            <div className="row-actions">
              <button type="button" onClick={() => setEditing(item)}>
                <Settings size={15} />
                编辑
              </button>
              <button className="danger-action" type="button" onClick={() => onDelete(item.id)}>
                <Trash2 size={15} />
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && <p className="empty-state">还没有违禁词分类，可先复制常用模板后添加。</p>}

      <div className="forbidden-template">
        <div className="section-heading">
          <div>
            <p>常用模板</p>
            <h2>可直接复制使用</h2>
          </div>
          <span>{countForbiddenRules(forbiddenTemplate)} 条</span>
        </div>
        <pre>{forbiddenTemplate}</pre>
      </div>

      {showCreate && <ForbiddenWordsModal onClose={() => setShowCreate(false)} onSave={onSave} />}
      {editing && <ForbiddenWordsModal initialItem={editing} onClose={() => setEditing(null)} onSave={onSave} />}
    </section>
  );
}

function displayMemberStatus(status) {
  return status === 'disabled' ? '已禁用' : '正常';
}

function RechargeView({ user, payment, orders, onCreated, onRefresh }) {
  const enabledPlans = payment?.plans || [];
  const [selectedPlanId, setSelectedPlanId] = useState(enabledPlans[0]?.id || '');
  const [payType, setPayType] = useState('alipay');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!selectedPlanId && enabledPlans[0]?.id) setSelectedPlanId(enabledPlans[0].id);
  }, [enabledPlans, selectedPlanId]);

  const selectedPlan = enabledPlans.find((plan) => plan.id === selectedPlanId) || enabledPlans[0];

  async function createOrder(plan) {
    if (!plan) {
      setError('请选择充值套餐');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api('/api/payment/recharge', {
        method: 'POST',
        body: JSON.stringify({ planId: plan.id, type: payType }),
      });
      setMessage(`订单已创建：${data.order?.outTradeNo || ''}`);
      await onCreated();
      if (data.payUrl) window.open(data.payUrl, '_blank', 'noopener,noreferrer');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section-card recharge-panel">
      <div className="section-heading">
        <div>
          <p>会员充值</p>
          <h2>套餐与有效期</h2>
        </div>
        <button className="secondary-action" type="button" onClick={onRefresh}>
          <Repeat2 size={16} />
          刷新订单
        </button>
      </div>

      <div className="recharge-summary">
        <article>
          <span>当前账号</span>
          <strong>{user?.username || '-'}</strong>
        </article>
        <article>
          <span>会员状态</span>
          <strong>{user?.membership?.label || '未开通'}</strong>
        </article>
        <article>
          <span>到期时间</span>
          <strong>{user?.membership?.expiresAt ? formatDateTime(user.membership.expiresAt) : '暂无'}</strong>
        </article>
      </div>

      {!payment?.enabled ? (
        <p className="empty-state">管理员暂未启用在线充值，请联系管理员开通易支付收款。</p>
      ) : (
        <>
          <div className="payment-type-bar">
            {[
              ['alipay', '支付宝'],
              ['wxpay', '微信支付'],
              ['qqpay', 'QQ 钱包'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={payType === value ? 'auth-tab auth-tab--active' : 'auth-tab'}
                onClick={() => setPayType(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="plan-grid">
            {enabledPlans.map((plan) => (
              <article className={selectedPlanId === plan.id ? 'plan-card plan-card--active' : 'plan-card'} key={plan.id}>
                <span>{plan.days} 天</span>
                <strong>{plan.name}</strong>
                <em>￥{formatMoney(plan.price)}</em>
                <button className="primary-action" type="button" disabled={busy} onClick={() => {
                  setSelectedPlanId(plan.id);
                  createOrder(plan);
                }}>
                  {busy && selectedPlan?.id === plan.id ? <Loader2 className="spin" size={17} /> : <CreditCard size={17} />}
                  立即充值
                </button>
              </article>
            ))}
          </div>
        </>
      )}

      {(message || error) && <p className={error ? 'form-error settings-message' : 'form-success settings-message'}>{error || message}</p>}

      <div className="payment-orders">
        <div className="section-heading section-heading--inline">
          <div>
            <p>充值记录</p>
            <h2>最近订单</h2>
          </div>
        </div>
        <div className="order-table">
          <div className="order-row order-row--head">
            <span>订单号</span>
            <span>套餐</span>
            <span>金额</span>
            <span>状态</span>
            <span>创建时间</span>
          </div>
          {(orders || []).map((order) => (
            <div className="order-row" key={order.id || order.outTradeNo}>
              <strong>{order.outTradeNo}</strong>
              <span>{order.planName} · {order.days} 天</span>
              <span>￥{formatMoney(order.amount)}</span>
              <span className={order.status === 'paid' ? 'member-status' : 'member-status member-status--pending'}>{displayOrderStatus(order)}</span>
              <span>{formatDateTime(order.createdAt)}</span>
            </div>
          ))}
          {(!orders || orders.length === 0) && <p className="empty-state">暂无充值订单。</p>}
        </div>
      </div>
    </section>
  );
}

function MembersView({ members, onRefresh }) {
  const [memberForm, setMemberForm] = useState({ username: '', password: '', email: '' });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ email: '', status: 'active' });
  const [resetting, setResetting] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => ({
    total: members.length,
    active: members.filter((member) => member.status !== 'disabled').length,
    disabled: members.filter((member) => member.status === 'disabled').length,
    admins: members.filter((member) => member.isAdmin).length,
  }), [members]);

  async function reloadWithMessage(text) {
    await onRefresh();
    setMessage(text);
  }

  async function createMember(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!memberForm.username.trim()) {
      setError('请填写用户名');
      return;
    }
    if (memberForm.password.length < 6) {
      setError('密码至少需要 6 个字符');
      return;
    }
    setBusy(true);
    try {
      await api('/api/admin/members', {
        method: 'POST',
        body: JSON.stringify(memberForm),
      });
      setMemberForm({ username: '', password: '', email: '' });
      await reloadWithMessage('会员已新增');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(member) {
    setEditing(member);
    setEditForm({ email: member.email || '', status: member.status || 'active' });
    setError('');
    setMessage('');
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/api/admin/members/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setEditing(null);
      await reloadWithMessage('会员资料已更新');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setBusy(false);
    }
  }

  function startReset(member) {
    setResetting(member);
    setPasswordForm({ password: '', confirmPassword: '' });
    setError('');
    setMessage('');
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (!resetting) return;
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/api/admin/members/${resetting.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: passwordForm.password }),
      });
      setResetting(null);
      await reloadWithMessage('会员密码已重置');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteMember(member) {
    if (!window.confirm(`确定删除会员“${member.username}”吗？该会员的站点、文章、任务和日志也会一起删除。`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/api/admin/members/${member.id}`, { method: 'DELETE' });
      await reloadWithMessage('会员已删除');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section-card members-panel">
      <div className="section-heading">
        <div>
          <p>会员管理</p>
          <h2>账号与权限</h2>
        </div>
        <button className="secondary-action" type="button" onClick={onRefresh} disabled={busy}>
          <Repeat2 size={16} />
          刷新
        </button>
      </div>

      <div className="member-stats">
        <article><span>会员总数</span><strong>{stats.total}</strong></article>
        <article><span>正常账号</span><strong>{stats.active}</strong></article>
        <article><span>已禁用</span><strong>{stats.disabled}</strong></article>
        <article><span>管理员</span><strong>{stats.admins}</strong></article>
      </div>

      <form className="member-create-form" onSubmit={createMember}>
        <input value={memberForm.username} onChange={(event) => setMemberForm({ ...memberForm, username: event.target.value })} placeholder="会员用户名" />
        <input type="password" value={memberForm.password} onChange={(event) => setMemberForm({ ...memberForm, password: event.target.value })} placeholder="初始密码，至少 6 位" />
        <input type="email" value={memberForm.email} onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })} placeholder="会员邮箱，可选" />
        <button className="primary-action" type="submit" disabled={busy}>
          <UserPlus size={17} />
          新增会员
        </button>
      </form>

      {message && <p className="form-success">{message}</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="member-table">
        <div className="member-row member-row--head">
          <span>账号</span>
          <span>邮箱</span>
          <span>状态</span>
          <span>会员到期</span>
          <span>数据</span>
          <span>最后登录</span>
          <span>操作</span>
        </div>
        {members.map((member) => (
          <div className="member-row" key={member.id}>
            <div>
              <strong>{member.username}</strong>
              <em>{member.isAdmin ? '管理员' : '会员'} · ID {member.id}</em>
            </div>
            <span>{member.email || '未填写'}</span>
            <span className={member.status === 'disabled' ? 'member-status member-status--disabled' : 'member-status'}>
              {displayMemberStatus(member.status)}
            </span>
            <span>{member.membership?.expiresAt ? formatDateTime(member.membership.expiresAt) : '未开通'}</span>
            <span>{member.siteCount} 站点 / {member.articleCount} 文章 / {member.scheduleCount} 任务</span>
            <span>{formatDateTime(member.lastLoginAt)}</span>
            <span className="row-actions">
              <button type="button" onClick={() => startEdit(member)} disabled={member.isAdmin}>编辑</button>
              <button type="button" onClick={() => startReset(member)} disabled={member.isAdmin}>重置密码</button>
              <button className="danger-action" type="button" onClick={() => deleteMember(member)} disabled={member.isAdmin}>删除</button>
            </span>
          </div>
        ))}
        {members.length === 0 && <p className="empty-state">暂无会员。</p>}
      </div>

      {editing && (
        <ModalLayer>
          <div className="modal-backdrop">
            <form className="modal modal--wide" onSubmit={saveEdit}>
              <div className="modal-heading">
                <h2>编辑会员：{editing.username}</h2>
                <button type="button" onClick={() => setEditing(null)}><X size={20} /></button>
              </div>
              <label>会员邮箱</label>
              <input type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} placeholder="member@example.com" />
              <label>账号状态</label>
              <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                <option value="active">正常</option>
                <option value="disabled">禁用</option>
              </select>
              <div className="helper-text">禁用后该会员不能登录，已有文章和站点数据会保留。</div>
              <button className="primary-action" type="submit" disabled={busy}>
                <Save size={17} />
                保存会员
              </button>
            </form>
          </div>
        </ModalLayer>
      )}

      {resetting && (
        <ModalLayer>
          <div className="modal-backdrop">
            <form className="modal modal--wide" onSubmit={resetPassword}>
              <div className="modal-heading">
                <h2>重置密码：{resetting.username}</h2>
                <button type="button" onClick={() => setResetting(null)}><X size={20} /></button>
              </div>
              <label>新密码</label>
              <input type="password" value={passwordForm.password} onChange={(event) => setPasswordForm({ ...passwordForm, password: event.target.value })} placeholder="至少 6 位" />
              <label>确认新密码</label>
              <input type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} placeholder="再次输入新密码" />
              <button className="primary-action" type="submit" disabled={busy}>
                <Save size={17} />
                确认重置
              </button>
            </form>
          </div>
        </ModalLayer>
      )}
    </section>
  );
}

const defaultPaymentPlanForm = { id: '', name: '', cycle: 'month', days: 30, price: 49.9, enabled: true };

function PaymentSettingsView({ payment, onSaved }) {
  const paymentPlansKey = JSON.stringify(payment?.plans || []);
  const [form, setForm] = useState({
    enabled: Boolean(payment?.enabled),
    apiUrl: payment?.apiUrl || '',
    pid: payment?.pid || '',
    key: '',
    sitename: payment?.sitename || 'AIGOU',
    plans: payment?.plans?.length ? payment.plans : [],
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      enabled: Boolean(payment?.enabled),
      apiUrl: payment?.apiUrl || '',
      pid: payment?.pid || '',
      key: '',
      sitename: payment?.sitename || 'AIGOU',
      plans: payment?.plans?.length ? payment.plans : [],
    });
  }, [payment?.enabled, payment?.apiUrl, payment?.pid, payment?.sitename, paymentPlansKey]);

  function updatePlan(index, patch) {
    setForm((current) => ({
      ...current,
      plans: current.plans.map((plan, planIndex) => (planIndex === index ? { ...plan, ...patch } : plan)),
    }));
  }

  function addPlan() {
    setForm((current) => ({
      ...current,
      plans: [
        ...current.plans,
        { ...defaultPaymentPlanForm, id: `plan-${Date.now()}` },
      ],
    }));
  }

  function removePlan(index) {
    setForm((current) => ({
      ...current,
      plans: current.plans.filter((_, planIndex) => planIndex !== index),
    }));
  }

  async function savePayment(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const data = await api('/api/settings/payment', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          plans: form.plans.map((plan) => ({
            ...plan,
            days: Number(plan.days || 1),
            price: Number(plan.price || 0),
          })),
        }),
      });
      onSaved(data.payment);
      setForm((current) => ({ ...current, key: '' }));
      setMessage('易支付收款配置已保存');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section-card settings-panel payment-settings-panel">
      <div className="section-heading section-heading--inline">
        <div>
          <p>易支付收款</p>
          <h2>会员充值配置</h2>
        </div>
        <div className={form.enabled ? 'settings-status settings-status--ok' : 'settings-status settings-status--warn'}>
          {form.enabled ? '已启用' : '未启用'}
        </div>
      </div>

      <form className="settings-form settings-form--polished" onSubmit={savePayment}>
        <div className="payment-config-grid">
          <div className="model-config-card">
            <div className="model-card-title">
              <CreditCard size={20} />
              <div>
                <strong>接口参数</strong>
                <span>仅管理员可修改，会员只能选择套餐充值</span>
              </div>
            </div>
            <label className="check-row model-check-row">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
              启用会员在线充值
            </label>
            <label>易支付接口地址</label>
            <input value={form.apiUrl} onChange={(event) => setForm({ ...form, apiUrl: event.target.value })} placeholder="例如：https://pay.example.com" />
            <div className="dual-field">
              <div>
                <label>商户 ID</label>
                <input value={form.pid} onChange={(event) => setForm({ ...form, pid: event.target.value })} placeholder="PID" />
              </div>
              <div>
                <label>站点名称</label>
                <input value={form.sitename} onChange={(event) => setForm({ ...form, sitename: event.target.value })} placeholder="AIGOU" />
              </div>
            </div>
            <label>商户 Key</label>
            <input
              type="password"
              value={form.key}
              onChange={(event) => setForm({ ...form, key: event.target.value })}
              placeholder={payment?.hasKey ? '已保存 Key，不修改可留空' : '请输入商户 Key'}
            />
            <div className="settings-summary">
              <span>异步回调地址</span>
              <strong>/api/payment/notify</strong>
            </div>
          </div>

          <div className="model-config-card model-config-card--accent">
            <div className="model-card-title">
              <ListChecks size={20} />
              <div>
                <strong>收费套餐</strong>
                <span>可按周、月、季度、年或自定义天数收费</span>
              </div>
            </div>
            <div className="payment-plan-list">
              {form.plans.map((plan, index) => (
                <div className="payment-plan-editor" key={plan.id || index}>
                  <input value={plan.name} onChange={(event) => updatePlan(index, { name: event.target.value })} placeholder="套餐名称" />
                  <select value={plan.cycle} onChange={(event) => updatePlan(index, { cycle: event.target.value })}>
                    <option value="week">按周</option>
                    <option value="month">按月</option>
                    <option value="quarter">按季度</option>
                    <option value="year">按年</option>
                    <option value="custom">自定义</option>
                  </select>
                  <input type="number" min="1" value={plan.days} onChange={(event) => updatePlan(index, { days: event.target.value })} placeholder="天数" />
                  <input type="number" min="0.01" step="0.01" value={plan.price} onChange={(event) => updatePlan(index, { price: event.target.value })} placeholder="金额" />
                  <label className="check-row payment-plan-enabled">
                    <input type="checkbox" checked={plan.enabled !== false} onChange={(event) => updatePlan(index, { enabled: event.target.checked })} />
                    启用
                  </label>
                  <button className="danger-action" type="button" onClick={() => removePlan(index)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button className="secondary-action" type="button" onClick={addPlan}>
              <Plus size={16} />
              新增套餐
            </button>
          </div>
        </div>

        {(error || message) && <p className={error ? 'form-error settings-message' : 'form-success settings-message'}>{error || message}</p>}

        <div className="settings-actions model-save-row">
          <div className="helper-text">支付成功后系统会自动延长会员有效期；重复回调不会重复加时长。</div>
          <button className="primary-action" type="submit" disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            保存易支付配置
          </button>
        </div>
      </form>
    </section>
  );
}

function ModelSettingsView({ user, branding, ads, payment, onSaved, onBrandingSaved, onAdsChanged, onPaymentSaved }) {
  const [form, setForm] = useState({
    apiUrl: user?.llmApiUrl || '',
    apiKey: '',
    model: user?.llmModel || user?.defaultModel || 'gpt-4.1-mini',
  });
  const [models, setModels] = useState([]);
  const [autoReadModels, setAutoReadModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState('');
  const [profileForm, setProfileForm] = useState({ email: user?.email || '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [mailForm, setMailForm] = useState({
    mailNotifyEnabled: Boolean(user?.mailNotifyEnabled),
    smtpHost: user?.smtpHost || '',
    smtpPort: user?.smtpPort || 465,
    smtpSecure: user?.smtpSecure !== false,
    smtpUser: user?.smtpUser || '',
    smtpPass: '',
    smtpFrom: user?.smtpFrom || '',
  });
  const [accountMessage, setAccountMessage] = useState('');
  const [accountError, setAccountError] = useState('');
  const [mailMessage, setMailMessage] = useState('');
  const [mailError, setMailError] = useState('');
  const [brandForm, setBrandForm] = useState({
    siteName: branding?.siteName || defaultBranding.siteName,
    subtitle: branding?.subtitle || defaultBranding.subtitle,
    landingTitle: branding?.landingTitle || defaultBranding.landingTitle,
    landingDescription: branding?.landingDescription || defaultBranding.landingDescription,
  });
  const [brandMessage, setBrandMessage] = useState('');
  const [brandError, setBrandError] = useState('');
  const [adForm, setAdForm] = useState(emptyAdForm);
  const [adMessage, setAdMessage] = useState('');
  const [adError, setAdError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingMail, setSavingMail] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingAd, setSavingAd] = useState(false);
  const [deletingAdId, setDeletingAdId] = useState(0);

  useEffect(() => {
    setForm({
      apiUrl: user?.llmApiUrl || '',
      apiKey: '',
      model: user?.llmModel || user?.defaultModel || 'gpt-4.1-mini',
    });
    setProfileForm({ email: user?.email || '' });
    setMailForm({
      mailNotifyEnabled: Boolean(user?.mailNotifyEnabled),
      smtpHost: user?.smtpHost || '',
      smtpPort: user?.smtpPort || 465,
      smtpSecure: user?.smtpSecure !== false,
      smtpUser: user?.smtpUser || '',
      smtpPass: '',
      smtpFrom: user?.smtpFrom || '',
    });
    setModels([]);
  }, [user?.llmApiUrl, user?.llmModel, user?.defaultModel, user?.email, user?.mailNotifyEnabled, user?.smtpHost, user?.smtpPort, user?.smtpSecure, user?.smtpUser, user?.smtpFrom]);

  useEffect(() => {
    setBrandForm({
      siteName: branding?.siteName || defaultBranding.siteName,
      subtitle: branding?.subtitle || defaultBranding.subtitle,
      landingTitle: branding?.landingTitle || defaultBranding.landingTitle,
      landingDescription: branding?.landingDescription || defaultBranding.landingDescription,
    });
  }, [branding?.siteName, branding?.subtitle, branding?.landingTitle, branding?.landingDescription]);

  async function loadModels() {
    setError('');
    setLoadingModels(true);
    try {
      const data = await api('/api/settings/llm/models', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      const nextModels = data.models || [];
      setModels(nextModels);
      setForm((current) => ({
        ...current,
        model: data.selectedModel || current.model || nextModels[0] || user?.defaultModel || 'gpt-4.1-mini',
      }));
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoadingModels(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = await api('/api/settings/llm', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({
        apiUrl: data.user?.llmApiUrl || '',
        apiKey: '',
        model: data.user?.llmModel || user?.defaultModel || 'gpt-4.1-mini',
      });
      await onSaved(data.user);
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setAccountError('');
    setAccountMessage('');
    setSavingProfile(true);
    try {
      const data = await api('/api/account/profile', {
        method: 'POST',
        body: JSON.stringify(profileForm),
      });
      await onSaved(data.user);
      setAccountMessage('邮箱已保存');
    } catch (apiError) {
      setAccountError(apiError.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setAccountError('');
    setAccountMessage('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setAccountError('两次输入的新密码不一致');
      return;
    }
    setSavingPassword(true);
    try {
      const data = await api('/api/account/password', {
        method: 'POST',
        body: JSON.stringify(passwordForm),
      });
      await onSaved(data.user);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setAccountMessage('密码已修改，下次登录请使用新密码');
    } catch (apiError) {
      setAccountError(apiError.message);
    } finally {
      setSavingPassword(false);
    }
  }

  async function saveMailSettings(event) {
    event.preventDefault();
    setMailError('');
    setMailMessage('');
    setSavingMail(true);
    try {
      const data = await api('/api/settings/mail', {
        method: 'POST',
        body: JSON.stringify(mailForm),
      });
      await onSaved(data.user);
      setMailForm((current) => ({ ...current, smtpPass: '' }));
      setMailMessage('邮件通知配置已保存');
    } catch (apiError) {
      setMailError(apiError.message);
    } finally {
      setSavingMail(false);
    }
  }

  async function testMail() {
    setMailError('');
    setMailMessage('');
    setTestingMail(true);
    try {
      await api('/api/settings/mail/test', {
        method: 'POST',
        body: JSON.stringify({ to: profileForm.email || mailForm.smtpFrom || mailForm.smtpUser }),
      });
      setMailMessage('测试邮件已发送');
    } catch (apiError) {
      setMailError(apiError.message);
    } finally {
      setTestingMail(false);
    }
  }

  async function saveBranding(event) {
    event.preventDefault();
    setBrandError('');
    setBrandMessage('');
    setSavingBrand(true);
    try {
      const data = await api('/api/settings/branding', {
        method: 'POST',
        body: JSON.stringify(brandForm),
      });
      onBrandingSaved(data.branding);
      setBrandMessage('网站名称和品牌信息已保存');
    } catch (apiError) {
      setBrandError(apiError.message);
    } finally {
      setSavingBrand(false);
    }
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBrandError('');
    setBrandMessage('');
    setUploadingLogo(true);
    try {
      const body = new FormData();
      body.append('logo', file);
      const data = await api('/api/settings/branding/logo', {
        method: 'POST',
        body,
      });
      onBrandingSaved(data.branding);
      setBrandMessage('Logo 已更换');
    } catch (apiError) {
      setBrandError(apiError.message);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function saveAd(event) {
    event.preventDefault();
    setAdError('');
    setAdMessage('');
    setSavingAd(true);
    try {
      const data = await api('/api/settings/ads', {
        method: 'POST',
        body: JSON.stringify({
          ...adForm,
          id: adForm.id || undefined,
          sortOrder: Number(adForm.sortOrder || 1),
        }),
      });
      onAdsChanged(data.ads || []);
      setAdForm(emptyAdForm);
      setAdMessage('广告位已保存');
    } catch (apiError) {
      setAdError(apiError.message);
    } finally {
      setSavingAd(false);
    }
  }

  async function deleteAd(id) {
    if (deletingAdId) return;
    if (!window.confirm('确定删除这个广告位吗？')) return;
    setAdError('');
    setAdMessage('');
    setDeletingAdId(id);
    try {
      const data = await api(`/api/settings/ads/${id}`, { method: 'DELETE' });
      onAdsChanged(data.ads || []);
      if (Number(adForm.id) === Number(id)) setAdForm(emptyAdForm);
      setAdMessage('广告位已删除');
    } catch (apiError) {
      setAdError(apiError.message);
    } finally {
      setDeletingAdId(0);
    }
  }

  return (
    <>
    {user?.isAdmin && (
      <PaymentSettingsView payment={payment} onSaved={onPaymentSaved} />
    )}

    {user?.isAdmin && (
      <section className="section-card settings-panel brand-settings-panel">
        <div className="section-heading section-heading--inline">
          <div>
            <p>网站品牌</p>
            <h2>名称与 Logo</h2>
          </div>
          <div className="settings-status settings-status--ok">管理员可配置</div>
        </div>

        <form className="settings-form settings-form--polished" onSubmit={saveBranding}>
          <div className="brand-settings-grid">
            <div className="brand-preview-card">
              <BrandMark branding={branding} className="brand-mark brand-mark--preview" />
              <strong>{brandForm.siteName || defaultBranding.siteName}</strong>
              <span>{brandForm.subtitle || defaultBranding.subtitle}</span>
              <label className="upload-action brand-logo-upload">
                <UploadCloud size={18} />
                {uploadingLogo ? '上传中...' : '更换 Logo'}
                <input type="file" accept="image/*" onChange={uploadLogo} disabled={uploadingLogo} />
              </label>
            </div>

            <div className="model-config-card">
              <div className="model-card-title">
                <Settings size={20} />
                <div>
                  <strong>显示信息</strong>
                  <span>用于首页、登录页和后台侧边栏</span>
                </div>
              </div>
              <label>网站名称</label>
              <input value={brandForm.siteName} onChange={(event) => setBrandForm({ ...brandForm, siteName: event.target.value })} placeholder="例如：AIGOU" />
              <label>后台副标题</label>
              <input value={brandForm.subtitle} onChange={(event) => setBrandForm({ ...brandForm, subtitle: event.target.value })} placeholder="例如：智能发布后台" />
              <label>首页主标题</label>
              <input value={brandForm.landingTitle} onChange={(event) => setBrandForm({ ...brandForm, landingTitle: event.target.value })} placeholder="首页大标题" />
              <label>首页介绍文案</label>
              <textarea value={brandForm.landingDescription} onChange={(event) => setBrandForm({ ...brandForm, landingDescription: event.target.value })} rows={4} />
            </div>
          </div>

          {(brandError || brandMessage) && <p className={brandError ? 'form-error settings-message' : 'form-success settings-message'}>{brandError || brandMessage}</p>}

          <div className="settings-actions model-save-row">
            <div className="helper-text">Logo 建议使用 PNG/WebP，方形图标显示效果更稳。</div>
            <button className="primary-action" type="submit" disabled={savingBrand}>
              {savingBrand ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
              保存网站品牌
            </button>
          </div>
        </form>
      </section>
    )}

    {user?.isAdmin && (
      <section className="section-card settings-panel ad-settings-panel">
        <div className="section-heading section-heading--inline">
          <div>
            <p>首页广告位</p>
            <h2>广告展示管理</h2>
          </div>
          <div className="settings-status settings-status--ok">{ads?.length || 0} 个广告</div>
        </div>

        <form className="settings-form settings-form--polished" onSubmit={saveAd}>
          <div className="ad-settings-grid">
            <div className="model-config-card">
              <div className="model-card-title">
                <Image size={20} />
                <div>
                  <strong>{adForm.id ? '编辑广告位' : '新增广告位'}</strong>
                  <span>首页会按排序值从小到大显示启用广告</span>
                </div>
              </div>
              <div className="dual-field">
                <div>
                  <label>广告标题</label>
                  <input value={adForm.title} onChange={(event) => setAdForm({ ...adForm, title: event.target.value })} placeholder="例如：限时活动" />
                </div>
                <div>
                  <label>广告位置</label>
                  <input value={adForm.position} onChange={(event) => setAdForm({ ...adForm, position: event.target.value })} placeholder="例如：首页横幅" />
                </div>
              </div>
              <label>广告文案</label>
              <textarea value={adForm.description} onChange={(event) => setAdForm({ ...adForm, description: event.target.value })} rows={3} placeholder="广告说明文字" />
              <label>图片地址</label>
              <input value={adForm.imageUrl} onChange={(event) => setAdForm({ ...adForm, imageUrl: event.target.value })} placeholder="https://example.com/ad.png 或 /api/image/..." />
              <label>跳转链接</label>
              <input value={adForm.linkUrl} onChange={(event) => setAdForm({ ...adForm, linkUrl: event.target.value })} placeholder="https://example.com" />
              <div className="dual-field">
                <div>
                  <label>排序</label>
                  <input type="number" value={adForm.sortOrder} onChange={(event) => setAdForm({ ...adForm, sortOrder: event.target.value })} />
                </div>
                <label className="check-row model-check-row ad-enabled-row">
                  <input type="checkbox" checked={adForm.enabled} onChange={(event) => setAdForm({ ...adForm, enabled: event.target.checked })} />
                  启用广告
                </label>
              </div>
              <div className="ad-form-actions">
                <button className="primary-action" type="submit" disabled={savingAd}>
                  {savingAd ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                  {adForm.id ? '保存修改' : '新增广告'}
                </button>
                {adForm.id && (
                  <button className="secondary-action" type="button" onClick={() => setAdForm(emptyAdForm)}>
                    取消编辑
                  </button>
                )}
              </div>
            </div>

            <div className="ad-list">
              {(ads || []).length === 0 && <p className="empty-state">还没有广告位，先新增一个首页广告。</p>}
              {(ads || []).map((ad) => (
                <article className="ad-admin-card" key={ad.id}>
                  {safeAdUrl(ad.imageUrl) ? <img src={safeAdUrl(ad.imageUrl)} alt={ad.title || '广告'} /> : <div className="ad-admin-card__placeholder">AD</div>}
                  <div>
                    <span>{ad.position || '首页横幅'} · 排序 {ad.sortOrder}</span>
                    <strong>{ad.title || '未命名广告'}</strong>
                    <p>{ad.description || '暂无文案'}</p>
                    <em className={ad.enabled ? 'state-text--ok' : 'state-text--warn'}>{ad.enabled ? '启用' : '停用'}</em>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => setAdForm({ ...emptyAdForm, ...ad })}>编辑</button>
                    <button className="danger-action" type="button" onClick={() => deleteAd(ad.id)} disabled={deletingAdId === ad.id}>
                      {deletingAdId === ad.id ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {(adError || adMessage) && <p className={adError ? 'form-error settings-message' : 'form-success settings-message'}>{adError || adMessage}</p>}
        </form>
      </section>
    )}

    <section className="section-card settings-panel model-settings-panel">
      <div className="section-heading section-heading--inline">
        <div>
          <p>模型设置</p>
          <h2>大模型调用配置</h2>
        </div>
        <div className={user?.llmApiUrl && user?.hasLlmApiKey ? 'settings-status settings-status--ok' : 'settings-status settings-status--warn'}>
          {user?.llmApiUrl && user?.hasLlmApiKey ? '接口已配置' : '等待配置'}
        </div>
      </div>

      <form className="settings-form settings-form--polished" onSubmit={handleSubmit}>
        <div className="model-overview">
          <article>
            <span>当前模型</span>
            <strong>{form.model || user?.defaultModel || 'gpt-4.1-mini'}</strong>
          </article>
          <article>
            <span>接口地址</span>
            <strong>{form.apiUrl ? '已填写' : '未填写'}</strong>
          </article>
          <article>
            <span>API Key</span>
            <strong>{user?.hasLlmApiKey || form.apiKey ? '已保存/待保存' : '未填写'}</strong>
          </article>
        </div>

        <div className="settings-grid model-config-grid">
          <div className="model-config-card">
            <div className="model-card-title">
              <Cpu size={20} />
              <div>
                <strong>接口配置</strong>
                <span>填写 OpenAI 兼容接口地址和 Key</span>
              </div>
            </div>

            <label>API 地址</label>
            <input
              value={form.apiUrl}
              onChange={(event) => setForm({ ...form, apiUrl: event.target.value })}
              placeholder="例如：https://api.openai.com/v1/chat/completions"
            />

            <label>API Key</label>
            <input
              type="password"
              value={form.apiKey}
              onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
              placeholder={user?.hasLlmApiKey ? '已保存 Key，不修改可留空' : '请输入 API Key'}
            />
          </div>

          <div className="model-config-card model-config-card--accent">
            <div className="model-card-title">
              <Sparkles size={20} />
              <div>
                <strong>模型选择</strong>
                <span>读取接口支持的模型，也可以手动填写</span>
              </div>
            </div>

            <div className="label-row model-read-row">
              <label>模型</label>
              <button type="button" onClick={loadModels} disabled={loadingModels || !form.apiUrl}>
                {loadingModels ? <Loader2 className="spin" size={16} /> : <Cpu size={16} />}
                {loadingModels ? '读取中...' : '读取模型'}
              </button>
            </div>

            <div className="model-picker">
              <select value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })}>
                {!models.includes(form.model) && (
                  <option value={form.model}>{form.model || '手动填写模型'}</option>
                )}
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <input
                value={form.model}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
                placeholder="也可以手动填写模型名"
              />
            </div>

            <label className="check-row model-check-row">
              <input
                type="checkbox"
                checked={autoReadModels}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setAutoReadModels(checked);
                  if (checked) loadModels();
                }}
              />
              勾选后立即读取 API 支持的模型并允许切换
            </label>

            {models.length > 0 ? (
              <div className="model-list-preview">
                <span>已读取 {models.length} 个模型</span>
                <strong>{models.slice(0, 3).join('、')}{models.length > 3 ? ' ...' : ''}</strong>
              </div>
            ) : (
              <div className="model-list-preview model-list-preview--empty">
                <span>尚未读取模型</span>
                <strong>填写 API 地址和 Key 后点击“读取模型”</strong>
              </div>
            )}
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="settings-actions model-save-row">
          <div className="helper-text">
            系统使用 OpenAI 兼容接口格式，文章生成会优先调用这里保存的模型。
          </div>
          <button className="primary-action" type="submit" disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            保存模型配置
          </button>
        </div>
      </form>
    </section>

    <section className="section-card settings-panel account-settings-panel">
      <div className="section-heading section-heading--inline">
        <div>
          <p>账号安全</p>
          <h2>邮箱与密码</h2>
        </div>
        <div className="settings-status settings-status--ok">{user?.isAdmin ? '管理员账号' : '会员账号'}</div>
      </div>

      <div className="account-settings-grid">
        <form className="model-config-card" onSubmit={saveProfile}>
          <div className="model-card-title">
            <UserPlus size={20} />
            <div>
              <strong>接收邮箱</strong>
              <span>会员填写自己的邮箱，用于接收发布成功通知</span>
            </div>
          </div>
          <label>邮箱地址</label>
          <input
            type="email"
            value={profileForm.email}
            onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })}
            placeholder="例如：member@example.com"
          />
          <button className="primary-action" type="submit" disabled={savingProfile}>
            {savingProfile ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            保存邮箱
          </button>
        </form>

        <form className="model-config-card" onSubmit={changePassword}>
          <div className="model-card-title">
            <ShieldAlert size={20} />
            <div>
              <strong>修改密码</strong>
              <span>管理员和会员都可以修改自己的登录密码</span>
            </div>
          </div>
          <label>当前密码</label>
          <input
            type="password"
            value={passwordForm.currentPassword}
            onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })}
            placeholder="请输入当前密码"
            autoComplete="current-password"
          />
          <label>新密码</label>
          <input
            type="password"
            value={passwordForm.newPassword}
            onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
            placeholder="至少 6 个字符"
            autoComplete="new-password"
          />
          <label>确认新密码</label>
          <input
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })}
            placeholder="再次输入新密码"
            autoComplete="new-password"
          />
          <button className="primary-action" type="submit" disabled={savingPassword}>
            {savingPassword ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            修改密码
          </button>
        </form>
      </div>
      {(accountError || accountMessage) && <p className={accountError ? 'form-error settings-message' : 'form-success settings-message'}>{accountError || accountMessage}</p>}
    </section>

    {user?.isAdmin && (
      <section className="section-card settings-panel mail-settings-panel">
        <div className="section-heading section-heading--inline">
          <div>
            <p>邮件通知</p>
            <h2>发布成功通知配置</h2>
          </div>
          <div className={mailForm.mailNotifyEnabled ? 'settings-status settings-status--ok' : 'settings-status settings-status--warn'}>
            {mailForm.mailNotifyEnabled ? '已启用' : '未启用'}
          </div>
        </div>

        <form className="settings-form settings-form--polished" onSubmit={saveMailSettings}>
          <div className="mail-help">
            <strong>通知规则</strong>
            <span>管理员配置 SMTP 后，文章发送成功时，系统会把通知发到当前会员自己填写的邮箱。会员不需要配置 SMTP。</span>
          </div>

          <div className="settings-grid mail-config-grid">
            <div className="model-config-card">
              <div className="model-card-title">
                <Globe2 size={20} />
                <div>
                  <strong>SMTP 服务器</strong>
                  <span>填写邮箱服务商提供的 SMTP 参数</span>
                </div>
              </div>
              <label className="check-row model-check-row">
                <input
                  type="checkbox"
                  checked={mailForm.mailNotifyEnabled}
                  onChange={(event) => setMailForm({ ...mailForm, mailNotifyEnabled: event.target.checked })}
                />
                发送文章成功后启用邮件通知
              </label>
              <label>SMTP 地址</label>
              <input value={mailForm.smtpHost} onChange={(event) => setMailForm({ ...mailForm, smtpHost: event.target.value })} placeholder="例如：smtp.qq.com" />
              <div className="dual-field">
                <div>
                  <label>端口</label>
                  <input type="number" value={mailForm.smtpPort} onChange={(event) => setMailForm({ ...mailForm, smtpPort: event.target.value })} placeholder="465" />
                </div>
                <label className="check-row mail-secure-row">
                  <input
                    type="checkbox"
                    checked={mailForm.smtpSecure}
                    onChange={(event) => setMailForm({ ...mailForm, smtpSecure: event.target.checked })}
                  />
                  SSL/TLS
                </label>
              </div>
            </div>

            <div className="model-config-card model-config-card--accent">
              <div className="model-card-title">
                <LogIn size={20} />
                <div>
                  <strong>发件账号</strong>
                  <span>授权码不修改可留空</span>
                </div>
              </div>
              <label>SMTP 用户名</label>
              <input value={mailForm.smtpUser} onChange={(event) => setMailForm({ ...mailForm, smtpUser: event.target.value })} placeholder="通常是发件邮箱" />
              <label>SMTP 密码/授权码</label>
              <input
                type="password"
                value={mailForm.smtpPass}
                onChange={(event) => setMailForm({ ...mailForm, smtpPass: event.target.value })}
                placeholder={user?.hasSmtpPass ? '已保存授权码，不修改可留空' : '请输入 SMTP 授权码'}
              />
              <label>发件人邮箱</label>
              <input value={mailForm.smtpFrom} onChange={(event) => setMailForm({ ...mailForm, smtpFrom: event.target.value })} placeholder="例如：notice@example.com" />
            </div>
          </div>

          {(mailError || mailMessage) && <p className={mailError ? 'form-error settings-message' : 'form-success settings-message'}>{mailError || mailMessage}</p>}

          <div className="settings-actions model-save-row">
            <div className="helper-text">测试邮件会发送到管理员账号邮箱；未填写时使用发件人邮箱。</div>
            <button type="button" className="secondary-action" onClick={testMail} disabled={testingMail || savingMail}>
              {testingMail ? <Loader2 className="spin" size={18} /> : <Globe2 size={18} />}
              发送测试邮件
            </button>
            <button className="primary-action" type="submit" disabled={savingMail}>
              {savingMail ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
              保存邮件配置
            </button>
          </div>
        </form>
      </section>
    )}
    </>
  );
}

function AddSiteModal({ onClose, onAdd, initialSite }) {
  const [form, setForm] = useState({
    id: initialSite?.id || '',
    name: initialSite?.name || '',
    domain: initialSite?.domain || '',
    cms: initialSite?.cms || 'PbootCMS v2.1',
    pbootApiUrl: initialSite?.pbootApiUrl || '',
    pbootToken: '',
    pbootCategoryId: initialSite?.pbootCategoryId || '',
    pbootCategoryName: initialSite?.pbootCategoryName || '',
  });
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const categoryOptions = useMemo(() => flattenCategories(categories), [categories]);

  async function loadCategories() {
    setError('');
    setLoadingCategories(true);
    try {
      const data = await api('/api/pboot/categories', {
        method: 'POST',
        body: JSON.stringify({
          siteId: initialSite?.id,
          pbootApiUrl: form.pbootApiUrl,
          pbootToken: form.pbootToken,
        }),
      });
      setCategories(data.categories || []);
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoadingCategories(false);
    }
  }

  function chooseCategory(value) {
    const category = categoryOptions.find((item) => item.id === value);
    setForm({
      ...form,
      pbootCategoryId: value,
      pbootCategoryName: category?.rawName || '',
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const domain = normalizeDomain(form.domain);
    if (!form.name || !domain) {
      setError('请填写站点名称和网站地址');
      return;
    }
    await onAdd({ ...form, domain });
    onClose();
  }

  return (
    <ModalLayer>
      <div className="modal-backdrop">
      <form className="modal modal--wide" onSubmit={handleSubmit}>
        <div className="modal-heading">
          <h2>{initialSite ? '编辑站点' : '添加站点'}</h2>
          <button type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <label>站点名称</label>
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：某某公司官网" />

        <label>网站地址</label>
        <input value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })} placeholder="https://www.example.com" />

        <label>CMS 类型</label>
        <select value={form.cms} onChange={(event) => setForm({ ...form, cms: event.target.value })}>
          <option>PbootCMS v2.1</option>
          <option>PbootCMS</option>
          <option>WordPress</option>
          <option>自定义 API</option>
          <option>静态站点</option>
        </select>

        <label>PbootCMS 发布接口地址</label>
        <input
          value={form.pbootApiUrl}
          onChange={(event) => setForm({ ...form, pbootApiUrl: event.target.value })}
          placeholder="例如：https://www.example.com/aigou-publish.php"
        />

        <label>PbootCMS 接口 Token</label>
        <input
          type="password"
          value={form.pbootToken}
          onChange={(event) => setForm({ ...form, pbootToken: event.target.value })}
          placeholder={initialSite?.hasPbootToken ? '已保存 Token，不修改可留空' : '建议设置高强度 Token'}
        />

        <div className="label-row">
          <label>PbootCMS 发布栏目</label>
          <button type="button" onClick={loadCategories} disabled={loadingCategories}>
            {loadingCategories ? '读取中...' : '读取目标站栏目'}
          </button>
        </div>

        {categoryOptions.length > 0 ? (
          <select value={form.pbootCategoryId} onChange={(event) => chooseCategory(event.target.value)}>
            <option value="">请选择栏目</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} (ID: {category.id})
              </option>
            ))}
          </select>
        ) : (
          <input
            value={form.pbootCategoryId}
            onChange={(event) => setForm({ ...form, pbootCategoryId: event.target.value, pbootCategoryName: '' })}
            placeholder="读取失败时可手动填写栏目 ID，例如：1"
          />
        )}

        {form.pbootCategoryName && <div className="wizard-note">当前选择：{form.pbootCategoryName}</div>}
        {error && <p className="form-error">{error}</p>}

        <button className="primary-action" type="submit">
          保存配置
        </button>
      </form>
      </div>
    </ModalLayer>
  );
}

function SideWidgets({ articles, logs, schedules }) {
  return (
    <aside className="right-column">
      <section className="section-card compact-card">
        <div className="section-heading">
          <div>
            <p>最近文章</p>
            <h2>内容概览</h2>
          </div>
        </div>
        <div className="article-list">
          {articles.slice(0, 3).map((article) => (
            <article key={article.id}>
              <strong>{article.title}</strong>
              <span>{article.tag}</span>
              <em>{displayArticleStatus(article.status)}</em>
            </article>
          ))}
        </div>
        {articles.length === 0 && <p className="empty-state">暂无文章。</p>}
      </section>

      <section className="section-card compact-card">
        <div className="section-heading">
          <div>
            <p>任务状态</p>
            <h2>定时队列</h2>
          </div>
        </div>
        <div className="article-list">
          {schedules.slice(0, 3).map((schedule) => (
            <article key={schedule.id}>
              <strong>{schedule.name}</strong>
              <span>{displayScheduleStatus(schedule.status)}</span>
              <em>已发送 {schedule.generatedCount} / {schedule.targetCount} 篇</em>
            </article>
          ))}
        </div>
        {schedules.length === 0 && <p className="empty-state">暂无定时任务。</p>}
      </section>

      <LogsView logs={logs.slice(0, 3)} />
    </aside>
  );
}

function App() {
  const [activeView, setActiveView] = useState('sites');
  const [sites, setSites] = useState([]);
  const [articles, setArticles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [images, setImages] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [anchors, setAnchors] = useState([]);
  const [forbiddenWords, setForbiddenWords] = useState([]);
  const [members, setMembers] = useState([]);
  const [user, setUser] = useState(null);
  const [branding, setBranding] = useState(defaultBranding);
  const [ads, setAds] = useState([]);
  const [payment, setPayment] = useState({ enabled: false, plans: [] });
  const [paymentOrders, setPaymentOrders] = useState([]);
  const [storage, setStorage] = useState('json');
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [error, setError] = useState('');
  const [publishError, setPublishError] = useState('');
  const [editingSite, setEditingSite] = useState(null);
  const [bridgeSite, setBridgeSite] = useState(null);
  const [anchorSite, setAnchorSite] = useState(null);
  const [statsSite, setStatsSite] = useState(null);
  const [showAddSite, setShowAddSite] = useState(false);
  const [authMode, setAuthMode] = useState(null);

  const currentView = useMemo(() => viewMeta[activeView] || viewMeta.sites, [activeView]);
  const showWidgets = activeView === 'sites';

  async function loadData(options = {}) {
    const silent = Boolean(options.silent);
    if (!silent) setLoading(true);
    try {
      const data = await api('/api/bootstrap');
      setSites(data.sites || []);
      setArticles(data.articles || []);
      setLogs(data.logs || []);
      setImages(data.images || []);
      setSchedules(data.schedules || []);
      setAnchors(data.anchors || []);
      setForbiddenWords(data.forbiddenWords || []);
      setMembers(data.members || []);
      setUser(data.user || null);
      setBranding(data.branding || defaultBranding);
      setAds(data.ads || []);
      setPayment(data.payment || { enabled: false, plans: [] });
      setPaymentOrders(data.paymentOrders || []);
      setStorage(data.storage || 'json');
      setError('');
      setIsAuthed(true);
    } catch (apiError) {
      if (apiError.status === 401) {
        setIsAuthed(false);
      } else {
        setError(apiError.message);
      }
    } finally {
      if (!silent) setLoading(false);
      setAuthChecked(true);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isAuthed) return undefined;
    const timer = window.setInterval(() => {
      loadData({ silent: true }).catch(() => {});
    }, 15000);
    return () => window.clearInterval(timer);
  }, [isAuthed]);

  useEffect(() => {
    api('/api/public/branding')
      .then((data) => setBranding(data.branding || defaultBranding))
      .catch(() => {});
    api('/api/public/ads')
      .then((data) => setAds(data.ads || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.title = `${branding.siteName || defaultBranding.siteName} ${branding.subtitle || defaultBranding.subtitle}`;
  }, [branding.siteName, branding.subtitle]);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setIsAuthed(false);
    setUser(null);
    setAuthMode(null);
  }

  async function handleAuthSuccess() {
    setAuthMode(null);
    await loadData();
  }

  async function saveSite(site) {
    await api('/api/sites', {
      method: 'POST',
      body: JSON.stringify(site),
    });
    await loadData();
  }

  async function deleteSite(id) {
    if (!window.confirm('确定删除这个站点配置吗？')) return;
    await api(`/api/sites/${id}`, { method: 'DELETE' });
    await loadData();
  }

  async function syncSite(id) {
    await api(`/api/sites/${id}/sync`, { method: 'POST' });
    await loadData();
  }

  async function publishArticleById(id) {
    setPublishError('');
    try {
      await api(`/api/articles/${id}/publish`, { method: 'POST' });
    } catch (apiError) {
      setPublishError(apiError.message);
    }
    await loadData();
  }

  async function deleteArticleById(id) {
    await api(`/api/articles/${id}`, { method: 'DELETE' });
    await loadData();
  }

  async function deleteArticlesByIds(ids) {
    await api('/api/articles/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    await loadData();
  }

  async function handleModelSaved(nextUser) {
    setUser(nextUser);
    await loadData();
  }

  function handleBrandingSaved(nextBranding) {
    setBranding(nextBranding || defaultBranding);
  }

  function handleAdsChanged(nextAds) {
    setAds(nextAds || []);
  }

  function handlePaymentSaved(nextPayment) {
    setPayment(nextPayment || { enabled: false, plans: [] });
  }

  async function refreshPaymentOrders() {
    const data = await api('/api/payment/orders');
    setPaymentOrders(data.orders || []);
    await loadData({ silent: true });
  }

  async function saveSchedule(schedule) {
    await api('/api/schedules', {
      method: 'POST',
      body: JSON.stringify(schedule),
    });
    await loadData();
  }

  async function deleteSchedule(id) {
    if (!window.confirm('确定删除这个定时任务吗？')) return;
    await api(`/api/schedules/${id}`, { method: 'DELETE' });
    await loadData();
  }

  async function toggleSchedule(id, active) {
    await api(`/api/schedules/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ active }),
    });
    await loadData();
  }

  async function runScheduleNow(id) {
    await api(`/api/schedules/${id}/run`, { method: 'POST' });
    await loadData();
  }

  async function saveForbiddenWords(item) {
    await api('/api/forbidden-words', {
      method: 'POST',
      body: JSON.stringify(item),
    });
    await loadData();
  }

  async function deleteForbiddenWordsById(id) {
    if (!window.confirm('确定删除这个违禁词分类吗？')) return;
    await api(`/api/forbidden-words/${id}`, { method: 'DELETE' });
    await loadData();
  }

  async function refreshMembers() {
    const data = await api('/api/admin/members');
    setMembers(data.members || []);
  }

  function renderMainView() {
    if (loading) {
      return <PlaceholderView title="正在加载" description="正在读取后台数据..." />;
    }
    if (error) {
      return <PlaceholderView title="后端未连接" description={error} />;
    }
    if (activeView === 'generator') {
      return <ArticleGenerator sites={sites} user={user} onGenerated={loadData} />;
    }
    if (activeView === 'schedules') {
      return <SchedulesView schedules={schedules} sites={sites} onSave={saveSchedule} onDelete={deleteSchedule} onToggle={toggleSchedule} onRun={runScheduleNow} />;
    }
    if (activeView === 'articles') {
      return <ArticlesView articles={articles} onPublish={publishArticleById} onDelete={deleteArticleById} onBatchDelete={deleteArticlesByIds} publishError={publishError} />;
    }
    if (activeView === 'logs') {
      return <LogsView logs={logs} />;
    }
    if (activeView === 'images') {
      return <ImageManager images={images} onUploaded={loadData} />;
    }
    if (activeView === 'forbidden') {
      return <ForbiddenWordsView items={forbiddenWords} onSave={saveForbiddenWords} onDelete={deleteForbiddenWordsById} />;
    }
    if (activeView === 'recharge') {
      return <RechargeView user={user} payment={payment} orders={paymentOrders} onCreated={loadData} onRefresh={refreshPaymentOrders} />;
    }
    if (activeView === 'members') {
      if (!user?.isAdmin) return <PlaceholderView title="无权访问" description="只有管理员账号可以管理会员。" />;
      return <MembersView members={members} onRefresh={refreshMembers} />;
    }
    if (activeView === 'settings') {
      return <ModelSettingsView user={user} branding={branding} ads={ads} payment={payment} onSaved={handleModelSaved} onBrandingSaved={handleBrandingSaved} onAdsChanged={handleAdsChanged} onPaymentSaved={handlePaymentSaved} />;
    }
    return (
      <>
        <DashboardStats sites={sites} articles={articles} logs={logs} schedules={schedules} />
        <SiteManagement
          sites={sites}
          articles={articles}
          anchors={anchors}
          logs={logs}
          onOpenAdd={() => setShowAddSite(true)}
          onOpenEdit={(site) => setEditingSite(site)}
          onOpenBridge={(site) => setBridgeSite(site)}
          onOpenAnchors={(site) => setAnchorSite(site)}
          onOpenStats={(site) => setStatsSite(site)}
          onDelete={deleteSite}
          onSync={syncSite}
        />
      </>
    );
  }

  if (!authChecked) {
    return <PlaceholderView title="正在检查登录状态" description="请稍候..." />;
  }

  if (!isAuthed) {
    if (authMode) {
      return <LoginView initialMode={authMode} onAuthSuccess={handleAuthSuccess} onBack={() => setAuthMode(null)} branding={branding} />;
    }
    return <LandingPage onLogin={() => setAuthMode('login')} onRegister={() => setAuthMode('register')} branding={branding} ads={ads} />;
  }

  return (
    <div className="app">
      <Sidebar activeView={activeView} onChange={setActiveView} branding={branding} user={user} />
      <main className="main">
        <header className="topbar">
          <div>
            <p>{currentView.eyebrow} · {storage === 'mysql' ? 'MySQL 存储' : 'JSON 存储'}</p>
            <h1>{currentView.title}</h1>
            <span className="topbar-description">{currentView.description}</span>
          </div>
          <div className="account">
            <div className="account-meta">
              <strong>当前账号</strong>
              <span>{user?.username || 'guest'} · {displayMembership(user)}</span>
            </div>
            <div className="avatar">{(user?.username || 'A').slice(0, 1).toUpperCase()}</div>
            <button className="logout-button" onClick={logout} title="退出登录">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className={showWidgets ? 'content-grid' : 'content-grid content-grid--single'}>
          <div className="left-flow">{renderMainView()}</div>
          {showWidgets && <SideWidgets articles={articles} logs={logs} schedules={schedules} />}
        </div>
        <CopyrightNotice />
      </main>

      {showAddSite && <AddSiteModal onClose={() => setShowAddSite(false)} onAdd={saveSite} />}
      {editingSite && <AddSiteModal initialSite={editingSite} onClose={() => setEditingSite(null)} onAdd={saveSite} />}
      {bridgeSite && <BridgeWizard site={bridgeSite} onClose={() => setBridgeSite(null)} onSave={saveSite} />}
      {anchorSite && <AnchorModal site={anchorSite} onClose={() => setAnchorSite(null)} onChanged={() => loadData({ silent: true })} />}
      {statsSite && (
        <SiteStatsModal
          site={statsSite}
          articles={articles}
          anchors={anchors}
          logs={logs}
          onClose={() => setStatsSite(null)}
          onOpenAnchors={(site) => setAnchorSite(site)}
          onNavigate={setActiveView}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
