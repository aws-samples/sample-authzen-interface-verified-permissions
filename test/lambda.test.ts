// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { backendDecisions, gatewayDecisions } from './util';
import { Context } from 'aws-lambda';
import {
  EvaluationEvent,
  EvaluationsEvent,
  lambdaHandler,
} from '../cdk/src/lambda';
import {
  AccessEvaluationResponse,
  AccessEvaluationsResponse,
} from '../src/authzen';
import { expect, test, suite } from 'vitest';

suite('Lambda Function Tests', () => {
  const createMockContext = (): Context => {
    const mockContext: Partial<Context> = {
      functionName: 'PDPLambda',
      awsRequestId: Date.now().toString(),
    };

    return mockContext as Context;
  };

  test.each(gatewayDecisions.evaluation || [])(
    'Testing evaluation $request.subject.id $request.action.name $request.resource.id',
    async ({ request, expected }) => {
      const event: EvaluationEvent = {
        api: 'evaluation',
        request,
      };

      const result = (await lambdaHandler(
        event,
        createMockContext(),
      )) as AccessEvaluationResponse;
      expect(result.decision).toBe(expected);
    },
  );

  test.each(backendDecisions.evaluation || [])(
    'Testing evaluation $request.subject.id $request.action.name $request.resource.id',
    async ({ request, expected }) => {
      const event: EvaluationEvent = {
        api: 'evaluation',
        request,
      };

      const result = (await lambdaHandler(
        event,
        createMockContext(),
      )) as AccessEvaluationResponse;
      expect(result.decision).toBe(expected);
    },
  );

  test.each(backendDecisions.evaluations || [])(
    'Testing evaluations',
    async ({ request, expected }) => {
      const event: EvaluationsEvent = {
        api: 'evaluations',
        request,
      };

      const result = (await lambdaHandler(
        event,
        createMockContext(),
      )) as AccessEvaluationsResponse;
      expected.forEach((evaluation, index) => {
        expect(result.evaluations[index].decision).toBe(evaluation.decision);
      });
    },
  );
});
