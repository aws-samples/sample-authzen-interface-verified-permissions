// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { expect, test, suite, afterEach, vi } from 'vitest';
import { backendDecisions, gatewayDecisions } from './util';

const { AUTHZEN_PDP_URL, AUTHZEN_PDP_API_KEY } = process.env;
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

vi.setConfig({
  testTimeout: 10000, // saw timeouts with cold start Lambdas
});

suite('API Gateway Integration Tests', () => {
  afterEach(async () => {
    await sleep(100);
  });

  test.each(gatewayDecisions.evaluation || [])(
    'Testing $request.subject.id $request.action.name $request.resource.id',
    async ({ request, expected }) => {
      const response = await fetch(`${AUTHZEN_PDP_URL}/access/v1/evaluation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: AUTHZEN_PDP_API_KEY as string,
        },
        body: JSON.stringify(request),
      });
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.decision).toBe(expected);
    },
  );

  test.each(backendDecisions.evaluation || [])(
    'Testing $request.subject.id $request.action.name $request.resource.id',
    async ({ request, expected }) => {
      const response = await fetch(`${AUTHZEN_PDP_URL}/access/v1/evaluation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: AUTHZEN_PDP_API_KEY as string,
        },
        body: JSON.stringify(request),
      });
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.decision).toBe(expected);
    },
  );

  test.each(backendDecisions.evaluations || [])(
    'Testing evaluations',
    async ({ request, expected }) => {
      const response = await fetch(`${AUTHZEN_PDP_URL}/access/v1/evaluations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: AUTHZEN_PDP_API_KEY as string,
        },
        body: JSON.stringify(request),
      });
      expect(response.status).toBe(200);
      const result = await response.json();
      expected.forEach((evaluation, index) => {
        expect(result.evaluations[index].decision).toBe(evaluation.decision);
      });
    },
  );

  test('No Authorization header fails', async () => {
    const response = await fetch(`${AUTHZEN_PDP_URL}/access/v1/evaluation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      body: JSON.stringify({
        subject: {
          type: 'identity',
          id: 'CiRmZDA2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs',
        },
        action: {
          name: 'GET',
        },
        resource: {
          type: 'route',
          id: '/users/{userId}',
        },
      }),
    });
    expect(response.status).toBe(401);
  });

  test('Bad Authorization header fails', async () => {
    const response = await fetch(`${AUTHZEN_PDP_URL}/access/v1/evaluation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'badsecret',
        Connection: 'close',
      },
      body: JSON.stringify({
        subject: {
          type: 'identity',
          id: 'CiRmZDA2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs',
        },
        action: {
          name: 'GET',
        },
        resource: {
          type: 'route',
          id: '/users/{userId}',
        },
      }),
    });
    expect(response.status).toBe(403);
  });

  test('Request validation fails', async () => {
    const response = await fetch(`${AUTHZEN_PDP_URL}/access/v1/evaluation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AUTHZEN_PDP_API_KEY as string,
        Connection: 'close',
      },
      body: JSON.stringify({
        subjectX: {
          type: 'identity',
          id: 'CiRmZDA2MTRkMy1jMzlhLTQ3ODEtYjdiZC04Yjk2ZjVhNTEwMGQSBWxvY2Fs',
        },
        actionX: {
          name: 'GET',
        },
        resourceX: {
          type: 'route',
          id: '/users/{userId}',
        },
      }),
    });
    // TODO: debug why sometimes get a 403
    expect(response.status).toBe(400);
  });
});
