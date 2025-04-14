// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { VerifiedPermissionsAuthZENProxy } from '../src/avp-authzen';
import {
  gatewayDecisions,
  getVerifiedPermissionsAuthZENProxy,
  getInteropInMemoryCedarPIP,
  backendDecisions,
} from './util';
import { expect, test, beforeAll, suite } from 'vitest';

suite('Verified Permissions Interop', async () => {
  let authzenProxy: VerifiedPermissionsAuthZENProxy;

  beforeAll(async () => {
    authzenProxy = getVerifiedPermissionsAuthZENProxy();
    authzenProxy.setPip(getInteropInMemoryCedarPIP());
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
