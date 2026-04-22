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

import React from 'react';

export const faqItems = [
  {
    question: 'new-api 支持哪些模型接口？',
    answer:
      'new-api 支持主流大模型接口兼容与聚合，包括但不限于 OpenAI、Claude、Gemini 及多种国内外提供商。你可以在渠道页统一配置多个上游。',
  },
  {
    question: '“OpenAI 兼容”是什么意思？',
    answer:
      '意味着你可以用 OpenAI 的 SDK / 规范与调用逻辑接入网关，减少不同模型方的接入改造成本。',
  },
  {
    question: '如何分配订阅额度？',
    answer:
      '在控制台可为用户分配订阅包，支持按分组使用，配合账户余额实现更灵活的统一计费能力。',
  },
  {
    question: '是否支持按量计费与预充值？',
    answer:
      '是的，你可以使用预充值余额、积分包/额度包以及额度看板等能力管理预算与消耗。',
  },
  {
    question: '接口返回429怎么办？',
    answer:
      '请优先确认是否触发速率限制或配额上限；查看日志与任务状态可快速定位是否为限流、上游不可用或参数异常。',
  },
];

const Faq = () => {
  return (
    <main className='mx-auto mt-[60px] w-full max-w-4xl px-4 py-6'>
      <section className='rounded-xl border border-[#e5e7eb] bg-white p-6 shadow-sm'>
        <h1 className='mb-3 text-2xl font-bold text-gray-900 sm:text-3xl'>
          常见问题（FAQ）
        </h1>
        <p className='mb-6 text-sm text-gray-600'>
          本页汇总了 new-api 的常见使用问题，帮助你快速完成接入与运维排障。
        </p>
        <div className='space-y-4'>
          {faqItems.map((item) => (
            <article key={item.question} className='border-l-2 border-indigo-500 pl-4'>
              <h2 className='mb-1 text-lg font-semibold text-gray-900'>
                {item.question}
              </h2>
              <p className='text-sm leading-7 text-gray-700'>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>
      <section className='mt-6 rounded-xl border border-[#e5e7eb] bg-white p-6 shadow-sm'>
        <h2 className='mb-2 text-lg font-semibold text-gray-900'>为什么选择 new-api？</h2>
        <ul className='list-disc space-y-2 pl-5 text-sm text-gray-700'>
          <li>统一接口层，减少多模型接入维护成本。</li>
          <li>支持管理员统一管理渠道、额度、订阅与用户权限。</li>
          <li>支持监控告警与日志审计，便于业务持续稳定运行。</li>
          <li>可作为私有部署方案，兼顾安全与可控。</li>
        </ul>
      </section>
    </main>
  );
};

export default Faq;
