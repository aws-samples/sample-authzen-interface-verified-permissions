// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as authzen from '../src/authzen';
import { CedarDynamoDBPIP, CedarInMemoryPIP } from '../src/pip';
// https://github.com/openid/authzen/blob/main/interop/authzen-api-gateways/test-harness/test/decisions.json
import rawGatewayDecisions from './gateway-decisions.json';
// https://github.com/openid/authzen/blob/main/interop/authzen-todo-backend/test/decisions-authorization-api-1_0-02.json
import rawBackendDecisions from './backend-decisions.json';
import { VerifiedPermissionsClient } from '@aws-sdk/client-verifiedpermissions';
import { VerifiedPermissionsAuthZENProxy } from '../src/avp-authzen';
import {
  EntityJson,
  Policy,
  PolicyId,
  PolicySet,
} from '@cedar-policy/cedar-wasm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

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

export const BASE_PATH = path.resolve(__dirname, '..', 'cedar');
export const getInteropInMemoryCedarPIP = (): CedarInMemoryPIP => {
  const entitiesJson: string = fs.readFileSync(
    path.join(BASE_PATH, 'cedarentities.json'),
    'utf-8',
  );
  const entities: Array<EntityJson> = JSON.parse(entitiesJson);

  const pip = new CedarInMemoryPIP();
  pip.setEntities(entities);

  return pip;
};

const ENTITIES_TABLE_NAME = process.env['ENTITIES_TABLE_NAME'] as string;
export const getInteropDynamoDBCedarPIP = (): CedarDynamoDBPIP => {
  const client = new DynamoDBClient({});
  const pip = new CedarDynamoDBPIP(client, ENTITIES_TABLE_NAME);

  return pip;
};

export const getInteropCedarPolicies = (): PolicySet => {
  const staticPolicies: Record<PolicyId, Policy> = {};
  const files = fs.readdirSync(BASE_PATH);
  for (const file of files) {
    if (path.extname(file) === '.cedar') {
      const filePath = path.join(BASE_PATH, file);

      const content = fs.readFileSync(filePath, 'utf8');
      staticPolicies[file] = content;
    }
  }
  return {
    staticPolicies: staticPolicies,
  };
};

const POLICY_STORE_ID = process.env['POLICY_STORE_ID'] as string;
export const getVerifiedPermissionsAuthZENProxy =
  (): VerifiedPermissionsAuthZENProxy => {
    const client = new VerifiedPermissionsClient();

    const authzenProxy = new VerifiedPermissionsAuthZENProxy();
    authzenProxy.setVerifiedPermissionsClient(client);
    authzenProxy.setPolicyStoreId(POLICY_STORE_ID);

    return authzenProxy;
  };
