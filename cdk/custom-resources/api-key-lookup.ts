// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { APIGateway } from '@aws-sdk/client-api-gateway';
import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';

const apigateway = new APIGateway({});
const secretsManager = new SecretsManager({});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function handler(event: CloudFormationCustomResourceEvent) {
  try {
    if (event.RequestType === 'Create' || event.RequestType === 'Update') {
      const apiKeyId = event.ResourceProperties.ApiKeyId;
      const secretId = event.ResourceProperties.SecretId;

      // Get the API key value
      const apiKeyResponse = await apigateway.getApiKey({
        apiKey: apiKeyId,
        includeValue: true,
      });

      // Get current secret value
      const secretResponse = await secretsManager.getSecretValue({
        SecretId: secretId,
      });

      const currentSecret = JSON.parse(secretResponse.SecretString || '{}');

      // Update secret with API key value
      await secretsManager.putSecretValue({
        SecretId: secretId,
        SecretString: JSON.stringify({
          ...currentSecret,
          apiKeyValue: apiKeyResponse.value,
        }),
      });

      return {
        PhysicalResourceId: `${secretId}-${apiKeyId}`,
        // Don't return sensitive data in attributes
        Data: {
          Status: 'SUCCESS',
        },
      };
    }

    if (event.RequestType === 'Delete') {
      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }

  return undefined;
}
