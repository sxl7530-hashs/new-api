package service

import (
	"testing"

	"github.com/QuantumNous/new-api/setting"
)

func TestResolveOrderedTokenGroupsManualList(t *testing.T) {
	groups, err := ResolveOrderedTokenGroups("default", "vip,default,backup")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	expected := []string{"vip", "default", "backup"}
	if len(groups) != len(expected) {
		t.Fatalf("expected %d groups, got %d", len(expected), len(groups))
	}
	for i, group := range expected {
		if groups[i] != group {
			t.Fatalf("expected group %d to be %q, got %q", i, group, groups[i])
		}
	}
}

func TestResolveOrderedTokenGroupsAutoList(t *testing.T) {
	originalAutoGroups := setting.AutoGroups2JsonString()
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	t.Cleanup(func() {
		if err := setting.UpdateAutoGroupsByJsonString(originalAutoGroups); err != nil {
			t.Fatalf("failed to restore auto groups: %v", err)
		}
		if err := setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups); err != nil {
			t.Fatalf("failed to restore usable groups: %v", err)
		}
	})

	if err := setting.UpdateAutoGroupsByJsonString(`["vip","default","backup"]`); err != nil {
		t.Fatalf("failed to update auto groups: %v", err)
	}
	if err := setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"VIP","backup":"备用","auto":"自动"}`); err != nil {
		t.Fatalf("failed to update usable groups: %v", err)
	}

	groups, err := ResolveOrderedTokenGroups("default", "auto")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	expected := []string{"vip", "default", "backup"}
	if len(groups) != len(expected) {
		t.Fatalf("expected %d groups, got %d", len(expected), len(groups))
	}
	for i, group := range expected {
		if groups[i] != group {
			t.Fatalf("expected group %d to be %q, got %q", i, group, groups[i])
		}
	}
}
