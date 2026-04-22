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

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const About = lazy(() => import('./pages/About'));
const UserAgreement = lazy(() => import('./pages/UserAgreement'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));

const PAGE_SEO_META = {
  '/': {
    title: 'new-api - AI 网关聚合与分发平台',
    description:
      '统一的 AI 模型聚合与分发网关，支持 OpenAI、Claude、Gemini 兼容接口，提供个人与企业级模型管理与调用能力。',
    keywords:
      'new-api, AI 网关, OpenAI 兼容, Claude 兼容, Gemini 兼容, LLM 聚合, API Gateway',
    ogDescription:
      '统一的 AI 模型聚合与分发网关，支持 OpenAI、Claude、Gemini 兼容接口。',
    noindex: false,
  },
  '/pricing': {
    title: '定价 - new-api AI 模型网关',
    description:
      '查看 new-api AI 网关的定价方案与套餐，支持多模型接入与弹性额度管理。',
    keywords: 'new-api 定价, AI 网关 套餐, 额度套餐',
    ogDescription: '查看 new-api AI 网关的定价与额度方案。',
    noindex: false,
  },
  '/about': {
    title: '关于 new-api - AI 模型网关平台',
    description:
      '了解 new-api 的 AI 模型聚合能力、OpenAI/Claude/Gemini 兼容方案以及项目设计目标。',
    keywords: 'new-api 关于, AI 网关 平台介绍, API 聚合',
    ogDescription: '了解 new-api 的能力定位与平台设计目标。',
    noindex: false,
  },
  '/user-agreement': {
    title: '用户协议 - new-api',
    description: 'new-api 用户协议。',
    keywords: 'new-api 用户协议, 服务条款',
    ogDescription: '查看 new-api 用户协议与使用规则。',
    noindex: false,
  },
  '/privacy-policy': {
    title: '隐私政策 - new-api',
    description: 'new-api 隐私政策。',
    keywords: 'new-api 隐私政策, 数据保护',
    ogDescription: '查看 new-api 隐私政策及数据处理说明。',
    noindex: false,
  },
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

function DynamicOAuth2Callback() {
  const { provider } = useParams();
  return <OAuth2Callback type={provider} />;
}

function App() {
  const location = useLocation();
  const [statusState] = useContext(StatusContext);

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
    const meta = getPageSeoMeta(location.pathname);
    const robots = meta.noindex ? 'noindex,nofollow' : 'index,follow';
    const canonical = `${window.location.origin}${toCanonicalPath(
      location.pathname,
    )}`;

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
    syncMetaTag('meta[property="og:url"]', {
      property: 'og:url',
      content: canonical,
    });
    syncMetaTag('meta[name="twitter:title"]', {
      name: 'twitter:title',
      content: meta.title,
    });
    syncMetaTag('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: meta.ogDescription || meta.description,
    });
  }, [location.pathname]);

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
