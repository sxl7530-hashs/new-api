/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { lazy, Suspense, useContext, useEffect, useMemo } from 'react';
import { Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Loading from './components/common/ui/Loading';
import User from './pages/User';
import { AuthRedirect, PrivateRoute, AdminRoute } from './helpers';
import RegisterForm from './components/auth/RegisterForm';
import LoginForm from './components/auth/LoginForm';
import NotFound from './pages/NotFound';
import Forbidden from './pages/Forbidden';
import Setting from './pages/Setting';
import { StatusContext } from './context/Status';

import PasswordResetForm from './components/auth/PasswordResetForm';
import PasswordResetConfirm from './components/auth/PasswordResetConfirm';
import Channel from './pages/Channel';
import Token from './pages/Token';
import Redemption from './pages/Redemption';
import TopUp from './pages/TopUp';
import Log from './pages/Log';
import Midjourney from './pages/Midjourney';
import Pricing from './pages/Pricing';
import Task from './pages/Task';
import Subscription from './pages/Subscription';
import OAuth2Callback from './components/auth/OAuth2Callback';
import PersonalSetting from './components/settings/PersonalSetting';
import Setup from './pages/Setup';
import SetupCheck from './components/layout/SetupCheck';
import { faqItems as faqStructuredItems } from './pages/Faq';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const About = lazy(() => import('./pages/About'));
const UserAgreement = lazy(() => import('./pages/UserAgreement'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const Faq = lazy(() => import('./pages/Faq'));

const PAGE_SEO_META = {
  '/': {
    title: 'new-api - AI 网关聚合与分发平台',
    description:
      '统一的 AI 模型聚合与分发网关，支持 OpenAI、Claude、Gemini 兼容接口，提供个人与企业级模型管理与调用能力。',
    keywords:
      'new-api, AI 网关, OpenAI 兼容, Claude 兼容, Gemini 兼容, LLM 聚合, API Gateway',
    ogDescription:
      '统一的 AI 模型聚合与分发网关，支持 OpenAI、Claude、Gemini 兼容接口。',
    ogType: 'website',
    noindex: false,
  },
  '/pricing': {
    title: '定价 - new-api AI 模型网关',
    description:
      '查看 new-api AI 网关的定价方案与套餐，支持多模型接入与弹性额度管理。',
    keywords: 'new-api 定价, AI 网关 套餐, 额度套餐',
    ogDescription: '查看 new-api AI 网关的定价与额度方案。',
    ogType: 'website',
    noindex: false,
  },
  '/about': {
    title: '关于 new-api - AI 模型网关平台',
    description:
      '了解 new-api 的 AI 模型聚合能力、OpenAI/Claude/Gemini 兼容方案以及项目设计目标。',
    keywords: 'new-api 关于, AI 网关 平台介绍, API 聚合',
    ogDescription: '了解 new-api 的能力定位与平台设计目标。',
    ogType: 'website',
    noindex: false,
  },
  '/faq': {
    title: 'FAQ - new-api 常见问题',
    description:
      'new-api 使用常见问题，涵盖 OpenAI 兼容、Claude/Gemini 接入、订阅与额度、接口稳定性与故障排查。',
    keywords: 'new-api FAQ, AI网关 常见问题, OpenAI兼容 接口, LLM网关 使用指南',
    ogDescription:
      '查看 new-api 常见问题，快速解决接入、鉴权、额度与部署中的问题。',
    ogType: 'website',
    noindex: false,
  },
  '/setup': {
    title: '初始化设置 - new-api',
    description: '完成 new-api 部署后的初始化设置，创建管理员并完成服务启动。',
    keywords: 'new-api 初始化, 系统初始化, 部署',
    ogDescription: '完成 new-api 的初始化设置。',
    ogType: 'website',
    noindex: true,
  },
  '/forbidden': {
    title: '无权限访问 - new-api',
    description: '当前用户无访问权限，建议联系管理员确认账户权限。',
    keywords: 'new-api 无权限, 权限不足',
    ogDescription: '当前用户无访问权限的提示页面。',
    ogType: 'website',
    noindex: true,
  },
  '/login': {
    title: '用户登录 - new-api',
    description: '登录 new-api 账户，管理模型渠道、用户与账务。',
    keywords: 'new-api 登录, 用户登录',
    ogDescription: 'new-api 用户登录页面。',
    ogType: 'website',
    noindex: true,
  },
  '/register': {
    title: '用户注册 - new-api',
    description: '注册 new-api 账号，开启 AI 网关与模型管理服务。',
    keywords: 'new-api 注册, 新用户注册',
    ogDescription: 'new-api 用户注册页面。',
    ogType: 'website',
    noindex: true,
  },
  '/reset': {
    title: '重置密码 - new-api',
    description: '通过注册邮箱重置登录密码。',
    keywords: 'new-api 重置密码, 忘记密码',
    ogDescription: '重置 new-api 登录密码。',
    ogType: 'website',
    noindex: true,
  },
  '/user/reset': {
    title: '密码重设确认 - new-api',
    description: '设置新密码并完成身份校验流程。',
    keywords: 'new-api 密码重设, 验证链接',
    ogDescription: '密码重设确认页。',
    ogType: 'website',
    noindex: true,
  },
  '/console': {
    title: '控制台 - new-api',
    description: 'new-api 系统控制台首页，包含渠道、用户与账单运维面板入口。',
    keywords: 'new-api 控制台, AI 网关 运维',
    ogDescription: 'new-api 后台管理控制台。',
    ogType: 'website',
    noindex: true,
  },
  '/console/channel': {
    title: '渠道管理 - new-api',
    description: '管理渠道密钥、优先级、权重与重试策略，查看渠道评分与健康状态。',
    keywords: 'new-api 渠道管理, 渠道评分, AI 模型网关',
    ogDescription: 'new-api 渠道管理，支持按分组/模型管理渠道并查看评分。',
    ogType: 'website',
    noindex: true,
  },
  '/console/user': {
    title: '用户管理 - new-api',
    description: '管理平台用户、订阅与账号状态。',
    keywords: 'new-api 用户管理, AI 网关 用户',
    ogDescription: 'new-api 用户与账号管理。',
    ogType: 'website',
    noindex: true,
  },
  '/console/token': {
    title: 'Token 管理 - new-api',
    description: '管理 API Token、配额与访问密钥配置。',
    keywords: 'new-api Token 管理, API Token',
    ogDescription: 'new-api Token 管理页。',
    ogType: 'website',
    noindex: true,
  },
  '/console/subscription': {
    title: '订阅管理 - new-api',
    description: '查看和调整用户订阅、套餐与分组权限。',
    keywords: 'new-api 订阅管理, 套餐管理',
    ogDescription: 'new-api 订阅与套餐管理。',
    ogType: 'website',
    noindex: true,
  },
  '/console/redemption': {
    title: '兑换管理 - new-api',
    description: '管理兑换码与充值订单处理。',
    keywords: 'new-api 兑换码, 充值订单',
    ogDescription: 'new-api 兑换码与充值管理。',
    ogType: 'website',
    noindex: true,
  },
  '/console/log': {
    title: '请求日志 - new-api',
    description: '查看接口调用日志、错误记录与运维排障信息。',
    keywords: 'new-api 日志, 接口日志, 运营数据',
    ogDescription: 'new-api 日志与排障信息。',
    ogType: 'website',
    noindex: true,
  },
  '/console/topup': {
    title: '充值记录 - new-api',
    description: '查看充值记录与账务信息。',
    keywords: 'new-api 充值, 账务',
    ogDescription: 'new-api 充值与账务记录页面。',
    ogType: 'website',
    noindex: true,
  },
  '/console/task': {
    title: '任务监控 - new-api',
    description: '查看异步任务状态、耗时与执行结果。',
    keywords: 'new-api 任务监控, AI 网关 任务',
    ogDescription: 'new-api 任务中心。',
    ogType: 'website',
    noindex: true,
  },
  '/console/setting': {
    title: '系统设置 - new-api',
    description: '配置系统参数、路由、计费与安全策略。',
    keywords: 'new-api 系统设置, AI 网关 配置',
    ogDescription: 'new-api 管理端设置页面。',
    ogType: 'website',
    noindex: true,
  },
  '/console/personal': {
    title: '个人设置 - new-api',
    description: '更新个人信息与安全设置。',
    keywords: 'new-api 个人设置, 账户管理',
    ogDescription: 'new-api 个人设置。',
    ogType: 'website',
    noindex: true,
  },
  '/user-agreement': {
    title: '用户协议 - new-api',
    description: 'new-api 用户协议。',
    keywords: 'new-api 用户协议, 服务条款',
    ogDescription: '查看 new-api 用户协议与使用规则。',
    ogType: 'article',
    noindex: false,
  },
  '/privacy-policy': {
    title: '隐私政策 - new-api',
    description: 'new-api 隐私政策。',
    keywords: 'new-api 隐私政策, 数据保护',
    ogDescription: '查看 new-api 隐私政策及数据处理说明。',
    ogType: 'article',
    noindex: false,
  },
};

const PAGE_BREADCRUMB_ITEMS = {
  '/': [{ name: '首页', path: '/' }],
  '/pricing': [
    { name: '首页', path: '/' },
    { name: '定价', path: '/pricing' },
  ],
  '/about': [
    { name: '首页', path: '/' },
    { name: '关于', path: '/about' },
  ],
  '/faq': [
    { name: '首页', path: '/' },
    { name: 'FAQ', path: '/faq' },
  ],
  '/user-agreement': [
    { name: '首页', path: '/' },
    { name: '用户协议', path: '/user-agreement' },
  ],
  '/privacy-policy': [
    { name: '首页', path: '/' },
    { name: '隐私政策', path: '/privacy-policy' },
  ],
  '/console/channel': [
    { name: '首页', path: '/' },
    { name: '控制台', path: '/console' },
    { name: '渠道管理', path: '/console/channel' },
  ],
};

const SEO_HREFLANG_ALTERNATES = [
  { code: 'x-default' },
  { code: 'zh-CN' },
  { code: 'en' },
  { code: 'en-US' },
  { code: 'zh-TW' },
  { code: 'fr' },
  { code: 'ru' },
  { code: 'ja' },
  { code: 'vi' },
];

const normalizeMetaLanguage = (language) => {
  if (!language) {
    return 'zh-CN';
  }

  const lower = language.toLowerCase();
  if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-hans' || lower === 'zh-hant') {
    return 'zh-TW';
  }

  if (lower.startsWith('zh')) {
    return 'zh-CN';
  }

  if (lower === 'en' || lower === 'en-us' || lower === 'en_gb') {
    return 'en';
  }

  return language;
};

const toOgLocale = (language) => {
  const normalized = normalizeMetaLanguage(language);
  switch (normalized) {
    case 'zh-CN':
      return 'zh_CN';
    case 'en':
      return 'en_US';
    case 'zh-TW':
      return 'zh_TW';
    case 'fr':
      return 'fr_FR';
    case 'ru':
      return 'ru_RU';
    case 'ja':
      return 'ja_JP';
    case 'vi':
      return 'vi_VN';
    default:
      return `${normalized.replace('_', '-').replace('-', '_')}`;
  }
};

const toCanonicalPath = (path) => {
  if (!path || path === '/') {
    return '/';
  }
  return path.replace(/\/+$/, '') || '/';
};

const syncMetaTag = (selector, attributes) => {
  const existing = document.querySelector(selector);
  if (!existing) {
    const tag = document.createElement(
      selector.startsWith('link[') ? 'link' : 'meta',
    );
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        tag.setAttribute(key, value);
      }
    });
    document.head.appendChild(tag);
    return;
  }
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      existing.setAttribute(key, value);
    }
  });
};

