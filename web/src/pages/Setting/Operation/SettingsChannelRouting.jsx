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

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Spin,
  Switch,
  Table,
  Typography,
} from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { API, compareObjects, showError, showSuccess, showWarning } from '../../../helpers';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;
const CONFIG_KEY = 'ChannelGroupRoutingConfig';
const DEFAULT_CONFIG = {
  default_enabled: true,
  default_mode: 'priority',
  default_sample_size: 20,
  groups: {},
};

const normalizeMode = (mode) => {
  if (typeof mode === 'string' && mode.trim().toLowerCase() === 'score') {
    return 'score';
  }
  return 'priority';
};

const normalizeConfig = (raw) => {
  let parsed = DEFAULT_CONFIG;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsedRaw = JSON.parse(raw);
      if (typeof parsedRaw === 'object' && parsedRaw !== null) {
        parsed = parsedRaw;
      }
    } catch {
      parsed = DEFAULT_CONFIG;
    }
  }
  const defaultEnabled = parsed.default_enabled !== false;
  const defaultMode = normalizeMode(parsed.default_mode);
  const defaultSampleSize =
    Number(parsed.default_sample_size) > 0 ? Number(parsed.default_sample_size) : DEFAULT_CONFIG.default_sample_size;

  const groups = {};
  if (typeof parsed.groups === 'object' && parsed.groups !== null) {
    Object.keys(parsed.groups).forEach((groupName) => {
      const rawGroup = parsed.groups[groupName] || {};
      groups[groupName] = {
        enabled: rawGroup.enabled !== false,
        mode: normalizeMode(rawGroup.mode),
        sample_size:
          Number(rawGroup.sample_size) > 0
            ? Number(rawGroup.sample_size)
            : defaultSampleSize,
      };
    });
  }

  return {
    default_enabled: defaultEnabled,
    default_mode: defaultMode,
    default_sample_size: defaultSampleSize,
    groups,
  };
};

const serializeConfig = (cfg) => {
  const normalized = normalizeConfig(cfg);
  const orderedGroups = {};
  Object.keys(normalized.groups || {})
    .sort()
    .forEach((name) => {
      orderedGroups[name] = normalized.groups[name];
    });
  return JSON.stringify(
    {
      default_enabled: normalized.default_enabled,
      default_mode: normalized.default_mode,
      default_sample_size: normalized.default_sample_size,
      groups: orderedGroups,
    },
    null,
    0,
  );
};

const clampSampleSize = (value, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  const v = Math.floor(number);
  if (v > 200) {
    return 200;
  }
  return v;
};

