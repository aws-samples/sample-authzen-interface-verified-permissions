// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as authzen from '../src/authzen';
// https://github.com/openid/authzen/blob/main/interop/authzen-api-gateways/test-harness/test/decisions.json
import rawGatewayDecisions from './todo-app/gateway-decisions.json';
// https://github.com/openid/authzen/blob/main/interop/authzen-todo-backend/test/decisions-authorization-api-1_0-02.json
import rawBackendDecisions from './todo-app/backend-decisions.json';
// https://github.com/openid/authzen/blob/main/interop/authzen-search-demo/test/action/results.json
import rawActionDecisions from './search-app/action-decisions.json';
// https://github.com/openid/authzen/blob/main/interop/authzen-search-demo/test/resource/results.json
import rawResourceDecisions from './search-app/resource-decisions.json';
// https://github.com/openid/authzen/blob/main/interop/authzen-search-demo/test/subject/results.json
import rawSubjectDecisions from './search-app/subject-decisions.json';
import { VerifiedPermissionsClient } from '@aws-sdk/client-verifiedpermissions';
import { VerifiedPermissionsAuthZENProxy } from '../src/avp-authzen';

type Decisions = {
  evaluation?: {
    request: authzen.AccessEvaluationRequest;
    expected: boolean;
  }[];
  evaluations?: {
    request: authzen.AccessEvaluationsRequest;
    expected: { decision: boolean }[];
  }[];
};

export const gatewayDecisions = rawGatewayDecisions as Decisions;
export const backendDecisions = rawBackendDecisions as Decisions;

type ActionSearchDecisions = {
  evaluation?: {
    request: authzen.ActionSearchRequest;
    expected: authzen.ActionSearchResponse;
  }[];
};
type SearchDecisions = {
  evaluation?: {
    request: authzen.SubjectSearchRequest | authzen.ResourceSearchRequest;
    expected: authzen.SearchResponse;
  }[];
};

export const actionDecisions = rawActionDecisions as ActionSearchDecisions;
export const subjectDecisions = rawSubjectDecisions as SearchDecisions;
export const resourceDecisions = rawResourceDecisions as SearchDecisions;

const POLICY_STORE_ID = process.env['POLICY_STORE_ID'] as string;
export const getVerifiedPermissionsAuthZENProxy =
  (): VerifiedPermissionsAuthZENProxy => {
    const client = new VerifiedPermissionsClient();

    const authzenProxy = new VerifiedPermissionsAuthZENProxy();
    authzenProxy.setVerifiedPermissionsClient(client);
    authzenProxy.setPolicyStoreId(POLICY_STORE_ID);

    return authzenProxy;
  };
