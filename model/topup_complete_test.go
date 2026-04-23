package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompleteTopUpByTradeNo_CompletesAtomicallyAndIdempotent(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 501, 10)
	insertTopUpForPaymentGuardTest(t, "topup-complete-test", 501, "alipay")

	initialQuota := getUserQuotaForPaymentGuardTest(t, 501)
	require.Equal(t, 10, initialQuota)

	topUp, quotaToAdd, err := CompleteTopUpByTradeNo("topup-complete-test", "alipay")
	require.NoError(t, err)
	assert.Equal(t, common.TopUpStatusSuccess, topUp.Status)

	quotaDelta := int(decimal.NewFromInt(topUp.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart())
	assert.Equal(t, quotaDelta, quotaToAdd)
	assert.Equal(t, initialQuota+quotaDelta, getUserQuotaForPaymentGuardTest(t, 501))

	topUpAgain, quotaToAddAgain, err := CompleteTopUpByTradeNo("topup-complete-test", "alipay")
	require.NoError(t, err)
	assert.Equal(t, common.TopUpStatusSuccess, topUpAgain.Status)
	assert.Equal(t, 0, quotaToAddAgain)
	assert.Equal(t, initialQuota+quotaDelta, getUserQuotaForPaymentGuardTest(t, 501))
}

func TestCompleteTopUpByTradeNo_RejectsMismatchedPaymentMethod(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 502, 10)
	insertTopUpForPaymentGuardTest(t, "topup-mismatch-method", 502, "alipay")

	_, _, err := CompleteTopUpByTradeNo("topup-mismatch-method", "wxpay")
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)
	assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, "topup-mismatch-method"))
	assert.Equal(t, 10, getUserQuotaForPaymentGuardTest(t, 502))
}

func TestCompleteTopUpByTradeNo_RejectsInvalidQuotaAndKeepsOrderPending(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 503, 10)
	topUp := &TopUp{
		UserId:        503,
		Amount:        0,
		Money:         0.0,
		TradeNo:       "topup-zero-amount",
		PaymentMethod: "alipay",
		Status:        common.TopUpStatusPending,
	}
	require.NoError(t, topUp.Insert())

	_, _, err := CompleteTopUpByTradeNo("topup-zero-amount", "alipay")
	require.Error(t, err)
	assert.ErrorContains(t, err, "无效的充值额度")
	assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, "topup-zero-amount"))
	assert.Equal(t, 10, getUserQuotaForPaymentGuardTest(t, 503))
}
