package service

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	defaultUpdateRepositoryURL = "https://github.com/sxl7530-hashs/new-api"
	defaultUpdateBranch        = "main"
)

type SelfUpdateConfig struct {
	RepositoryURL string `json:"repository_url"`
	Branch        string `json:"branch"`
	PostCommand   string `json:"post_command"`
	ServiceName   string `json:"service_name"`
}

type SelfUpdateCheckResult struct {
	RepositoryURL         string `json:"repository_url"`
	Branch                string `json:"branch"`
	CurrentVersion        string `json:"current_version"`
	CurrentCommit         string `json:"current_commit"`
	CurrentBranch         string `json:"current_branch"`
	RemoteCommit          string `json:"remote_commit"`
	RemoteMessage         string `json:"remote_message"`
	RemoteDate            string `json:"remote_date"`
	RemoteURL             string `json:"remote_url"`
	GitAvailable          bool   `json:"git_available"`
	GitRepository         bool   `json:"git_repository"`
	Dirty                 bool   `json:"dirty"`
	HasUpdate             bool   `json:"has_update"`
	CanUpdate             bool   `json:"can_update"`
	PostCommandConfigured bool   `json:"post_command_configured"`
	RestartMode           string `json:"restart_mode"`
	RestartCommand        string `json:"restart_command"`
	AutoRestartAvailable  bool   `json:"auto_restart_available"`
}

type SelfUpdateApplyResult struct {
	Updated                bool     `json:"updated"`
	BeforeCommit           string   `json:"before_commit"`
	AfterCommit            string   `json:"after_commit"`
	RestartTriggered       bool     `json:"restart_triggered"`
	PostCommandConfigured  bool     `json:"post_command_configured"`
	RestartMode            string   `json:"restart_mode"`
	RestartCommand         string   `json:"restart_command"`
	Logs                   []string `json:"logs"`
}

type githubCommitResponse struct {
	SHA    string `json:"sha"`
	HTMLURL string `json:"html_url"`
	Commit struct {
		Message string `json:"message"`
		Author  struct {
			Date string `json:"date"`
		} `json:"author"`
	} `json:"commit"`
}

func GetSelfUpdateConfig() SelfUpdateConfig {
	repositoryURL := strings.TrimSpace(common.OptionMap["UpdateRepositoryURL"])
	if repositoryURL == "" {
		repositoryURL = defaultUpdateRepositoryURL
	}
	branch := strings.TrimSpace(common.OptionMap["UpdateBranch"])
	if branch == "" {
		branch = defaultUpdateBranch
	}
	return SelfUpdateConfig{
		RepositoryURL: repositoryURL,
		Branch:        branch,
		PostCommand:   strings.TrimSpace(common.OptionMap["SelfUpdatePostCommand"]),
		ServiceName:   strings.TrimSpace(common.OptionMap["SelfUpdateServiceName"]),
	}
}

func CheckSelfUpdate(ctx context.Context) (*SelfUpdateCheckResult, error) {
	cfg := GetSelfUpdateConfig()
	result := &SelfUpdateCheckResult{
		RepositoryURL:         cfg.RepositoryURL,
		Branch:                cfg.Branch,
		CurrentVersion:        common.Version,
		PostCommandConfigured: cfg.PostCommand != "",
	}

	repoOwner, repoName, err := parseGitHubRepository(cfg.RepositoryURL)
	if err != nil {
		return nil, err
	}

	remoteCommit, err := fetchRemoteCommit(ctx, repoOwner, repoName, cfg.Branch)
	if err != nil {
		return nil, err
	}
	result.RemoteCommit = remoteCommit.SHA
	result.RemoteMessage = remoteCommit.Commit.Message
	result.RemoteDate = remoteCommit.Commit.Author.Date
	result.RemoteURL = remoteCommit.HTMLURL

	gitAvailable := isCommandAvailable("git")
	result.GitAvailable = gitAvailable
	if !gitAvailable {
		return result, nil
	}

	gitRepository, err := isGitRepository(ctx)
	if err != nil {
		return nil, err
	}
	result.GitRepository = gitRepository
	if !gitRepository {
		return result, nil
	}

	currentCommit, err := runGit(ctx, "rev-parse", "HEAD")
	if err != nil {
		return nil, err
	}
	result.CurrentCommit = strings.TrimSpace(currentCommit)

	currentBranch, err := runGit(ctx, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return nil, err
	}
	result.CurrentBranch = strings.TrimSpace(currentBranch)

	dirty, err := isGitDirty(ctx)
	if err != nil {
		return nil, err
	}
	result.Dirty = dirty
	result.HasUpdate = result.CurrentCommit != "" && result.CurrentCommit != result.RemoteCommit
	result.CanUpdate = result.HasUpdate && !result.Dirty

	restartMode, restartCommand := detectRestartCommand(cfg)
	result.RestartMode = restartMode
	result.RestartCommand = restartCommand
	result.AutoRestartAvailable = restartCommand != ""
	return result, nil
}

