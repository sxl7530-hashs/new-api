package model

import "testing"

func TestParseTokenGroupsPreservesOrderAndDeduplicates(t *testing.T) {
	groups := ParseTokenGroups(" vip,default,vip , backup ,,default ")
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

func TestNormalizeTokenGroup(t *testing.T) {
	got := NormalizeTokenGroup(" vip,default,vip , backup ,,default ")
	if got != "vip,default,backup" {
		t.Fatalf("expected normalized group to be %q, got %q", "vip,default,backup", got)
	}
}

func TestTokenSupportsCrossGroupRetry(t *testing.T) {
	token := &Token{Group: "vip,default"}
	if !token.SupportsCrossGroupRetry() {
		t.Fatal("expected multi-group token to support cross-group retry")
	}

	token.Group = "auto"
	if !token.SupportsCrossGroupRetry() {
		t.Fatal("expected auto token to support cross-group retry")
	}

	token.Group = "default"
	if token.SupportsCrossGroupRetry() {
		t.Fatal("expected single-group token not to support cross-group retry")
	}
}
