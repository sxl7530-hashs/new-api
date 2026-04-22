package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func CheckSelfUpdate(c *gin.Context) {
	ctx, cancel := service.NewSelfUpdateContext()
	defer cancel()

	result, err := service.CheckSelfUpdate(ctx)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    result,
	})
}

func ApplySelfUpdate(c *gin.Context) {
	ctx, cancel := service.NewSelfUpdateContext()
	defer cancel()

	result, err := service.ApplySelfUpdate(ctx)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "更新完成",
		"data":    result,
	})
}