func ApplySelfUpdate(ctx context.Context) (*SelfUpdateApplyResult, error) {
	cfg := GetSelfUpdateConfig()
	result := &SelfUpdateApplyResult{
		PostCommandConfigured: cfg.PostCommand != "",
		Logs:                  make([]string, 0, 4),
	}

	if !isCommandAvailable("git") {
		return nil, fmt.Errorf("git 不可用，无法执行一键更新")
	}

	gitRepository, err := isGitRepository(ctx)
	if err != nil {
		return nil, err
	}
	if !gitRepository {
		return nil, fmt.Errorf("当前运行目录不是 Git 仓库，无法执行一键更新")
	}

	dirty, err := isGitDirty(ctx)
	if err != nil {
		return nil, err
	}
	if dirty {
		return nil, fmt.Errorf("当前工作区存在未提交修改，请先清理后再执行一键更新")
	}

	beforeCommit, err := runGit(ctx, "rev-parse", "HEAD")
	if err != nil {
		return nil, err
	}
	result.BeforeCommit = strings.TrimSpace(beforeCommit)

	fetchLog, err := runCommand(ctx, "git", "fetch", cfg.RepositoryURL, cfg.Branch)
	result.Logs = append(result.Logs, formatLogBlock("git fetch", fetchLog))
	if err != nil {
		return nil, err
	}

	mergeLog, err := runCommand(ctx, "git", "merge", "--ff-only", "FETCH_HEAD")
	result.Logs = append(result.Logs, formatLogBlock("git merge --ff-only FETCH_HEAD", mergeLog))
	if err != nil {
		return nil, err
	}

	afterCommit, err := runGit(ctx, "rev-parse", "HEAD")
	if err != nil {
		return nil, err
	}
	result.AfterCommit = strings.TrimSpace(afterCommit)
	result.Updated = result.BeforeCommit != result.AfterCommit

	restartMode, restartCommand := detectRestartCommand(cfg)
	result.RestartMode = restartMode
	result.RestartCommand = restartCommand

	if result.Updated && restartCommand != "" {
		postLog, err := runShell(ctx, restartCommand)
		result.Logs = append(result.Logs, formatLogBlock(restartCommand, postLog))
		if err != nil {
			return nil, err
		}
		result.RestartTriggered = true
	}

	return result, nil
}

func parseGitHubRepository(repositoryURL string) (string, string, error) {
	if strings.TrimSpace(repositoryURL) == "" {
		return "", "", fmt.Errorf("更新仓库地址不能为空")
	}

	u, err := url.Parse(strings.TrimSpace(repositoryURL))
	if err != nil {
		return "", "", fmt.Errorf("更新仓库地址格式不正确")
	}
	if u.Host != "github.com" {
		return "", "", fmt.Errorf("当前仅支持 GitHub 仓库地址")
	}

	path := strings.Trim(strings.TrimSuffix(u.Path, ".git"), "/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("更新仓库地址格式不正确")
	}
	return parts[0], parts[1], nil
}

func fetchRemoteCommit(ctx context.Context, owner string, repo string, branch string) (*githubCommitResponse, error) {
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/commits/%s", owner, repo, url.PathEscape(branch))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "new-api-self-update")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("获取远程更新信息失败，GitHub 返回状态码 %d", res.StatusCode)
	}

	var payload githubCommitResponse
	if err := common.DecodeJson(res.Body, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

func isCommandAvailable(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func isGitRepository(ctx context.Context) (bool, error) {
	output, err := runGit(ctx, "rev-parse", "--is-inside-work-tree")
	if err != nil {
		if strings.Contains(err.Error(), "not a git repository") {
			return false, nil
		}
		return false, err
	}
	return strings.TrimSpace(output) == "true", nil
}

func isGitDirty(ctx context.Context) (bool, error) {
	output, err := runGit(ctx, "status", "--porcelain")
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(output) != "", nil
}

func runGit(ctx context.Context, args ...string) (string, error) {
	return runCommand(ctx, "git", args...)
}

func runShell(ctx context.Context, command string) (string, error) {
	return runCommand(ctx, "sh", "-lc", command)
}

func runCommand(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = os.Environ()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	output := strings.TrimSpace(strings.TrimSpace(stdout.String()) + "\n" + strings.TrimSpace(stderr.String()))
	output = strings.TrimSpace(output)
	if err != nil {
		if output == "" {
			return "", err
		}
		return output, fmt.Errorf("%v: %s", err, output)
	}
	return output, nil
}

func formatLogBlock(title string, output string) string {
	if strings.TrimSpace(output) == "" {
		return title + "\n(no output)"
	}
	return title + "\n" + output
}

func NewSelfUpdateContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 2*time.Minute)
}

func detectRestartCommand(cfg SelfUpdateConfig) (string, string) {
	if cfg.PostCommand != "" {
		return "manual", cfg.PostCommand
	}

	if command, ok := detectDockerComposeRestartCommand(); ok {
		return "docker-compose", command
	}

	if cfg.ServiceName != "" && isCommandAvailable("systemctl") {
		return "systemd", fmt.Sprintf("systemctl restart %s", cfg.ServiceName)
	}

	return "", ""
}

func detectDockerComposeRestartCommand() (string, bool) {
	composeFiles := []string{
		"docker-compose.yml",
		"docker-compose.yaml",
		"compose.yml",
		"compose.yaml",
	}

	hasComposeFile := false
	for _, file := range composeFiles {
		if _, err := os.Stat(file); err == nil {
			hasComposeFile = true
			break
		}
	}
	if !hasComposeFile {
		return "", false
	}

	if isCommandAvailable("docker") {
		return "docker compose up -d --build", true
	}
	if isCommandAvailable("docker-compose") {
		return "docker-compose up -d --build", true
	}
	return "", false
}
