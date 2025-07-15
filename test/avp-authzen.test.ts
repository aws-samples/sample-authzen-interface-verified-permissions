// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as path from 'node:path';

import { VerifiedPermissionsClient } from '@aws-sdk/client-verifiedpermissions';
import { expect, test, beforeAll, suite } from 'vitest';

import { gatewayDecisions, backendDecisions } from './util';
import { VerifiedPermissionsAuthZENProxy } from '../src/avp-authzen';
import { CedarInMemoryPIP } from '../src/pip';

suite('Verified Permissions Interop', async () => {
  const POLICY_STORE_ID = process.env['POLICY_STORE_ID'] as string;
  const TODO_BASE_PATH = path.resolve(__dirname, '..', 'cedar', 'todo-app');
  let authzenProxy: VerifiedPermissionsAuthZENProxy;

  beforeAll(async () => {
    const client = new VerifiedPermissionsClient();

    authzenProxy = new VerifiedPermissionsAuthZENProxy();
    authzenProxy.setVerifiedPermissionsClient(client);
    authzenProxy.setPolicyStoreId(POLICY_STORE_ID);
    authzenProxy.pip = CedarInMemoryPIP.fromBasePath(TODO_BASE_PATH);
  });

  test.each(gatewayDecisions.evaluation || [])(
    'Testing $request.subject.id $request.action.name $request.resource.id',
    async ({ request, expected }) => {
      const response = await authzenProxy.evaluation(request);
      expect(response.decision).toBe(expected);
    },
  );

  test.each(backendDecisions.evaluation || [])(
    'Testing $request.subject.id $request.action.name $request.resource.id',
    async ({ request, expected }) => {
      const response = await authzenProxy.evaluation(request);
      expect(response.decision).toBe(expected);
    },
  );

  test.each(backendDecisions.evaluations || [])(
    'Testing evaluations',
    async ({ request, expected }) => {
      const response = await authzenProxy.evaluations(request);
      expected.forEach((evaluation, index) => {
        expect(response.evaluations[index].decision).toBe(evaluation.decision);
      });
    },
  );
});
