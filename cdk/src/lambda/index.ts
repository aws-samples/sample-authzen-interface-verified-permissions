// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Context } from 'aws-lambda';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Logger } from '@aws-lambda-powertools/logger';
import { LambdaInterface } from '@aws-lambda-powertools/commons/types';
import { VerifiedPermissionsClient } from '@aws-sdk/client-verifiedpermissions';
import { VerifiedPermissionsAuthZENProxy } from '../../../src/avp-authzen';
import {
  AccessEvaluationRequest,
  AccessEvaluationRequestSchema,
  AccessEvaluationsRequest,
  AccessEvaluationsRequestSchema,
  ActionSearchRequest,
  AuthZENRequest,
  AuthZENResponse,
  ResourceSearchRequest,
  SubjectSearchRequest,
} from '../../../src/authzen';
import { CedarDynamoDBPIP } from '../../../src/pip';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// https://docs.powertools.aws.dev/lambda/typescript/latest/core/tracer/#lambda-handler
const tracer = new Tracer();
const logger = new Logger();

const AWS_REGION = process.env['AWS_REGION'];
const POLICY_STORE_ID = process.env['POLICY_STORE_ID'] as string;
const ENTITIES_TABLE_NAME = process.env['ENTITIES_TABLE_NAME'] as string;

const config = { region: AWS_REGION };
const vpClient = tracer.captureAWSv3Client(
  new VerifiedPermissionsClient(config),
);
const ddbClient = tracer.captureAWSv3Client(new DynamoDBClient(config));

const authzenProxy = new VerifiedPermissionsAuthZENProxy();
authzenProxy.setLogger(logger);
authzenProxy.setVerifiedPermissionsClient(vpClient);
authzenProxy.setPolicyStoreId(POLICY_STORE_ID);
if (ENTITIES_TABLE_NAME) {
  const pip = new CedarDynamoDBPIP(ddbClient, ENTITIES_TABLE_NAME);
  authzenProxy.setPip(pip);
}

// validate X-Request-ID header against common trace id formats
const requestIdPattern = /^[a-zA-Z0-9._:\/-]+$/;

// Custom event types for AuthZEN APIs
type AuthZENAPI =
  | 'evaluation'
  | 'evaluations'
  | 'subjectsearch'
  | 'resourcesearch'
  | 'actionsearch';

export interface AuthZENEvent<T = AuthZENRequest> {
  api: AuthZENAPI;
  requestId?: string;
  request: T;
}

export type EvaluationEvent = AuthZENEvent<AccessEvaluationRequest> & {
  api: 'evaluation';
};
export type EvaluationsEvent = AuthZENEvent<AccessEvaluationsRequest> & {
  api: 'evaluations';
};
export type SubjectSearchEvent = AuthZENEvent<SubjectSearchRequest> & {
  api: 'subjectsearch';
};
export type ResourceSearchEvent = AuthZENEvent<ResourceSearchRequest> & {
  api: 'resourcesearch';
};
export type ActionSearchEvent = AuthZENEvent<ActionSearchRequest> & {
  api: 'actionsearch';
};

type AuthZENEventUnion =
  | EvaluationEvent
  | EvaluationsEvent
  | SubjectSearchEvent
  | ResourceSearchEvent
  | ActionSearchEvent;

export interface HandlerResponse {
  requestId?: string;
  response: AuthZENResponse;
}

class Lambda implements LambdaInterface {
  // decorate the handler class method for X-Ray
  @tracer.captureLambdaHandler({ captureResponse: true })
  public async handler(
    event: AuthZENEventUnion,
    context: Context,
  ): Promise<HandlerResponse> {
    logger.appendKeys({
      authzen_api: event.api,
    });
    logger.addContext(context);

    if (event.requestId) {
      if (requestIdPattern.test(event.requestId)) {
        logger.appendKeys({
          authzen_request_id: event.requestId,
        });
        tracer.putAnnotation('authzen_request_id', event.requestId);
      } else {
        event.requestId = undefined;
      }
    }

    tracer.putAnnotation('authzen_api', event.api);
    tracer.putAnnotation('PolicyStoreId', POLICY_STORE_ID);

    logger.info('Processing event', {
      requestData: event.request,
      policyStoreId: POLICY_STORE_ID,
    });

    let response: AuthZENResponse | null = null;
    try {
      if (event.api === 'evaluation') {
        const validatedData = AccessEvaluationRequestSchema.parse(
          event.request,
        );
        response = await authzenProxy.evaluation(validatedData);
        logger.info('AuthZEN AccessEvaluationResponse', {
          result: response,
        });
      } else if (event.api === 'evaluations') {
        const validatedData = AccessEvaluationsRequestSchema.parse(
          event.request,
        );
        response = await authzenProxy.evaluations(validatedData);
        logger.info('AuthZEN AccessEvaluationsResponse', {
          result: response,
        });
      } else if (event.api === 'subjectsearch') {
        response = await authzenProxy.subjectsearch(
          event.request as SubjectSearchRequest,
        );
        logger.info('SearchResponse', {
          result: response,
        });
      } else if (event.api === 'resourcesearch') {
        response = await authzenProxy.resourcesearch(
          event.request as ResourceSearchRequest,
        );
        logger.info('SearchResponse', {
          result: response,
        });
      } else if (event.api === 'actionsearch') {
        response = await authzenProxy.actionsearch(
          event.request as ActionSearchRequest,
        );
        logger.info('ActionSearchResponse', {
          result: response,
        });
      }
    } catch (error) {
      logger.error('Error processing event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestData: event.request,
        stack: error instanceof Error ? error.stack : undefined,
      });
      tracer.addErrorAsMetadata(error);
    } finally {
      logger.resetKeys();
    }

    const handlerResponse = {
      ...(event.requestId && { requestId: event.requestId }),
      response: response,
    };

    return handlerResponse;
  }
}

const handlerClass = new Lambda();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