export default function SettingsChannelRouting(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState([]);
  const [groupFilter, setGroupFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [configSnapshot, setConfigSnapshot] = useState(
    serializeConfig(DEFAULT_CONFIG),
  );

  const getAvailableModeOptions = () => [
    { label: t('优先级'), value: 'priority' },
    { label: t('评分优先'), value: 'score' },
  ];

  const pullGroupRoutingConfig = async () => {
    const res = await API.get('/api/group/');
    const { success, message, data } = res?.data || {};
    if (!success) {
      throw new Error(message || '获取分组列表失败');
    }
    if (Array.isArray(data)) {
      const uniq = [...new Set(data.filter((name) => !!name))];
      setGroups(uniq.sort());
      return uniq;
    } else {
      setGroups([]);
      return [];
    }
  };

  const normalizeGroupConfig = (groupName) =>
    config.groups[groupName] || {
      enabled: config.default_enabled,
      mode: config.default_mode,
      sample_size: config.default_sample_size,
    };

  const filteredGroups = useMemo(() => {
    const configGroupNames = Object.keys(config.groups || {});
    const merged = new Set(groups);
    configGroupNames.forEach((name) => {
      if (name && name.trim()) {
        merged.add(name);
      }
    });
    const list = [...merged];
    list.sort();

    const keyword = groupFilter.trim().toLowerCase();
    if (!keyword) {
      return list;
    }
    return list.filter((name) => name.toLowerCase().includes(keyword));
  }, [groups, config.groups, groupFilter]);

  const rows = useMemo(() => {
    return filteredGroups
      .slice((page - 1) * pageSize, page * pageSize)
      .map((groupName) => {
        const groupConfig = normalizeGroupConfig(groupName);
        return {
          key: groupName,
          group_name: groupName,
          enabled: groupConfig.enabled,
          mode: groupConfig.mode,
          sample_size: groupConfig.sample_size,
        };
      });
  }, [filteredGroups, page, pageSize, config]);

  const hasUnsavedChanges = useMemo(() => {
    return serializeConfig(config) !== configSnapshot;
  }, [config, configSnapshot]);

  const updateDefaultConfig = (next) => {
    setConfig((prev) => ({
      ...prev,
      ...next,
    }));
    setPage(1);
  };

  const updateGroupConfig = (groupName, nextGroupConfig) => {
    setConfig((prev) => ({
      ...prev,
      groups: {
        ...(prev.groups || {}),
        [groupName]: {
          ...(normalizeGroupConfig(groupName) || {}),
          ...nextGroupConfig,
        },
      },
    }));
  };

  const onSubmit = async () => {
    const normalized = normalizeConfig(config);
    const normalizedPayload = {
      ...normalized,
      default_sample_size: clampSampleSize(
        normalized.default_sample_size,
        DEFAULT_CONFIG.default_sample_size,
      ),
      default_mode: normalizeMode(normalized.default_mode),
      groups: Object.keys(normalized.groups || {}).reduce((acc, groupName) => {
        const cfg = normalized.groups[groupName] || {};
        acc[groupName] = {
          ...cfg,
          mode: normalizeMode(cfg.mode),
          sample_size: clampSampleSize(cfg.sample_size, normalized.default_sample_size),
        };
        return acc;
      }, {}),
    };

    const nextValue = serializeConfig(normalizedPayload);
    const changed = compareObjects({ [CONFIG_KEY]: nextValue }, { [CONFIG_KEY]: configSnapshot });
    if (!changed.length) {
      return showWarning(t('你似乎并没有修改什么'));
    }

      setSaving(true);
    try {
      const res = await API.put('/api/option/', {
        key: CONFIG_KEY,
        value: JSON.stringify(normalizedPayload),
      });
      const { success, message } = res?.data || {};
      if (success) {
        setConfigSnapshot(serializeConfig(normalizedPayload));
        showSuccess(t('保存成功'));
        if (props.refresh) await props.refresh();
      } else {
        showError(message || t('保存失败，请重试'));
      }
    } catch {
      showError(t('保存失败，请重试'));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await pullGroupRoutingConfig();
        const raw = props.options?.[CONFIG_KEY];
        const normalized = normalizeConfig(raw || serializeConfig(DEFAULT_CONFIG));
        setConfig(normalized);
        setConfigSnapshot(serializeConfig(normalized));
      } catch (error) {
        showError(error?.message || t('获取配置失败'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [props.options]);

  useEffect(() => {
    if (page > Math.max(1, Math.ceil(filteredGroups.length / pageSize))) {
      setPage(1);
    }
  }, [filteredGroups, pageSize]);

  const columns = [
    {
      title: t('渠道分组'),
      dataIndex: 'group_name',
      render: (text) => <Text strong>{text}</Text>,
      width: 220,
    },
    {
      title: t('是否参与重试'),
      dataIndex: 'enabled',
      width: 130,
      render: (text, record) => {
        return (
          <Switch
            checked={text}
            checkedText='｜'
            uncheckedText='〇'
            onChange={(checked) =>
              updateGroupConfig(record.group_name, { enabled: checked })
            }
          />
        );
      },
    },
    {
      title: t('重试策略'),
      dataIndex: 'mode',
      width: 180,
      render: (text, record) => {
        return (
          <Select
            value={text}
            style={{ width: 140 }}
            optionList={getAvailableModeOptions()}
            onChange={(value) =>
              updateGroupConfig(record.group_name, { mode: value })
            }
          />
        );
      },
    },
    {
      title: t('评分样本数'),
      dataIndex: 'sample_size',
      width: 120,
      render: (text, record) => {
        return (
          <InputNumber
            min={1}
            max={200}
            style={{ width: 120 }}
            value={text}
            onChange={(value) =>
              updateGroupConfig(record.group_name, {
                sample_size: Number(value) || 1,
              })
            }
          />
        );
      },
    },
  ];

  return (
    <Spin spinning={loading || saving}>
      <Form.Section
        text={t('分组路由策略')}
        extraText={t('按分组定义渠道重试策略，支持优先级或评分模式')}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ marginBottom: 8, display: 'inline-block' }}>
            {t('默认配置')}
          </Text>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8} md={8}>
              <Form.Switch
                field='default_enabled'
                label={t('默认参与重试')}
                checkedText='｜'
                uncheckedText='〇'
                onChange={(value) =>
                  updateDefaultConfig({
                    default_enabled: value,
                  })
                }
              />
            </Col>
            <Col xs={24} sm={8} md={8}>
              <Form.Select
                field='default_mode'
                label={t('默认重试策略')}
                style={{ width: '100%' }}
                optionList={getAvailableModeOptions()}
                value={config.default_mode}
                onChange={(value) =>
                  updateDefaultConfig({
                    default_mode: value,
                  })
                }
                placeholder={t('请选择')}
              />
            </Col>
            <Col xs={24} sm={8} md={8}>
              <Form.InputNumber
                field='default_sample_size'
                label={t('默认评分样本数')}
                min={1}
                step={1}
                suffix={t('次')}
                value={config.default_sample_size}
                onChange={(value) =>
                  updateDefaultConfig({
                    default_sample_size: parseInt(value) || 1,
                  })
                }
              />
            </Col>
          </Row>
        </div>

        <div style={{ marginBottom: 12 }}>
          <Input
            prefix={<IconSearch />}
            placeholder={t('搜索分组')}
            value={groupFilter}
            onChange={(value) => {
              setGroupFilter(value);
              setPage(1);
            }}
          />
        </div>

        <Table
          rowKey='key'
          columns={columns}
          dataSource={rows}
          pagination={{
            currentPage: page,
            pageSize,
            total: filteredGroups.length,
            showSizeChanger: true,
            pageSizeOptions: ['5', '10', '20', '50'],
            onChange: (nextPage, size) => {
              setPage(nextPage);
              if (size && size !== pageSize) {
                setPageSize(size);
              }
            },
            onShowSizeChange: (currentPage, size) => {
              setPage(1);
              setPageSize(size);
            },
          }}
          empty={
            <Empty
              image={null}
              description={t('未找到可配置的分组')}
              style={{ padding: 24 }}
            />
          }
        />

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Button
            theme='solid'
            type='primary'
            disabled={!hasUnsavedChanges}
            onClick={onSubmit}
          >
            {t('保存设置')}
          </Button>
        </div>
      </Form.Section>
    </Spin>
  );
}
