package model

import (
	"errors"
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/samber/lo"
)

var group2model2channels map[string]map[string][]int // enabled channel
var channelsIDM map[int]*Channel                     // all channels include disabled
var channelSyncLock sync.RWMutex

func InitChannelCache() {
	if !common.MemoryCacheEnabled {
		return
	}
	newChannelId2channel := make(map[int]*Channel)
	var channels []*Channel
	DB.Find(&channels)
	for _, channel := range channels {
		newChannelId2channel[channel.Id] = channel
	}
	var abilities []*Ability
	DB.Find(&abilities)
	groups := make(map[string]bool)
	for _, ability := range abilities {
		groups[ability.Group] = true
	}
	newGroup2model2channels := make(map[string]map[string][]int)
	for group := range groups {
		newGroup2model2channels[group] = make(map[string][]int)
	}
	for _, channel := range channels {
		if channel.Status != common.ChannelStatusEnabled {
			continue // skip disabled channels
		}
		groups := strings.Split(channel.Group, ",")
		for _, group := range groups {
			models := strings.Split(channel.Models, ",")
			for _, model := range models {
				if _, ok := newGroup2model2channels[group][model]; !ok {
					newGroup2model2channels[group][model] = make([]int, 0)
				}
				newGroup2model2channels[group][model] = append(newGroup2model2channels[group][model], channel.Id)
			}
		}
	}

	// sort by priority
	for group, model2channels := range newGroup2model2channels {
		for model, channels := range model2channels {
			sort.Slice(channels, func(i, j int) bool {
				return newChannelId2channel[channels[i]].GetPriority() > newChannelId2channel[channels[j]].GetPriority()
			})
			newGroup2model2channels[group][model] = channels
		}
	}

	channelSyncLock.Lock()
	group2model2channels = newGroup2model2channels
	//channelsIDM = newChannelId2channel
	for i, channel := range newChannelId2channel {
		if channel.ChannelInfo.IsMultiKey {
			channel.Keys = channel.GetKeys()
			if channel.ChannelInfo.MultiKeyMode == constant.MultiKeyModePolling {
				if oldChannel, ok := channelsIDM[i]; ok {
					// 存在旧的渠道，如果是多key且轮询，保留轮询索引信息
					if oldChannel.ChannelInfo.IsMultiKey && oldChannel.ChannelInfo.MultiKeyMode == constant.MultiKeyModePolling {
						channel.ChannelInfo.MultiKeyPollingIndex = oldChannel.ChannelInfo.MultiKeyPollingIndex
					}
				}
			}
		}
	}
	channelsIDM = newChannelId2channel
	channelSyncLock.Unlock()
	common.SysLog("channels synced from database")
}

func SyncChannelCache(frequency int) {
	for {
		time.Sleep(time.Duration(frequency) * time.Second)
		common.SysLog("syncing channels from database")
		InitChannelCache()
	}
}

func GetRandomSatisfiedChannel(group string, model string, retry int) (*Channel, error) {
	// if memory cache is disabled, get channel directly from database
	if !common.MemoryCacheEnabled {
		return GetChannel(group, model, retry)
	}

	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	// First, try to find channels with the exact model name.
	channels := group2model2channels[group][model]

	// If no channels found, try to find channels with the normalized model name.
	if len(channels) == 0 {
		normalizedModel := ratio_setting.FormatMatchingModelName(model)
		channels = group2model2channels[group][normalizedModel]
	}

	if len(channels) == 0 {
		return nil, nil
	}

	if len(channels) == 1 {
		if channel, ok := channelsIDM[channels[0]]; ok {
			return channel, nil
		}
		return nil, fmt.Errorf("数据库一致性错误，渠道# %d 不存在，请联系管理员修复", channels[0])
	}

	uniquePriorities := make(map[int]bool)
	for _, channelId := range channels {
		if channel, ok := channelsIDM[channelId]; ok {
			uniquePriorities[int(channel.GetPriority())] = true
		} else {
			return nil, fmt.Errorf("数据库一致性错误，渠道# %d 不存在，请联系管理员修复", channelId)
		}
	}
	var sortedUniquePriorities []int
	for priority := range uniquePriorities {
		sortedUniquePriorities = append(sortedUniquePriorities, priority)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(sortedUniquePriorities)))

	if retry >= len(uniquePriorities) {
		retry = len(uniquePriorities) - 1
	}
	targetPriority := int64(sortedUniquePriorities[retry])

	// get the priority for the given retry number
	var sumWeight = 0
	var targetChannels []*Channel
	for _, channelId := range channels {
		if channel, ok := channelsIDM[channelId]; ok {
			if channel.GetPriority() == targetPriority {
				sumWeight += channel.GetWeight()
				targetChannels = append(targetChannels, channel)
			}
		} else {
			return nil, fmt.Errorf("数据库一致性错误，渠道# %d 不存在，请联系管理员修复", channelId)
		}
	}

	if len(targetChannels) == 0 {
		return nil, errors.New(fmt.Sprintf("no channel found, group: %s, model: %s, priority: %d", group, model, targetPriority))
	}

	// smoothing factor and adjustment
	smoothingFactor := 1
	smoothingAdjustment := 0

	if sumWeight == 0 {
		// when all channels have weight 0, set sumWeight to the number of channels and set smoothing adjustment to 100
		// each channel's effective weight = 100
		sumWeight = len(targetChannels) * 100
		smoothingAdjustment = 100
	} else if sumWeight/len(targetChannels) < 10 {
		// when the average weight is less than 10, set smoothing factor to 100
		smoothingFactor = 100
	}

	// Calculate the total weight of all channels up to endIdx
	totalWeight := sumWeight * smoothingFactor

	// Generate a random value in the range [0, totalWeight)
	randomWeight := rand.Intn(totalWeight)

	// Find a channel based on its weight
	for _, channel := range targetChannels {
		randomWeight -= channel.GetWeight()*smoothingFactor + smoothingAdjustment
		if randomWeight < 0 {
			return channel, nil
		}
	}
	// return null if no channel is not found
	return nil, errors.New("channel not found")
}

