// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { LambdaInterface } from '@aws-lambda-powertools/commons/types';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from 'aws-lambda';

// https://docs.powertools.aws.dev/lambda/typescript/latest/core/tracer/#lambda-handler
const tracer = new Tracer();

const AWS_REGION = process.env['AWS_REGION'];
const SECRET_ARN = process.env['SECRET_ARN'] as string;
const config = { region: AWS_REGION };
const secretsManagerClient = tracer.captureAWSv3Client(
  new SecretsManagerClient(config),
);
class Lambda implements LambdaInterface {
  private async getSecretValue(): Promise<{
    apiKeyValue: string;
    authSecret: string;
  }> {
    const response = await secretsManagerClient.send(
      new GetSecretValueCommand({
        SecretId: SECRET_ARN,
      }),
    );
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secretValue: { apiKeyValue: string; authSecret: string } = JSON.parse(
      response.SecretString,
    );

    return secretValue;
  }

  // decorate the handler class method for X-Ray
  @tracer.captureLambdaHandler({ captureResponse: false })
  public async handler(
    event: APIGatewayTokenAuthorizerEvent,
  ): Promise<APIGatewayAuthorizerResult> {
    try {
      const authHeader = event.authorizationToken;
      if (!authHeader) {
        throw new Error('Missing authorization token');
      }

      const secretValue = await this.getSecretValue();
      if (authHeader !== secretValue.authSecret) {
        throw new Error('Invalid authorization token');
      }

      return {
        principalId: SECRET_ARN,
        policyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Action: 'execute-api:Invoke',
              Effect: 'Allow',
              Resource: '*',
            },
          ],
        },
        // Pass the API key from the secret value
        usageIdentifierKey: secretValue.apiKeyValue,
        context: {
          // Add any additional context if needed
        },
      };
    } catch (error) {
      console.error(error);
      tracer.addErrorAsMetadata(error);
      return {
        principalId: '',
        policyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Action: 'execute-api:Invoke',
              Effect: 'Deny',
              Resource: event.methodArn,
            },
          ],
        },
      };
    }
  }
}

const handlerClass = new Lambda();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