const getPageSeoMeta = (pathname) => {
  if (PAGE_SEO_META[pathname]) {
    return PAGE_SEO_META[pathname];
  }

  if (
    pathname === '/forbidden' ||
    pathname === '/setup' ||
    pathname === '/setup/' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/reset' ||
    pathname === '/user/reset' ||
    pathname.startsWith('/oauth/') ||
    pathname.startsWith('/console')
  ) {
    return {
      title: 'new-api',
      description: 'new-api - AI 模型网关聚合与分发平台。',
      keywords: 'new-api, AI 网关',
      noindex: true,
    };
  }

  return {
    title: 'new-api',
    description:
      '统一的 AI 模型聚合与分发网关，支持 OpenAI、Claude、Gemini 兼容接口。',
    keywords: 'new-api, AI 网关, LLM',
    noindex: true,
  };
};

const buildLocalizedCanonical = (canonicalPath, hreflang) => {
  if (!canonicalPath || typeof window === 'undefined') {
    return canonicalPath || '/';
  }

  if (hreflang === 'x-default') {
    return `${window.location.origin}${canonicalPath}`;
  }

  const localeTag = hreflang.toLowerCase();
  const hasRegion = localeTag.includes('-');
  const param =
    localeTag === 'zh-cn' || localeTag === 'zh-tw'
      ? localeTag
      : hasRegion
        ? localeTag.split('-')[0]
        : localeTag;

  const url = new URL(`${window.location.origin}${canonicalPath}`);
  url.searchParams.set('hl', param);
  return url.toString();
};

