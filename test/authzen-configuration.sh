# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
curl -X GET \
  -H "Authorization: ${AUTHZEN_PDP_API_KEY}" \
  -D - \
  "${AUTHZEN_PDP_URL}/.well-known/authzen-configuration"