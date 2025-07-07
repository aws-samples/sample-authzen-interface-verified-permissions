// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Server } from 'http';
import * as path from 'node:path';
import { randomUUID } from 'crypto';
import { app } from '../src/server';
import {
  backendDecisions,
  gatewayDecisions,
  getInteropInMemoryCedarPIP,
  getVerifiedPermissionsAuthZENProxy,
} from './util';
import { VerifiedPermissionsAuthZENProxy } from '../src/avp-authzen';
import { expect, test, beforeAll, afterAll, suite } from 'vitest';

suite('Express App Integration Tests', () => {
  let server: Server;
  const AUTHZEN_PDP_URL = 'http://localhost:3000';
  let authzenProxy: VerifiedPermissionsAuthZENProxy;

  beforeAll(async () => {
    // Setup VerifiedPermissionsAuthZEN instance
    authzenProxy = getVerifiedPermissionsAuthZENProxy();
    const TODO_BASE_PATH = path.resolve(__dirname, '..', 'cedar', 'todo-app');
    const pip = getInteropInMemoryCedarPIP(TODO_BASE_PATH);
    authzenProxy.setPip(pip);

    // Start the server
    await new Promise<void>((resolve) => {
      server = app.listen(3000, () => {
        resolve();
      });
    });
  });

  afterAll(async () => {
    await server.close();
  });

  test('/.well-known/authzen-configuration', async () => {
    const requestId = randomUUID().toString();
    const response = await fetch(
      `${AUTHZEN_PDP_URL}/.well-known/authzen-configuration`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe(requestId);
    const result = await response.json();
    expect(result.policy_decision_point).toBe(AUTHZEN_PDP_URL);
  });

  test.each(gatewayDecisions.evaluation || [])(
    'Testing $request.subject.id $request.action.name $request.resource.id',
    async ({ request, expected }) => {
      const requestId = randomUUID().toString();
      const response = await fetch(`${AUTHZEN_PDP_URL}/access/v1/evaluation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
        body: JSON.stringify(request),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Request-ID')).toBe(requestId);
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
});
