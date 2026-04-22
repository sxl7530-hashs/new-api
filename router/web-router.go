package router

import (
	"embed"
	"fmt"
	"hash/crc32"
	"net/http"
	"net/url"
	"os"
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
		if !isSeoPublicPath(c.Request.URL.Path) {
			c.Header("X-Robots-Tag", "noindex, nofollow, noarchive")
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexPage)
	})
}

type sitemapEntry struct {
	Path     string
	Priority string
	Freq     string
}

var sitemapHreflangs = []string{
	"x-default",
	"zh-CN",
	"en",
	"zh-TW",
	"fr",
	"ru",
	"ja",
	"vi",
}

var publicSitemapEntries = []sitemapEntry{
	{"/", "1.0", "daily"},
	{"/pricing", "0.8", "weekly"},
	{"/about", "0.8", "monthly"},
	{"/faq", "0.7", "monthly"},
	{"/user-agreement", "0.4", "yearly"},
	{"/privacy-policy", "0.4", "yearly"},
}

func writeRobotsTxt(c *gin.Context) {
	baseURL := getRequestBaseURL(c)
	robots := []string{
		"User-agent: *",
		"Allow: /",
		"Disallow: /api",
		"Disallow: /v1",
		"Disallow: /assets",
		"Disallow: /oauth",
		"Disallow: /console",
		"Disallow: /console/",
		"Disallow: /login",
		"Disallow: /register",
		"Disallow: /reset",
		"Disallow: /user/reset",
		"Crawl-delay: 5",
		"Sitemap: " + baseURL + "/sitemap.xml",
	}
	content := strings.Join(robots, "\n")
	writeStaticSEOResource(c, content, "text/plain; charset=utf-8", 1800)
}

func writeSitemapXML(c *gin.Context) {
	baseURL := getRequestBaseURL(c)
	now := time.Now().UTC().Format("2006-01-02")

	var entries []string
	for _, item := range publicSitemapEntries {
		var alternates []string
		for _, code := range sitemapHreflangs {
			alternates = append(alternates, fmt.Sprintf(
				`    <xhtml:link rel="alternate" hreflang="%s" href="%s" />`,
				code,
				buildLocalizedSitemapURL(baseURL, item.Path, code),
			))
		}

		entry := fmt.Sprintf(
			`  <url>
    <loc>%s</loc>
    <lastmod>%s</lastmod>
    <changefreq>%s</changefreq>
    <priority>%s</priority>
%s
  </url>`,
			baseURL+item.Path,
			now,
			item.Freq,
			item.Priority,
			strings.Join(alternates, "\n"),
		)
		entries = append(entries, entry)
	}
	xml := "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
	xml += "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">\n"
	xml += strings.Join(entries, "\n")
	xml += "\n</urlset>"
	writeStaticSEOResource(c, xml, "application/xml; charset=utf-8", 900)
}

func buildLocalizedSitemapURL(baseURL, path, hreflang string) string {
	if baseURL == "" {
		baseURL = "/"
	}

	rawURL := fmt.Sprintf("%s%s", strings.TrimRight(baseURL, "/"), path)
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}

	if strings.ToLower(hreflang) == "x-default" {
		return u.String()
	}

	localeTag := strings.ToLower(hreflang)
	param := localeTag
	if strings.Contains(localeTag, "-") {
		param = strings.SplitN(localeTag, "-", 2)[0]
	}
	q := u.Query()
	q.Set("hl", param)
	u.RawQuery = q.Encode()
	return u.String()
}

func writeStaticSEOResource(c *gin.Context, content, contentType string, maxAge int) {
	contentType = strings.TrimSpace(contentType)
	etag := fmt.Sprintf("\"%08x\"", crc32.ChecksumIEEE([]byte(content)))
	if match := c.GetHeader("If-None-Match"); match == etag {
		c.Status(http.StatusNotModified)
		return
	}

	c.Header("Cache-Control", fmt.Sprintf("public, max-age=%d, must-revalidate", maxAge))
	c.Header("Content-Type", contentType)
	c.Header("ETag", etag)
	c.Header("Last-Modified", time.Now().UTC().Format(http.TimeFormat))
	c.Data(http.StatusOK, contentType, []byte(content))
}

func getRequestBaseURL(c *gin.Context) string {
	if fixed := strings.TrimSpace(os.Getenv("SITE_BASE_URL")); fixed != "" {
		return strings.TrimRight(fixed, "/")
	}

	scheme := c.GetHeader("X-Forwarded-Proto")
	if scheme == "" {
		if c.Request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	host := c.GetHeader("X-Forwarded-Host")
	if host == "" {
		host = c.Request.Host
	}
	return fmt.Sprintf("%s://%s", scheme, host)
}

func isSeoPublicPath(path string) bool {
	cleanPath := strings.TrimRight(path, "/")
	if cleanPath == "" {
		cleanPath = "/"
	}
	switch cleanPath {
	case "/":
		return true
	case "/pricing":
		return true
	case "/about":
		return true
	case "/faq":
		return true
	case "/user-agreement":
		return true
	case "/privacy-policy":
		return true
	}
	return false
}
