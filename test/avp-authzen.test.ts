// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { VerifiedPermissionsAuthZENProxy } from '../src/avp-authzen';
import { CedarInMemoryPIP } from '../src/pip';
import {
  gatewayDecisions,
  getVerifiedPermissionsAuthZENProxy,
  backendDecisions,
} from './util';
import * as path from 'node:path';
import { expect, test, beforeAll, suite } from 'vitest';

suite('Verified Permissions Interop', async () => {
  const TODO_BASE_PATH = path.resolve(__dirname, '..', 'cedar', 'todo-app');
  let authzenProxy: VerifiedPermissionsAuthZENProxy;

  beforeAll(async () => {
    authzenProxy = getVerifiedPermissionsAuthZENProxy();
    authzenProxy.setPip(CedarInMemoryPIP.fromBasePath(TODO_BASE_PATH));
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