const getSeoAlternateLinks = (canonicalPath) => {
  return SEO_HREFLANG_ALTERNATES.map((item) => ({
    rel: 'alternate',
    hreflang: item.code,
    href: buildLocalizedCanonical(canonicalPath, item.code),
  }));
};

const buildJsonLd = (meta, canonicalUrl, canonicalPath, lang = 'zh-CN') => {
  const websiteUrl = (() => {
    try {
      return new URL(canonicalUrl).origin;
    } catch (e) {
      return canonicalUrl;
    }
  })();

  const baseWebsite = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'new-api',
    alternateName: 'newapi',
    url: websiteUrl,
    inLanguage: lang,
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'new-api',
    url: websiteUrl,
    logo: `${websiteUrl}/logo.png`,
  };

  const webPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: meta.title,
    description: meta.description,
    url: canonicalUrl,
    inLanguage: lang,
    isPartOf: baseWebsite,
  };

  const breadcrumbItems = PAGE_BREADCRUMB_ITEMS[canonicalPath];
  const breadcrumbs = (() => {
    if (!breadcrumbItems || breadcrumbItems.length === 0) {
      return null;
    }

    const itemListElement = breadcrumbItems.map((item, index) => {
      const itemUrl = `${websiteUrl}${item.path}`;

      return {
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: itemUrl,
      };
    });

    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement,
    };
  })();

  const withBreadcrumb = (schema) => {
    return breadcrumbs ? { ...schema, breadcrumb: breadcrumbs } : schema;
  };

  let contentSchema;

  if (canonicalPath === '/faq') {
    const mainEntity = faqStructuredItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    }));

    contentSchema = {
      ...webPageJsonLd,
      '@type': 'FAQPage',
      mainEntity,
    };
  } else if (canonicalPath === '/pricing') {
    contentSchema = {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: meta.title,
      description: meta.description,
      provider: {
        '@type': 'Organization',
        name: 'new-api',
      },
      url: canonicalUrl,
    };
  } else if (canonicalPath === '/about') {
    contentSchema = {
      ...webPageJsonLd,
      '@type': 'AboutPage',
    };
  } else if (
    canonicalPath === '/user-agreement' ||
    canonicalPath === '/privacy-policy'
  ) {
    const publisher = {
      '@type': 'Organization',
      name: 'new-api',
    };

    contentSchema = {
      ...webPageJsonLd,
      '@type': 'Article',
      headline: meta.title,
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': canonicalUrl,
      },
      author: publisher,
      publisher,
    };
  } else {
    contentSchema = canonicalPath === '/'
      ? {
          '@type': 'WebApplication',
          name: meta.title,
          applicationCategory: 'BusinessApplication',
          description: meta.description,
          operatingSystem: 'Web',
          offers: {
            '@type': 'Offer',
            name: 'AI 网关聚合与分发服务',
            priceCurrency: 'CNY',
            price: '0',
            availability: 'https://schema.org/InStock',
          },
          ...webPageJsonLd,
        }
      : {
          ...webPageJsonLd,
        };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [baseWebsite, organizationSchema, withBreadcrumb(contentSchema)],
  };
};

