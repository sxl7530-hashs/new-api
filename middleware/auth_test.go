package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

func buildSessionAuthRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	store := cookie.NewStore([]byte("test-secret"))
	r.Use(sessions.Sessions("session", store))

	r.GET(
		"/api/user/self",
		func(c *gin.Context) {
			session := sessions.Default(c)
			session.Set("id", 2)
			session.Set("username", "root")
			session.Set("role", 100)
			session.Set("status", common.UserStatusEnabled)
			session.Set("group", "default")
			_ = session.Save()
			c.Next()
		},
		UserAuth(),
		func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		},
	)

	r.GET(
		"/api/option/",
		func(c *gin.Context) {
			session := sessions.Default(c)
			session.Set("id", 2)
			session.Set("username", "root")
			session.Set("role", 100)
			session.Set("status", common.UserStatusEnabled)
			session.Set("group", "default")
			_ = session.Save()
			c.Next()
		},
		AdminAuth(),
		func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		},
	)

	return r
}

func buildSessionAuthNumericRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	store := cookie.NewStore([]byte("test-secret"))
	r.Use(sessions.Sessions("session", store))

	r.GET(
		"/api/user/self",
		func(c *gin.Context) {
			session := sessions.Default(c)
			session.Set("id", int64(2))
			session.Set("username", "root")
			session.Set("role", int64(100))
			session.Set("status", int64(common.UserStatusEnabled))
			session.Set("group", "default")
			_ = session.Save()
			c.Next()
		},
		UserAuth(),
		func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		},
	)

	return r
}

func TestUserAuthAllowsSessionWithoutNewApiUserHeader(t *testing.T) {
	r := buildSessionAuthRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/user/self", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for session-auth without New-Api-User, got %d", rec.Code)
	}
}

func TestUserAuthRejectsWrongNewApiUserAndAllowsMatchedSessionUser(t *testing.T) {
	r := buildSessionAuthRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/user/self", nil)
	req.Header.Set("New-Api-User", "3")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for mismatched New-Api-User, got %d", rec.Code)
	}

	req2 := httptest.NewRequest(http.MethodGet, "/api/user/self", nil)
	req2.Header.Set("New-Api-User", "2")
	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200 for matched New-Api-User, got %d", rec2.Code)
	}
}

func TestAdminAuthAllowsSessionWithoutNewApiUserHeader(t *testing.T) {
	r := buildSessionAuthRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/option/", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for admin endpoint without New-Api-User, got %d", rec.Code)
	}
}

func TestSessionAuthCompatibleWithNumericSessionFields(t *testing.T) {
	r := buildSessionAuthNumericRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/user/self", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for numeric session fields, got %d", rec.Code)
	}
}
