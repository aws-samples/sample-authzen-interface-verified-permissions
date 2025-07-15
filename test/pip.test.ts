// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as path from 'node:path';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EntityJson, TypeAndId } from '@cedar-policy/cedar-wasm';
import { expect, test, beforeAll, suite } from 'vitest';

import { CedarDynamoDBPIP, CedarInMemoryPIP } from '../src/pip';

const allIds = new Set([
  'CiRmZDA2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs',
  'CiRmZDM2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs',
  'CiRmZDE2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs',
  'CiRmZDI2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs',
  'CiRmZDQ2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs',
]);

// https://github.com/openid/authzen/blob/main/interop/authzen-api-gateways/test-harness/test/decisions.json
suite('Cedar InMemory PIP Todo (1.0 Draft 02)', async () => {
  const TODO_BASE_PATH = path.resolve(__dirname, '..', 'cedar', 'todo-app');
  let pip: CedarInMemoryPIP;

  beforeAll(async () => {
    pip = CedarInMemoryPIP.fromBasePath(TODO_BASE_PATH);
  });

  test('scanEntities identity', async () => {
    const identityIds = await pip.scanEntities('identity');
    expect(new Set(identityIds)).toEqual(allIds);
  });

  test('scanEntities user', async () => {
    const userIds = await pip.scanEntities('user');
    expect(new Set(userIds)).toEqual(allIds);
  });

  test('findActions user todo', async () => {
    const expected = new Set([
      'can_read_todos',
      'can_create_todo',
      'can_update_todo',
      'can_delete_todo',
    ]);
    const actions = await pip.findApplicableActions('user', 'todo');
    expect(new Set(actions)).toEqual(expected);
  });

  test('findActions identity route', async () => {
    const expected = new Set(['GET', 'POST', 'PUT', 'DELETE']);
    const actions = await pip.findApplicableActions('identity', 'route');
    expect(new Set(actions)).toEqual(expected);
  });

  test('Richard Roe & John Doe', async () => {
    const pid0 = 'CiRmZDA2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs';
    const pid1 = 'CiRmZDE2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs';

    const entities = await pip.findEntities([
      { type: 'identity', id: pid0 },
      { type: 'identity', id: pid1 },
    ]);
    if (entities) {
      expect(entities.length).toBe(2);
      if (entities[0]) {
        expect((entities[0]?.uid as TypeAndId).id).toBe(pid0);
      }
      if (entities[1]) {
        expect((entities[1]?.uid as TypeAndId).id).toBe(pid1);
      }
    }
  });

  test('also find parents', async () => {
    const pipEntities: EntityJson[] = [];
    pipEntities.push({
      uid: { type: 'identity', id: 'ID0' },
      attrs: {},
      parents: [],
    } as EntityJson);
    pipEntities.push({
      uid: { type: 'identity', id: 'ID1' },
      attrs: {},
      parents: [{ type: 'identity', id: 'ID0' }],
    } as EntityJson);

    const testpip = new CedarInMemoryPIP();
    testpip.loadEntities(pipEntities);

    const entities = await testpip.findEntities([
      { type: 'identity', id: 'ID1' },
    ]);
    if (entities) {
      expect(entities.length).toBe(2);
    }
    const ids = new Set<string>();
    if (entities) {
      for (const entity of entities) {
        ids.add((entity.uid as TypeAndId).id);
      }
    }
    expect(ids).toEqual(new Set(['ID0', 'ID1']));
  });
});

const missingEntitiesTableName = !process.env.ENTITIES_TABLE_NAME;
if (missingEntitiesTableName) {
  console.warn(
    '⚠️  Skipping Cedar DynamoDB PIP Todo (1.0 Draft 02): ENTITIES_TABLE_NAME environment variable is required',
  );
}

suite.skipIf(missingEntitiesTableName)(
  'Cedar DynamoDB PIP Todo (1.0 Draft 02)',
  async () => {
    let pip: CedarDynamoDBPIP;

    beforeAll(async () => {
      const ENTITIES_TABLE_NAME = process.env['ENTITIES_TABLE_NAME'] as string;
      const client = new DynamoDBClient({});
      pip = new CedarDynamoDBPIP(client, ENTITIES_TABLE_NAME);
    });

    test('scanEntities identity', async () => {
      const identityIds = await pip.scanEntities('identity');
      expect(new Set(identityIds)).toEqual(allIds);
    });

    test('scanEntities user', async () => {
      const userIds = await pip.scanEntities('user');
      expect(new Set(userIds)).toEqual(allIds);
    });

    test('Richard Roe & John Doe', async () => {
      const pid0 =
        'CiRmZDA2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs';
      const pid1 =
        'CiRmZDE2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs';

      const entities = await pip.findEntities([
        { type: 'identity', id: pid0 },
        { type: 'identity', id: pid1 },
      ]);
      if (entities) {
        expect(entities.length).toBe(2);
        if (entities[0]) {
          expect((entities[0]?.uid as TypeAndId).id).toBe(pid0);
        }
        if (entities[1]) {
          expect((entities[1]?.uid as TypeAndId).id).toBe(pid1);
        }
      }
    });
  },
);