const getQueryLanguage = () => {
  try {
    const search = new URLSearchParams(window.location.search);
    const hl = search.get('hl');
    if (!hl) {
      return '';
    }
    return normalizeMetaLanguage(hl);
  } catch (error) {
    return '';
  }
};

const removeMetaTag = (selector) => {
  const all = document.querySelectorAll(selector);
  all.forEach((item) => {
    item.remove();
  });
};

const syncJsonLd = (jsonLdData) => {
  const scriptId = 'seo-jsonld';
  const existing = document.getElementById(scriptId);
  if (!jsonLdData) {
    if (existing) {
      existing.remove();
    }
    return;
  }
  if (!existing) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = scriptId;
    script.text = JSON.stringify(jsonLdData, null, 2);
    document.head.appendChild(script);
    return;
  }
  existing.text = JSON.stringify(jsonLdData, null, 2);
};

function DynamicOAuth2Callback() {
  const { provider } = useParams();
  return <OAuth2Callback type={provider} />;
}

function App() {
  const location = useLocation();
  const [statusState] = useContext(StatusContext);
  const { i18n } = useTranslation();

  // 获取模型广场权限配置
  const pricingRequireAuth = useMemo(() => {
    const headerNavModulesConfig = statusState?.status?.HeaderNavModules;
    if (headerNavModulesConfig) {
      try {
        const modules = JSON.parse(headerNavModulesConfig);

        // 处理向后兼容性：如果pricing是boolean，默认不需要登录
        if (typeof modules.pricing === 'boolean') {
          return false; // 默认不需要登录鉴权
        }

        // 如果是对象格式，使用requireAuth配置
        return modules.pricing?.requireAuth === true;
      } catch (error) {
        console.error('解析顶栏模块配置失败:', error);
        return false; // 默认不需要登录
      }
    }
    return false; // 默认不需要登录
  }, [statusState?.status?.HeaderNavModules]);

  useEffect(() => {
    const canonicalPath = toCanonicalPath(location.pathname);
    const queryLang = getQueryLanguage();
    if (queryLang && i18n?.language !== queryLang) {
      i18n.changeLanguage(queryLang);
    }

    const meta = getPageSeoMeta(canonicalPath);
    const robots = meta.noindex ? 'noindex,nofollow' : 'index,follow';
    const canonical = `${window.location.origin}${canonicalPath}`;
    const canonicalKey = canonicalPath || '/';
    const imageCanonical = `${window.location.origin}/logo.png`;
    const alternateLinks = getSeoAlternateLinks(canonicalPath);
    const normalizedLang = normalizeMetaLanguage(queryLang || i18n?.language);
    const ogLocale = toOgLocale(normalizedLang);
    const ogAlternateLocale = normalizedLang === 'zh-CN' ? 'en_US' : 'zh_CN';
    const jsonLd = meta.noindex
      ? null
      : buildJsonLd(meta, canonical, canonicalKey, normalizedLang);

    document.documentElement.setAttribute('lang', normalizedLang);

    document.title = meta.title;
    syncMetaTag('meta[name="description"]', {
      name: 'description',
      content: meta.description,
    });
    syncMetaTag('meta[name="keywords"]', {
      name: 'keywords',
      content: meta.keywords,
    });
    syncMetaTag('meta[name="robots"]', {
      name: 'robots',
      content: robots,
    });
    syncMetaTag('link[rel="canonical"]', {
      rel: 'canonical',
      href: canonical,
    });
    syncMetaTag('meta[property="og:title"]', {
      property: 'og:title',
      content: meta.title,
    });
    syncMetaTag('meta[property="og:description"]', {
      property: 'og:description',
      content: meta.ogDescription || meta.description,
    });
    syncMetaTag('meta[property="og:type"]', {
      property: 'og:type',
      content: meta.ogType || 'website',
    });
    syncMetaTag('meta[property="og:site_name"]', {
      property: 'og:site_name',
      content: 'new-api',
    });
    syncMetaTag('meta[property="og:locale"]', {
      property: 'og:locale',
      content: ogLocale,
    });
    syncMetaTag('meta[property="og:locale:alternate"]', {
      property: 'og:locale:alternate',
      content: ogAlternateLocale,
    });
    syncMetaTag('meta[name="language"]', {
      name: 'language',
      content: normalizedLang,
    });
    syncMetaTag('meta[property="og:url"]', {
      property: 'og:url',
      content: canonical,
    });
    syncMetaTag('meta[property="og:image"]', {
      property: 'og:image',
      content: imageCanonical,
    });
    syncMetaTag('meta[name="twitter:site"]', {
      name: 'twitter:site',
      content: '@new_api',
    });
    syncMetaTag('meta[name="twitter:creator"]', {
      name: 'twitter:creator',
      content: '@new_api',
    });
    syncMetaTag('meta[name="twitter:title"]', {
      name: 'twitter:title',
      content: meta.title,
    });
    syncMetaTag('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: meta.ogDescription || meta.description,
    });
    syncMetaTag('meta[name="twitter:image"]', {
      name: 'twitter:image',
      content: imageCanonical,
    });
    syncMetaTag('meta[name="twitter:card"]', {
      name: 'twitter:card',
      content: 'summary_large_image',
    });
    syncMetaTag('meta[property="og:image:width"]', {
      property: 'og:image:width',
      content: '1200',
    });
    syncMetaTag('meta[property="og:image:height"]', {
      property: 'og:image:height',
      content: '630',
    });
    syncMetaTag('meta[property="og:image:alt"]', {
      property: 'og:image:alt',
      content: `${meta.title} - new-api`,
    });
    syncMetaTag('meta[name="twitter:image:alt"]', {
      name: 'twitter:image:alt',
      content: `${meta.title} - new-api`,
    });
    if (!meta.noindex) {
      Object.values(alternateLinks).forEach((link) => {
        syncMetaTag(`link[rel="alternate"][hreflang="${link.hreflang}"]`, {
          rel: link.rel,
          hreflang: link.hreflang,
          href: link.href,
        });
      });
    } else {
      removeMetaTag('link[rel="alternate"]');
    }
    syncJsonLd(jsonLd);
  }, [location.pathname, location.search, i18n?.language]);

  return (
    <SetupCheck>
      <Routes>
        <Route
          path='/'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <Home />
            </Suspense>
          }
        />
        <Route
          path='/setup'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <Setup />
            </Suspense>
          }
        />
        <Route path='/forbidden' element={<Forbidden />} />
        <Route
          path='/console/subscription'
          element={
            <AdminRoute>
              <Subscription />
            </AdminRoute>
          }
        />
        <Route
          path='/console/channel'
          element={
            <AdminRoute>
              <Channel />
            </AdminRoute>
          }
        />
        <Route
          path='/console/token'
          element={
            <PrivateRoute>
              <Token />
            </PrivateRoute>
          }
        />
        <Route
          path='/console/redemption'
          element={
            <AdminRoute>
              <Redemption />
            </AdminRoute>
          }
        />
        <Route
          path='/console/user'
          element={
            <AdminRoute>
              <User />
            </AdminRoute>
          }
        />
        <Route
          path='/user/reset'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <PasswordResetConfirm />
            </Suspense>
          }
        />
        <Route
          path='/login'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <AuthRedirect>
                <LoginForm />
              </AuthRedirect>
            </Suspense>
          }
        />
        <Route
          path='/register'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <AuthRedirect>
                <RegisterForm />
              </AuthRedirect>
            </Suspense>
          }
        />
        <Route
          path='/reset'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <PasswordResetForm />
            </Suspense>
          }
        />
        <Route
          path='/oauth/github'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <OAuth2Callback type='github'></OAuth2Callback>
            </Suspense>
          }
        />
        <Route
          path='/oauth/discord'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <OAuth2Callback type='discord'></OAuth2Callback>
            </Suspense>
          }
        />
        <Route
          path='/oauth/oidc'
          element={
            <Suspense fallback={<Loading></Loading>}>
              <OAuth2Callback type='oidc'></OAuth2Callback>
            </Suspense>
          }
        />
        <Route
          path='/oauth/linuxdo'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <OAuth2Callback type='linuxdo'></OAuth2Callback>
            </Suspense>
          }
        />
        <Route
          path='/oauth/:provider'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <DynamicOAuth2Callback />
            </Suspense>
          }
        />
        <Route
          path='/console/setting'
          element={
            <AdminRoute>
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <Setting />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path='/console/personal'
          element={
            <PrivateRoute>
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <PersonalSetting />
              </Suspense>
            </PrivateRoute>
          }
        />
        <Route
          path='/console/topup'
          element={
            <PrivateRoute>
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <TopUp />
              </Suspense>
            </PrivateRoute>
          }
        />
        <Route
          path='/console/log'
          element={
            <PrivateRoute>
              <Log />
            </PrivateRoute>
          }
        />
        <Route
          path='/console'
          element={
            <PrivateRoute>
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <Dashboard />
              </Suspense>
            </PrivateRoute>
          }
        />
        <Route
          path='/console/midjourney'
          element={
            <PrivateRoute>
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <Midjourney />
              </Suspense>
            </PrivateRoute>
          }
        />
        <Route
          path='/console/task'
          element={
            <PrivateRoute>
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <Task />
              </Suspense>
            </PrivateRoute>
          }
        />
        <Route
          path='/pricing'
          element={
            pricingRequireAuth ? (
              <PrivateRoute>
                <Suspense
                  fallback={<Loading></Loading>}
                  key={location.pathname}
                >
                  <Pricing />
                </Suspense>
              </PrivateRoute>
            ) : (
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <Pricing />
              </Suspense>
            )
          }
        />
        <Route
          path='/about'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <About />
            </Suspense>
          }
        />
        <Route
          path='/faq'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <Faq />
            </Suspense>
          }
        />
        <Route
          path='/user-agreement'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <UserAgreement />
            </Suspense>
          }
        />
        <Route
          path='/privacy-policy'
          element={
            <Suspense fallback={<Loading></Loading>} key={location.pathname}>
              <PrivacyPolicy />
            </Suspense>
          }
        />
        <Route path='*' element={<NotFound />} />
      </Routes>
    </SetupCheck>
  );
}

export default App;
