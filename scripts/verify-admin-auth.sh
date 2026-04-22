#!/usr/bin/env bash
set -euo pipefail

BASE=${BASE_URL:-http://127.0.0.1:3000}
USER=${AUTH_USER:-root}
PASS=${AUTH_PASS:-Root@1234}
COOKIE=${AUTH_COOKIE:-}
NOW=$(date +%s)

retry_curl() {
  local url="$1"
  local headers="$2"
  local method="${3:-GET}"
  local data="${4:-}"
  local out_file="${5:-/tmp/resp.json}"
  local retry
  local code

  for retry in 1 2 3 4 5 6; do
    if [ "$method" = "GET" ]; then
      code=$(curl -sS -o "$out_file" -w '%{http_code}' -H "$headers" "$url")
    else
      code=$(curl -sS -o "$out_file" -w '%{http_code}' -X "$method" "$url" -H "$headers" -H 'Content-Type: application/json' -d "$data")
    fi

    if [ "$code" != "429" ]; then
      echo "$code"
      return 0
    fi
    echo "retry:$retry code 429 for $url, wait 2s"
    sleep 2
  done

  echo "$code"
}

retry_post_with_body() {
  local url="$1"
  local headers="$2"
  local data="$3"
  local out_file="${4:-/tmp/resp.json}"
  local method="${5:-POST}"
  local header_file="${6:-}"
  local retry
  local code
  local retry_after
  local wait_seconds

  for retry in 1 2 3; do
    if [ -n "$header_file" ]; then
      code=$(curl -sS -o "$out_file" -D "$header_file" -w '%{http_code}' -X "$method" "$url" -H "$headers" -H 'Content-Type: application/json' -d "$data")
    else
      code=$(curl -sS -o "$out_file" -w '%{http_code}' -X "$method" "$url" -H "$headers" -H 'Content-Type: application/json' -d "$data")
    fi
    if [ "$code" != "429" ]; then
      echo "$code"
      return 0
    fi

    if [ -n "$header_file" ]; then
      retry_after=$(awk -F': ' 'tolower($1)=="retry-after"{print $2}' "$header_file" | tr -cd '0-9' | head -n1)
      wait_seconds=$( [ -n "$retry_after" ] && echo "$retry_after" || echo "$((retry * 3))" )
    else
      wait_seconds=$((retry * 3))
    fi
    echo "retry:$retry code 429 for $url, wait ${wait_seconds}s"
    sleep "$wait_seconds"
  done

  echo "$code"
}

echo "==> login"
if [ -z "${COOKIE:-}" ]; then
  LOGIN_BODY=$(mktemp)
  LOGIN_HDR=$(mktemp)
  CODE=$(retry_post_with_body "$BASE/api/user/login" 'Content-Type: application/json' "{\"username\":\"$USER\",\"password\":\"$PASS\"}" "$LOGIN_BODY" "POST" "$LOGIN_HDR")
  if [ "$CODE" != "200" ]; then
    echo "login failed: $CODE"; cat "$LOGIN_BODY"; exit 1
  fi
  COOKIE=$(awk '/^Set-Cookie:/ {print $2; exit}' "$LOGIN_HDR")
else
  echo "using AUTH_COOKIE from environment"
fi

echo "==> /api/user/self without New-Api-User"
CODE=$(curl -sS -o /tmp/resp.json -w '%{http_code}' -H "Cookie: $COOKIE" "$BASE/api/user/self")
if [ "$CODE" != "200" ]; then
  echo "expected 200, got $CODE"; cat /tmp/resp.json; exit 1
fi

echo "==> /api/user/search with wrong New-Api-User"
CODE=$(curl -sS -o /tmp/resp.json -w '%{http_code}' -H "Cookie: $COOKIE" -H 'New-Api-User: 999' "$BASE/api/user/search?keyword=&p=1&size=10")
if [ "$CODE" != "401" ]; then
  echo "expected 401, got $CODE"; cat /tmp/resp.json; exit 1
fi

echo "==> /api/user/search with correct New-Api-User"
CODE=$(curl -sS -o /tmp/resp.json -w '%{http_code}' -H "Cookie: $COOKIE" -H 'New-Api-User: 2' "$BASE/api/user/search?keyword=&p=1&size=10")
if [ "$CODE" != "200" ]; then
  echo "expected 200, got $CODE"; cat /tmp/resp.json; exit 1
fi

echo "==> /api/option/ without New-Api-User"
CODE=$(curl -sS -o /tmp/resp.json -w '%{http_code}' -H "Cookie: $COOKIE" "$BASE/api/option/")
if [ "$CODE" != "200" ]; then
  echo "expected 200, got $CODE"; cat /tmp/resp.json; exit 1
fi

echo "==> /api/user/ (admin user list)"
CODE=$(curl -sS -o /tmp/resp.json -w '%{http_code}' -H "Cookie: $COOKIE" "$BASE/api/user/?p=1&size=5")
if [ "$CODE" != "200" ]; then
  echo "expected 200, got $CODE"; cat /tmp/resp.json; exit 1
fi

echo "==> /api/channel/ (admin channel list)"
CODE=$(curl -sS -o /tmp/resp.json -w '%{http_code}' -H "Cookie: $COOKIE" "$BASE/api/channel/?p=1&size=5")
if [ "$CODE" != "200" ]; then
  echo "expected 200, got $CODE"; cat /tmp/resp.json; exit 1
fi

echo "==> /api/data/users (admin quota data)"
CODE=$(curl -sS -o /tmp/resp.json -w '%{http_code}' -H "Cookie: $COOKIE" "$BASE/api/data/users?size=5&p=1")
if [ "$CODE" != "200" ]; then
  echo "expected 200, got $CODE"; cat /tmp/resp.json; exit 1
fi

echo "==> create api token for TokenAuthReadOnly smoke"
TOKEN_NAME="smoke-auto-${NOW}"
CODE=$(curl -sS -o /tmp/create_token.json -w '%{http_code}' -X POST "$BASE/api/token/" \
  -H "Cookie: $COOKIE" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"$TOKEN_NAME\",\"remain_quota\":1000}")
if [ "$CODE" != "200" ]; then
  echo "create token failed: $CODE"; cat /tmp/create_token.json; exit 1
fi

TOKEN_LIST=$(curl -sS -H "Cookie: $COOKIE" "$BASE/api/token/search?keyword=$TOKEN_NAME&size=1")
TOKEN_ID=$(echo "$TOKEN_LIST" | sed -n 's/.*\"id\":\([0-9][0-9]*\).*/\1/p' | head -n 1)
if [ -z "$TOKEN_ID" ]; then
  echo "token id parse failed"; echo "$TOKEN_LIST"; exit 1
fi

TOKEN_KEY_JSON=$(retry_curl "$BASE/api/token/$TOKEN_ID/key" "Cookie: $COOKIE" "POST" "" /tmp/token_key.json)
if [ "$TOKEN_KEY_JSON" != "200" ]; then
  echo "fetch token key failed: $TOKEN_KEY_JSON"; cat /tmp/token_key.json; exit 1
fi
TOKEN_KEY=$(cat /tmp/token_key.json | sed -n 's/.*\"key\":\"\([^"]*\)\".*/\1/p')
if [ -z "$TOKEN_KEY" ]; then
  echo "token key parse failed"; cat /tmp/token_key.json; exit 1
fi

echo "==> /api/usage/token with token auth (TokenAuthReadOnly + token check)"
CODE=$(curl -sS -o /tmp/resp.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN_KEY" "$BASE/api/usage/token/")
if [ "$CODE" != "200" ]; then
  echo "expected 200, got $CODE"; cat /tmp/resp.json; exit 1
fi

echo "==> /api/log/token with token auth (read-only token log lookup)"
CODE=$(curl -sS -o /tmp/resp.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN_KEY" "$BASE/api/log/token")
if [ "$CODE" != "200" ]; then
  echo "expected 200, got $CODE"; cat /tmp/resp.json; exit 1
fi

echo "==> /api/usage/token with wrong token should fail"
CODE=$(curl -sS -o /tmp/resp.json -w '%{http_code}' -H "Authorization: Bearer this-token-does-not-exist" "$BASE/api/usage/token/")
if [ "$CODE" != "401" ]; then
  echo "expected 401, got $CODE"; cat /tmp/resp.json; exit 1
fi

echo "==> cleanup api token"
CODE=$(curl -sS -o /tmp/delete_token.json -w '%{http_code}' -X DELETE "$BASE/api/token/$TOKEN_ID" -H "Cookie: $COOKIE")
if [ "$CODE" != "200" ]; then
  echo "cleanup token failed: $CODE"; cat /tmp/delete_token.json; exit 1
fi

echo "all checks passed"
