package service

import (
	"errors"
	"sort"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

const (
	RoutingStrategyPriority = "priority"
	RoutingStrategyScore    = "score"
)

const (
	defaultGroupRoutingEnabled    = true
	defaultGroupRoutingMode       = RoutingStrategyPriority
	defaultGroupRoutingSampleSize = 20
	minGroupRoutingSampleSize     = 1
	maxGroupRoutingSampleSize     = 200
)

type GroupRoutingConfig struct {
	Enabled    bool   `json:"enabled"`
	Mode       string `json:"mode"`
	SampleSize int    `json:"sample_size"`
}

type GroupRoutingSettings struct {
	DefaultEnabled    bool                          `json:"default_enabled"`
	DefaultMode       string                        `json:"default_mode"`
	DefaultSampleSize int                           `json:"default_sample_size"`
	Groups            map[string]GroupRoutingConfig `json:"groups"`
}

var groupRoutingConfigLock sync.RWMutex
var cachedGroupRoutingConfig GroupRoutingSettings
var cachedGroupRoutingConfigSource string

func getDefaultGroupRoutingConfig() GroupRoutingSettings {
	return GroupRoutingSettings{
		DefaultEnabled:    defaultGroupRoutingEnabled,
		DefaultMode:       defaultGroupRoutingMode,
		DefaultSampleSize: defaultGroupRoutingSampleSize,
		Groups:            make(map[string]GroupRoutingConfig),
	}
}

func normalizeRoutingMode(mode string) string {
	switch strings.TrimSpace(strings.ToLower(mode)) {
	case RoutingStrategyScore:
		return RoutingStrategyScore
	default:
		return RoutingStrategyPriority
	}
}

func normalizeSampleSize(sampleSize int) int {
	if sampleSize < minGroupRoutingSampleSize {
		sampleSize = minGroupRoutingSampleSize
	}
	if sampleSize > maxGroupRoutingSampleSize {
		sampleSize = maxGroupRoutingSampleSize
	}
	return sampleSize
}

func normalizeGroupRoutingConfig(config GroupRoutingSettings) GroupRoutingSettings {
	normalized := getDefaultGroupRoutingConfig()
	normalized.DefaultEnabled = config.DefaultEnabled
	normalized.DefaultMode = normalizeRoutingMode(config.DefaultMode)
	if config.DefaultSampleSize > 0 {
		normalized.DefaultSampleSize = normalizeSampleSize(config.DefaultSampleSize)
	} else {
		normalized.DefaultSampleSize = defaultGroupRoutingSampleSize
	}

	for key, value := range config.Groups {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		mode := normalizeRoutingMode(value.Mode)
		sampleSize := value.SampleSize
		if sampleSize <= 0 {
			sampleSize = normalized.DefaultSampleSize
		} else {
			sampleSize = normalizeSampleSize(sampleSize)
		}
		normalized.Groups[key] = GroupRoutingConfig{
			Enabled:    value.Enabled,
			Mode:       mode,
			SampleSize: sampleSize,
		}
	}

	return normalized
}

func loadGroupRoutingConfigFromOption() GroupRoutingSettings {
	groupRoutingConfigLock.Lock()
	defer groupRoutingConfigLock.Unlock()

	common.OptionMapRWMutex.Lock()
	raw, ok := common.OptionMap["ChannelGroupRoutingConfig"]
	common.OptionMapRWMutex.Unlock()

	rawText := strings.TrimSpace(common.Interface2String(raw))
	if !ok || rawText == "" {
		cfg := getDefaultGroupRoutingConfig()
		cachedGroupRoutingConfig = cfg
		cachedGroupRoutingConfigSource = rawText
		return cfg
	}

	if rawText == cachedGroupRoutingConfigSource && !isGroupRoutingConfigZero(cachedGroupRoutingConfig) {
		return cachedGroupRoutingConfig
	}

	var parsed GroupRoutingSettings
	if err := common.UnmarshalJsonStr(rawText, &parsed); err != nil {
		common.SysLog("failed to parse ChannelGroupRoutingConfig option: " + err.Error())
		cfg := getDefaultGroupRoutingConfig()
		cachedGroupRoutingConfig = cfg
		cachedGroupRoutingConfigSource = rawText
		return cfg
	}

	cacheCopy := normalizeGroupRoutingConfig(parsed)
	if err := validateGroupRoutingConfig(cacheCopy); err != nil {
		common.SysLog("invalid ChannelGroupRoutingConfig option, fallback to default: " + err.Error())
		cacheCopy = getDefaultGroupRoutingConfig()
	}

	cachedGroupRoutingConfig = cacheCopy
	cachedGroupRoutingConfigSource = rawText
	return cacheCopy
}

func GetGroupRoutingConfig() GroupRoutingSettings {
	return loadGroupRoutingConfigFromOption()
}

func isGroupRoutingConfigZero(config GroupRoutingSettings) bool {
	return config.DefaultMode == "" && config.DefaultSampleSize == 0 && len(config.Groups) == 0
}

func GetGroupRoutingConfigForGroup(group string) GroupRoutingConfig {
	group = strings.TrimSpace(group)
	config := GetGroupRoutingConfig()
	if groupConfig, ok := config.Groups[group]; ok {
		sampleSize := groupConfig.SampleSize
		if sampleSize <= 0 {
			sampleSize = config.DefaultSampleSize
		}
		return GroupRoutingConfig{
			Enabled:    groupConfig.Enabled,
			Mode:       normalizeRoutingMode(groupConfig.Mode),
			SampleSize: sampleSize,
		}
	}

	return GroupRoutingConfig{
		Enabled:    config.DefaultEnabled,
		Mode:       config.DefaultMode,
		SampleSize: config.DefaultSampleSize,
	}
}

func GetAvailableRoutingMode() []string {
	return []string{RoutingStrategyPriority, RoutingStrategyScore}
}

func GetDefaultGroupRoutingConfigJSON() string {
	defaultCfg := getDefaultGroupRoutingConfig()
	b, err := common.Marshal(defaultCfg)
	if err != nil {
		return "{\"default_enabled\":true,\"default_mode\":\"priority\",\"default_sample_size\":20,\"groups\":{}}"
	}
	return string(b)
}

func GetSortedRouteGroupsFromOptions() []string {
	config := GetGroupRoutingConfig()
	groups := make([]string, 0, len(config.Groups))
	for k := range config.Groups {
		groups = append(groups, k)
	}
	sort.Strings(groups)
	return groups
}

func ParseGroupRoutingConfig(raw string) (GroupRoutingSettings, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return getDefaultGroupRoutingConfig(), nil
	}

	var parsed GroupRoutingSettings
	if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
		return GroupRoutingSettings{}, err
	}

	normalized := normalizeGroupRoutingConfig(parsed)
	if err := validateGroupRoutingConfig(normalized); err != nil {
		return GroupRoutingSettings{}, err
	}

	return normalized, nil
}

func validateGroupRoutingConfig(config GroupRoutingSettings) error {
	normalizedDefaultMode := normalizeRoutingMode(config.DefaultMode)
	if normalizedDefaultMode != config.DefaultMode {
		return errors.New("default_mode must be priority or score")
	}
	if config.DefaultSampleSize < minGroupRoutingSampleSize || config.DefaultSampleSize > maxGroupRoutingSampleSize {
		return errors.New("default_sample_size must be between 1 and 200")
	}

	for groupName, cfg := range config.Groups {
		groupName = strings.TrimSpace(groupName)
		if groupName == "" {
			return errors.New("group name must not be empty")
		}

		cfg.Mode = normalizeRoutingMode(cfg.Mode)
		if cfg.SampleSize <= 0 {
			return errors.New("sample_size for group " + groupName + " must be between 1 and 200")
		}
		if cfg.SampleSize > maxGroupRoutingSampleSize {
			return errors.New("sample_size for group " + groupName + " must be between 1 and 200")
		}
		if cfg.Mode != RoutingStrategyPriority && cfg.Mode != RoutingStrategyScore {
			return errors.New("mode must be priority or score")
		}
	}

	return nil
}
