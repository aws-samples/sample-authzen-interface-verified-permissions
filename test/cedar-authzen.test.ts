// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DetailedError, EntityJson } from '@cedar-policy/cedar-wasm';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { expect, test, beforeAll, suite } from 'vitest';

import {
  gatewayDecisions,
  backendDecisions,
  resourceDecisions,
  subjectDecisions,
  actionDecisions,
} from './util';
import { ReasonObject } from '../src/authzen';
import { CedarAuthZENProxy } from '../src/cedar-authzen';
import { CedarInMemoryPIP } from '../src/pip';

suite('Cedar WASM', async () => {
  test('SDK version: 4.7.0', () => {
    expect(cedar.getCedarVersion()).toBe('4.7.0');
  });
});

suite('Cedar Interop Todo (1.0 Draft 02)', () => {
  const TODO_BASE_PATH = path.resolve(__dirname, '..', 'cedar', 'todo-app');
  let authzenProxy: CedarAuthZENProxy;
  let entities: EntityJson[];
  let pip: CedarInMemoryPIP;

  beforeAll(() => {
    const ENTITIES_FILE = path.resolve(TODO_BASE_PATH, 'cedarentities.json');
    const entitiesJson: string = fs.readFileSync(ENTITIES_FILE, 'utf-8');
    entities = JSON.parse(entitiesJson);

    authzenProxy = CedarAuthZENProxy.fromBasePath(TODO_BASE_PATH);

    pip = CedarInMemoryPIP.fromBasePath(TODO_BASE_PATH);
    authzenProxy.pip = pip;
  });

  test('parse Schema', () => {
    let errorMessage;
    const answer = cedar.checkParseSchema(pip.schema);
    if (answer.type == 'failure') {
      errorMessage = `${answer.errors.map((err: DetailedError) => `- ${err.message}`).join('\n')}`;
    }
    expect(answer.type, errorMessage).toBe('success');
  });

  test('parse Entities', () => {
    let errorMessage;
    const answer = cedar.checkParseEntities({
      schema: pip.schema,
      entities: entities,
    });
    if (answer.type == 'failure') {
      errorMessage = `${answer.errors.map((err: DetailedError) => `- ${err.message}`).join('\n')}`;
    }
    expect(answer.type, errorMessage).toBe('success');
  });

  test('validate PolicySet', () => {
    let errorMessage;
    const answer = cedar.validate({
      validationSettings: { mode: 'strict' },
      schema: pip.schema,
      policies: authzenProxy.policies,
    });
    if (answer.type == 'failure') {
      errorMessage = `${answer.errors.map((err: DetailedError) => `- ${err.message}`).join('\n')}`;
    }
    expect(answer.type, errorMessage).toBe('success');
    if (answer.type == 'success') {
      expect(answer.validationErrors).toHaveLength(0);
    }
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

  test.each(backendDecisions.evaluations || [])(
    'Testing evaluations',
    async ({ request, expected }) => {
      const response = await authzenProxy.evaluations(request);
      expected.forEach((evaluation, index) => {
        expect(response.evaluations[index].decision).toBe(evaluation.decision);
      });
    },
  );

  test('evaluation uses subject properties', async () => {
    const testProxy = CedarAuthZENProxy.fromBasePath(TODO_BASE_PATH);
    // new CedarInMemoryPIP with no call to pip.setEntities
    testProxy.pip = new CedarInMemoryPIP();

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
      expect((response.context as ReasonObject).reason_admin['200']).toBe(
        'Decision allow by policy: DELETE-todostodoId.cedar',
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
      expect((response.context as ReasonObject).reason_admin['200']).toBe(
        'Decision allow by policy: can_delete_todo.cedar',
      );
    }
  });
});

suite('Cedar Interop Search (1.0 Draft 03)', () => {
  const TODO_BASE_PATH = path.resolve(__dirname, '..', 'cedar', 'search-app');
  let authzenProxy: CedarAuthZENProxy;
  let entities: EntityJson[];
  let pip: CedarInMemoryPIP;

  beforeAll(() => {
    const ENTITIES_FILE = path.resolve(TODO_BASE_PATH, 'cedarentities.json');
    const entitiesJson: string = fs.readFileSync(ENTITIES_FILE, 'utf-8');
    entities = JSON.parse(entitiesJson);

    authzenProxy = CedarAuthZENProxy.fromBasePath(TODO_BASE_PATH);

    pip = CedarInMemoryPIP.fromBasePath(TODO_BASE_PATH);
    authzenProxy.pip = pip;
  });

  test('parse Schema', () => {
    let errorMessage;
    const answer = cedar.checkParseSchema(pip.schema);
    if (answer.type == 'failure') {
      errorMessage = `${answer.errors.map((err: DetailedError) => `- ${err.message}`).join('\n')}`;
    }
    expect(answer.type, errorMessage).toBe('success');
  });

  test('parse Entities', () => {
    let errorMessage;
    const answer = cedar.checkParseEntities({
      schema: pip.schema,
      entities: entities,
    });
    if (answer.type == 'failure') {
      errorMessage = `${answer.errors.map((err: DetailedError) => `- ${err.message}`).join('\n')}`;
    }
    expect(answer.type, errorMessage).toBe('success');
  });

  test('validate PolicySet', () => {
    let errorMessage;
    const answer = cedar.validate({
      validationSettings: { mode: 'strict' },
      schema: pip.schema,
      policies: authzenProxy.policies,
    });
    if (answer.type == 'failure') {
      errorMessage = `${answer.errors.map((err: DetailedError) => `- ${err.message}`).join('\n')}`;
    }
    expect(answer.type, errorMessage).toBe('success');
    if (answer.type == 'success') {
      expect(answer.validationErrors).toHaveLength(0);
    }
  });

  test.each(resourceDecisions.evaluation || [])(
    'resourcesearch $request.subject.id $request.action.name $request.resource.type',
    async ({ request, expected }) => {
      const response = await authzenProxy.resourcesearch(request);
      expect(response.results).toStrictEqual(expected.results);
    },
  );

  test.each(subjectDecisions.evaluation || [])(
    'subjectsearch $request.subject.type $request.action.name $request.resource.id',
    async ({ request, expected }) => {
      const response = await authzenProxy.subjectsearch(request);
      expect(response.results).toStrictEqual(expected.results);
    },
  );

  test.each(actionDecisions.evaluation || [])(
    'actionsearch $request.subject.id $request.resource.id',
    async ({ request, expected }) => {
      const response = await authzenProxy.actionsearch(request);
      expect(
        response.results.sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual(expected.results.sort((a, b) => a.name.localeCompare(b.name)));
    },
  );
});
