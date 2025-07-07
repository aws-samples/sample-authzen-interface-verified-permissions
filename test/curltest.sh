# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
curl -X POST \
  -H "Authorization: ${AUTHZEN_PDP_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: $(date +%s%3)" \
  -D - \
  -d '{
    "subject": {
      "type": "identity",
      "id": "CiRmZDA2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs",
      "properties": {
        "roles": ["admin", "evil_genius"]
      }
    },
    "action": {
      "name": "PUT"
    },
    "resource": {
      "type": "route",
      "id": "/todos/{todoId}",
      "properties": {}
    }
  }' \
  "${AUTHZEN_PDP_URL}/access/v1/evaluation"
