// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as path from 'node:path';
import { CedarDynamoDBPIP, CedarInMemoryPIP } from '../src/pip';
import { EntityJson, TypeAndId } from '@cedar-policy/cedar-wasm';
import { getInteropDynamoDBCedarPIP, getInteropInMemoryCedarPIP } from './util';
import { expect, test, beforeAll, suite } from 'vitest';

// https://github.com/openid/authzen/blob/main/interop/authzen-api-gateways/test-harness/test/decisions.json
suite('Cedar InMemory PIP Todo (1.0 Draft 02)', async () => {
  const TODO_BASE_PATH = path.resolve(__dirname, '..', 'cedar', 'todo-app');
  let pip: CedarInMemoryPIP;

  beforeAll(async () => {
    pip = getInteropInMemoryCedarPIP(TODO_BASE_PATH);
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
    testpip.setEntities(pipEntities);

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

suite('Cedar DynamoDB PIP Todo (1.0 Draft 02)', async () => {
  let pip: CedarDynamoDBPIP;

  beforeAll(async () => {
    const ENTITIES_TABLE_NAME = process.env['ENTITIES_TABLE_NAME'] as string;
    pip = getInteropDynamoDBCedarPIP(ENTITIES_TABLE_NAME);
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
});
