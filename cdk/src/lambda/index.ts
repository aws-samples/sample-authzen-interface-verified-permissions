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
  AccessEvaluationResponse,
  AccessEvaluationsRequest,
  AccessEvaluationsRequestSchema,
  AccessEvaluationsResponse,
  ResourceSearchRequest,
  SearchResponse,
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

// Custom event types for AuthZEN APIs
export interface EvaluationEvent {
  api: 'evaluation';
  request: AccessEvaluationRequest;
}
export interface EvaluationsEvent {
  api: 'evaluations';
  request: AccessEvaluationsRequest;
}
export interface SubjectSearchEvent {
  api: 'subjectsearch';
  request: SubjectSearchRequest;
}
export interface ResourceSearchEvent {
  api: 'resourcesearch';
  request: ResourceSearchRequest;
}

class Lambda implements LambdaInterface {
  // decorate the handler class method for X-Ray
  @tracer.captureLambdaHandler({ captureResponse: true })
  public async handler(
    event:
      | EvaluationEvent
      | EvaluationsEvent
      | SubjectSearchEvent
      | ResourceSearchEvent,
    context: Context,
  ): Promise<
    AccessEvaluationResponse | AccessEvaluationsResponse | SearchResponse
  > {
    logger.appendKeys({
      api: event.api,
    });
    logger.addContext(context);

    tracer.putAnnotation('api', event.api);
    tracer.putAnnotation('policyStoreId', POLICY_STORE_ID);

    logger.info('Processing event', {
      requestData: event.request,
      policyStoreId: POLICY_STORE_ID,
    });

    let response = null;
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

    return response;
  }
}

const handlerClass = new Lambda();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