func GetChannelDisplayScores(channels []*Channel, sampleSize int) map[int]float64 {
	scores := make(map[int]float64, len(channels))
	if sampleSize <= 0 {
		sampleSize = 20
	}

	channelMap := make(map[int]*Channel)
	grouped := make(map[string][]int)

	for _, channel := range channels {
		if channel == nil {
			continue
		}
		channelMap[channel.Id] = channel

		scores[channel.Id] = fallbackChannelScore(channel)

		group := "default"
		if groups := channel.GetGroups(); len(groups) > 0 {
			for _, item := range groups {
				if strings.TrimSpace(item) != "" {
					group = strings.TrimSpace(item)
					break
				}
			}
		}

		model := "default"
		if models := channel.GetModels(); len(models) > 0 {
			for _, item := range models {
				if strings.TrimSpace(item) != "" {
					model = strings.TrimSpace(item)
					break
				}
			}
		}
		grouped[group+"|"+model] = append(grouped[group+"|"+model], channel.Id)
	}

	for pair, ids := range grouped {
		parts := strings.Split(pair, "|")
		if len(parts) != 2 {
			continue
		}
		group := parts[0]
		modelName := parts[1]
		cleanIds := lo.Uniq(ids)
		stats, err := GetRecentChannelRoutingStats(group, modelName, cleanIds, sampleSize)
		if err != nil {
			common.SysLog(fmt.Sprintf("get channel score stats failed, fallback to basic score: %v", err))
			continue
		}

		for _, channelId := range cleanIds {
			channel := channelMap[channelId]
			if channel == nil {
				continue
			}
			stat, ok := stats[channelId]
			if !ok {
				continue
			}
			channelScore := scoreChannelWeight(channel, stat)
			if channelScore <= 0 {
				channelScore = fallbackChannelScore(channel)
			}
			scores[channel.Id] = channelScore
		}
	}

	return scores
}

func GetRandomSatisfiedChannelWithRouting(group string, model string, retry int, enabled bool, mode string, sampleSize int) (*Channel, error) {
	if !enabled {
		return GetRandomSatisfiedChannel(group, model, retry)
	}
	if strings.EqualFold(mode, "score") {
		return GetRandomSatisfiedChannelByScore(group, model, retry, sampleSize)
	}
	return GetRandomSatisfiedChannel(group, model, retry)
}

