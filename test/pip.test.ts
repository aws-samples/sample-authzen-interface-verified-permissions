// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { CedarDynamoDBPIP, CedarInMemoryPIP } from '../src/pip';
import { EntityJson, TypeAndId } from '@cedar-policy/cedar-wasm';
import { getInteropDynamoDBCedarPIP, getInteropInMemoryCedarPIP } from './util';
import { expect, test, beforeAll, suite } from 'vitest';

// https://github.com/openid/authzen/blob/main/interop/authzen-api-gateways/test-harness/test/decisions.json
suite('Cedar InMemory PIP', async () => {
  let pip: CedarInMemoryPIP;

  beforeAll(async () => {
    pip = getInteropInMemoryCedarPIP();
  });

  test('Richard Roe', async () => {
    const pid = 'CiRmZDA2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs';

    const entities = await pip.findEntities([{ type: 'identity', id: pid }]);
    if (entities) {
      expect(entities.length).toBe(1);
      if (entities[0]) {
        expect((entities[0]?.uid as TypeAndId).id).toBe(pid);
      }
    }
  });

  test('also find parents', async () => {
    const pipEntities: Array<EntityJson> = [];
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

suite('Cedar DynamoDB PIP', async () => {
  let pip: CedarDynamoDBPIP;

  beforeAll(async () => {
    pip = getInteropDynamoDBCedarPIP();
  });

  test('Richard Roe', async () => {
    const pid = 'CiRmZDA2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs';

    const entities = await pip.findEntities([{ type: 'identity', id: pid }]);
    if (entities) {
      expect(entities.length).toBe(1);
      if (entities[0]) {
        expect((entities[0]?.uid as TypeAndId).id).toBe(pid);
      }
    }
  });
});
