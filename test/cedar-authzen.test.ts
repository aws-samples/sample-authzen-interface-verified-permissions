// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cedar = require('@cedar-policy/cedar-wasm/nodejs');
import { DetailedError, PolicySet } from '@cedar-policy/cedar-wasm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CedarAuthZENProxy } from '../src/cedar-authzen';
import {
  gatewayDecisions,
  getInteropInMemoryCedarPIP,
  BASE_PATH,
  getInteropCedarPolicies,
  backendDecisions,
} from './util';
import { expect, test, beforeAll, suite } from 'vitest';
import { CedarInMemoryPIP } from '../src/pip';
import { ReasonObject } from '../src/authzen';

suite('Cedar WASM', async () => {
  test('SDK version: 4.3.3', () => {
    expect(cedar.getCedarVersion()).toBe('4.3.3');
  });
});

suite('Cedar Interop', () => {
  let authzenProxy: CedarAuthZENProxy;
  let cedarSchema: string;
  let policies: PolicySet;

  beforeAll(() => {
    const SCHEMA_FILE = path.resolve(BASE_PATH, 'cedarschema');
    cedarSchema = fs.readFileSync(SCHEMA_FILE, 'utf8');

    policies = getInteropCedarPolicies();

    authzenProxy = new CedarAuthZENProxy();
    authzenProxy.setPolicies(policies);

    const pip = getInteropInMemoryCedarPIP();
    authzenProxy.setPip(pip);
  });

  test('validate Schema and PolicySet', () => {
    let errorMessage;
    const answer = cedar.validate({
      validationSettings: { mode: 'strict' },
      schema: cedarSchema,
      policies: policies,
    });
    if (answer.type == 'failure') {
      errorMessage = `${answer.errors.map((err: DetailedError) => `- ${err.message}`).join('\n')}`;
    }
    expect(answer.type, errorMessage).toBe('success');
  });

  test.each(gatewayDecisions.evaluation || [])(
    'evaluation $request.subject.id $request.action.name $request.resource.id',
    async ({ request, expected }) => {
      const response = await authzenProxy.evaluation(request);
      expect(response.decision).toBe(expected);
    },
  );

  test.each(backendDecisions.evaluation || [])(
    'evaluation $request.subject.id $request.action.name $request.resource.id',
    async ({ request, expected }) => {
      const response = await authzenProxy.evaluation(request);
      expect(response.decision).toBe(expected);
    },
  );

  test('evaluation uses subject properties', async () => {
    const testProxy = new CedarAuthZENProxy();
    testProxy.setPolicies(getInteropCedarPolicies());
    // new CedarInMemoryPIP with no call to pip.setEntities
    testProxy.setPip(new CedarInMemoryPIP());

    const response = await testProxy.evaluation({
      subject: {
        type: 'identity',
        id: 'CiRmZDA2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs',
        properties: {
          roles: ['admin', 'evil_genius'],
        },
      },
      action: {
        name: 'DELETE',
      },
      resource: {
        type: 'route',
        id: '/todos/{todoId}',
      },
    });
    expect(response.decision).toBe(true);
    if (response.context?.reason_admin) {
      expect((response.context as ReasonObject).reason_admin['0']).toBe(
        'DELETE-todostodoId.cedar',
      );
    }
  });

  test('evaluation uses resource properties', async () => {
    const response = await authzenProxy.evaluation({
      subject: {
        type: 'identity',
        id: 'CiRmZDE2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs',
      },
      action: {
        name: 'can_delete_todo',
      },
      resource: {
        type: 'todo',
        id: '7240d0db-8ff0-41ec-98b2-34a096273b9f',
        properties: {
          ownerID: 'john_doe@example.com',
        },
      },
      context: {},
    });
    expect(response.decision).toBe(true);
    if (response.context?.reason_admin) {
      expect((response.context as ReasonObject).reason_admin['0']).toBe(
        'can_delete_todo.cedar',
      );
    }
  });
});
