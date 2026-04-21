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

const BASE_ADMIN_SIDEBAR_MODULES = {
  console: {
    enabled: true,
    detail: true,
    token: true,
    log: true,
    midjourney: true,
    task: true,
  },
  personal: {
    enabled: true,
    topup: true,
    personal: true,
  },
  admin: {
    enabled: true,
    channel: true,
    redemption: true,
    user: true,
    subscription: true,
    setting: true,
  },
};

export const SIDEBAR_SECTION_CONFIGS = [
  {
    key: 'console',
    title: '控制台区域',
    description: '数据管理和日志查看',
    modules: [
      { key: 'detail', title: '数据看板', description: '系统数据统计' },
      { key: 'token', title: '令牌管理', description: 'API令牌管理' },
      { key: 'log', title: '使用日志', description: 'API使用记录' },
      {
        key: 'midjourney',
        title: '绘图日志',
        description: '绘图任务记录',
      },
      { key: 'task', title: '任务日志', description: '系统任务记录' },
    ],
  },
  {
    key: 'personal',
    title: '个人中心区域',
    description: '用户个人功能',
    modules: [
      { key: 'topup', title: '钱包管理', description: '余额充值管理' },
      { key: 'personal', title: '个人设置', description: '个人信息设置' },
    ],
  },
  {
    key: 'admin',
    title: '管理员区域',
    description: '系统管理功能',
    modules: [
      { key: 'channel', title: '渠道管理', description: 'API渠道配置' },
      {
        key: 'subscription',
        title: '订阅管理',
        description: '订阅套餐管理',
      },
      {
        key: 'redemption',
        title: '兑换码管理',
        description: '兑换码生成管理',
      },
      { key: 'user', title: '用户管理', description: '用户账户管理' },
      { key: 'setting', title: '系统设置', description: '系统参数配置' },
    ],
  },
];

const deepClone = (value) => JSON.parse(JSON.stringify(value));

export const getDefaultSidebarModulesAdmin = () => deepClone(BASE_ADMIN_SIDEBAR_MODULES);

export const sanitizeSidebarModulesConfig = (config) => {
  const cleanConfig = {};
  const defaultConfig = getDefaultSidebarModulesAdmin();
  const source = config && typeof config === 'object' ? config : {};

  Object.keys(defaultConfig).forEach((sectionKey) => {
    const sectionConfig = defaultConfig[sectionKey];
    const rawSection = source[sectionKey];

    if (!rawSection || typeof rawSection !== 'object') {
      cleanConfig[sectionKey] = deepClone(sectionConfig);
      return;
    }

    cleanConfig[sectionKey] = {};
    Object.keys(sectionConfig).forEach((moduleKey) => {
      cleanConfig[sectionKey][moduleKey] =
        rawSection[moduleKey] ?? sectionConfig[moduleKey];
    });
  });

  return cleanConfig;
};