func GetRandomSatisfiedChannelByScore(group string, model string, retry int, sampleSize int) (*Channel, error) {
	if !common.MemoryCacheEnabled {
		return GetRandomSatisfiedChannel(group, model, retry)
	}

	channelSyncLock.RLock()
	cachedChannels, ok := group2model2channels[group]
	if !ok {
		channelSyncLock.RUnlock()
		return nil, nil
	}
	baseModelKey := model
	if _, exists := cachedChannels[baseModelKey]; !exists {
		baseModelKey = ratio_setting.FormatMatchingModelName(model)
	}
	channelIds := cachedChannels[baseModelKey]
	if len(channelIds) == 0 {
		channelSyncLock.RUnlock()
		return nil, nil
	}

	scoreChannelIds := make([]int, 0, len(channelIds))
	for _, channelId := range channelIds {
		if ch, ok := channelsIDM[channelId]; ok {
			scoreChannelIds = append(scoreChannelIds, ch.Id)
		}
	}
	channelSyncLock.RUnlock()

	if len(scoreChannelIds) == 0 {
		return nil, errors.New("database consistency error")
	}

	stats, err := GetRecentChannelRoutingStats(group, baseModelKey, scoreChannelIds, sampleSize)
	if err != nil {
		common.SysLog("get recent channel routing stats failed, fallback to priority mode: " + err.Error())
		return GetRandomSatisfiedChannel(group, model, retry)
	}

	type rankedChannel struct {
		id    int
		score float64
		ch    *Channel
	}

	results := make([]rankedChannel, 0, len(scoreChannelIds))
	for _, channelId := range scoreChannelIds {
		ch := channelsIDM[channelId]
		if ch == nil {
			continue
		}
		stat := stats[channelId]
		score := scoreChannelWeight(ch, stat)
		if score <= 0 {
			score = fallbackChannelScore(ch)
		}
		results = append(results, rankedChannel{id: channelId, score: score, ch: ch})
	}

	if len(results) == 0 {
		return nil, nil
	}

	sort.Slice(results, func(i, j int) bool {
		if results[i].score == results[j].score {
			return results[i].id < results[j].id
		}
		return results[i].score > results[j].score
	})

	if retry < 0 {
		retry = 0
	}
	if retry >= len(results) {
		retry = len(results) - 1
	}

	return results[retry].ch, nil
}

func fallbackChannelScore(channel *Channel) float64 {
	if channel == nil {
		return 0
	}
	priorityScore := float64(channel.GetPriority()) * 10
	weightScore := float64(channel.GetWeight()) / 2
	return priorityScore + weightScore
}

func scoreChannelWeight(channel *Channel, stat ChannelRoutingSampleStat) float64 {
	if channel == nil {
		return 0
	}
	successRate := 0.5
	cacheRate := 0.0
	latencyScore := 0.0
	if stat.TotalCount > 0 {
		successRate = float64(stat.SuccessCount) / float64(stat.TotalCount)
	}
	if stat.TotalTokenCount > 0 {
		cacheRate = stat.CacheTokenCount / stat.TotalTokenCount
		if cacheRate > 1 {
			cacheRate = 1
		}
		if cacheRate < 0 {
			cacheRate = 0
		}
	}
	if stat.AverageUseTime > 0 {
		latencyPenalty := stat.AverageUseTime / 10000
		if latencyPenalty < 0 {
			latencyPenalty = 0
		}
		if latencyPenalty > 10 {
			latencyPenalty = 10
		}
		latencyScore = (10 - latencyPenalty) * 1.5
	}
	return successRate*100 + cacheRate*80 + latencyScore + float64(channel.GetPriority())
}

func CacheGetChannel(id int) (*Channel, error) {
	if !common.MemoryCacheEnabled {
		return GetChannelById(id, true)
	}
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	c, ok := channelsIDM[id]
	if !ok {
		return nil, fmt.Errorf("渠道# %d，已不存在", id)
	}
	return c, nil
}

func CacheGetChannelInfo(id int) (*ChannelInfo, error) {
	if !common.MemoryCacheEnabled {
		channel, err := GetChannelById(id, true)
		if err != nil {
			return nil, err
		}
		return &channel.ChannelInfo, nil
	}
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	c, ok := channelsIDM[id]
	if !ok {
		return nil, fmt.Errorf("渠道# %d，已不存在", id)
	}
	return &c.ChannelInfo, nil
}

func CacheUpdateChannelStatus(id int, status int) {
	if !common.MemoryCacheEnabled {
		return
	}
	channelSyncLock.Lock()
	defer channelSyncLock.Unlock()
	if channel, ok := channelsIDM[id]; ok {
		channel.Status = status
	}
	if status != common.ChannelStatusEnabled {
		// delete the channel from group2model2channels
		for group, model2channels := range group2model2channels {
			for model, channels := range model2channels {
				for i, channelId := range channels {
					if channelId == id {
						// remove the channel from the slice
						group2model2channels[group][model] = append(channels[:i], channels[i+1:]...)
						break
					}
				}
			}
		}
	}
}

func CacheUpdateChannel(channel *Channel) {
	if !common.MemoryCacheEnabled {
		return
	}
	channelSyncLock.Lock()
	defer channelSyncLock.Unlock()
	if channel == nil {
		return
	}

	println("CacheUpdateChannel:", channel.Id, channel.Name, channel.Status, channel.ChannelInfo.MultiKeyPollingIndex)

	println("before:", channelsIDM[channel.Id].ChannelInfo.MultiKeyPollingIndex)
	channelsIDM[channel.Id] = channel
	println("after :", channelsIDM[channel.Id].ChannelInfo.MultiKeyPollingIndex)
}
