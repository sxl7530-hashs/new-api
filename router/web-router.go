package router

import (
	"embed"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

func SetWebRouter(router *gin.Engine, buildFS embed.FS, indexPage []byte) {
	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	router.GET("/robots.txt", writeRobotsTxt)
	router.GET("/sitemap.xml", writeSitemapXML)
	router.Use(static.Serve("/", common.EmbedFolder(buildFS, "web/dist")))
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexPage)
	})
}

func writeRobotsTxt(c *gin.Context) {
	baseURL := getRequestBaseURL(c)
	robots := []string{
		"User-agent: *",
		"Allow: /",
		"Disallow: /api",
		"Disallow: /v1",
		"Disallow: /assets",
		"Disallow: /console",
		"Disallow: /login",
		"Disallow: /register",
		"Disallow: /reset",
		"Disallow: /user/reset",
		"Sitemap: " + baseURL + "/sitemap.xml",
	}
	c.String(http.StatusOK, strings.Join(robots, "\n"))
}

func writeSitemapXML(c *gin.Context) {
	baseURL := getRequestBaseURL(c)
	now := time.Now().UTC().Format(time.RFC3339)
	paths := []struct {
		Path     string
		Priority string
		Freq     string
	}{
		{"/", "1.0", "daily"},
		{"/pricing", "0.8", "weekly"},
		{"/about", "0.8", "monthly"},
		{"/user-agreement", "0.4", "yearly"},
		{"/privacy-policy", "0.4", "yearly"},
	}

	var entries []string
	for _, item := range paths {
		entry := fmt.Sprintf(
			`  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq><priority>%s</priority></url>`,
			baseURL+item.Path,
			now,
			item.Freq,
			item.Priority,
		)
		entries = append(entries, entry)
	}
	xml := "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
	xml += "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
	xml += strings.Join(entries, "\n")
	xml += "\n</urlset>"
	c.Data(http.StatusOK, "application/xml; charset=utf-8", []byte(xml))
}

func getRequestBaseURL(c *gin.Context) string {
	scheme := c.GetHeader("X-Forwarded-Proto")
	if scheme == "" {
		if c.Request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	return fmt.Sprintf("%s://%s", scheme, c.Request.Host)
}
