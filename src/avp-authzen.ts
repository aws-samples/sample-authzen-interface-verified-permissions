// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as authzen from './authzen';
import {
  VerifiedPermissionsClient,
  Decision,
  IsAuthorizedCommand,
  IsAuthorizedCommandOutput,
  EntityIdentifier,
  BatchIsAuthorizedCommand,
  BatchIsAuthorizedInputItem,
  BatchIsAuthorizedCommandOutput,
  BatchIsAuthorizedOutputItem,
} from '@aws-sdk/client-verifiedpermissions';
import { CedarPIPAuthZENProxy } from './base-authzen';
import { EntityJson } from '@cedar-policy/cedar-wasm';
import { Logger } from '@aws-lambda-powertools/logger';

export class VerifiedPermissionsAuthZENProxy
  extends CedarPIPAuthZENProxy
  implements authzen.IAuthZEN
{
  private client: VerifiedPermissionsClient;
  private policyStoreId: string;
  private logger = new Logger({
    serviceName: 'VerifiedPermissionsAuthZENProxy',
  });

  setLogger(logger: Logger): void {
    this.logger = logger;
  }
  setVerifiedPermissionsClient(client: VerifiedPermissionsClient): void {
    this.client = client;
  }
  setPolicyStoreId(policyStoreId: string): void {
    this.policyStoreId = policyStoreId;
  }
  private convert(entity: authzen.Entity): EntityIdentifier {
    // TODO: feature to infer namespace from policy store schema
    return {
      entityType: entity.type,
      entityId: entity.id,
    };
  }

  private createAccessEvaluationResponse(
    authResponse: IsAuthorizedCommandOutput | BatchIsAuthorizedOutputItem,
  ): authzen.AccessEvaluationResponse {
    const response: authzen.AccessEvaluationResponse = {
      decision: false,
    };

    if (authResponse.decision == Decision.ALLOW) {
      response.decision = true;
      if (authResponse.determiningPolicies) {
        const reasons: Record<string, string> = {};
        for (
          let index = 0;
          index < authResponse.determiningPolicies.length;
          index++
        ) {
          // TODO: research how reason_admin should best be used
          // nosemgrep: no-stringify-keys
          reasons[`${index}`] = authResponse.determiningPolicies[index]
            .policyId as string;
        }
        response.context = {
          reason_admin: reasons,
        };
      }
    }

    return response;
  }

  async evaluation(
    request: authzen.AccessEvaluationRequest,
  ): Promise<authzen.AccessEvaluationResponse> {
    try {
      const command: IsAuthorizedCommand = new IsAuthorizedCommand({
        policyStoreId: this.policyStoreId,
        principal: this.convert(request.subject),
        action: {
          actionId: request.action.name,
          actionType: 'Action',
        },
        resource: this.convert(request.resource),
        entities: {
          // https://aws.amazon.com/about-aws/whats-new/2025/02/amazon-verified-permissions-cedar-json-entity-format/
          cedarJson: JSON.stringify(
            await this.determineEntities([request.subject, request.resource]),
          ),
        },
      });
      if (request.context) {
        command.input.context = {
          cedarJson: JSON.stringify(request.context),
        };
      }

      this.logger.info('Verified Permissions IsAuthorizedCommand', {
        requestData: command,
      });
      const authResponse: IsAuthorizedCommandOutput =
        await this.client.send(command);
      this.logger.info('Verified Permissions IsAuthorizedCommandOutput', {
        responseData: authResponse,
      });
      const response = this.createAccessEvaluationResponse(authResponse);

      return response;
    } catch (error) {
      this.logger.error('Error processing AccessEvaluationRequest', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestData: request,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to perform AuthZen evaluation`);
    }
  }

  async evaluations(
    request: authzen.AccessEvaluationsRequest,
  ): Promise<authzen.AccessEvaluationsResponse> {
    // https://docs.aws.amazon.com/verifiedpermissions/latest/apireference/API_BatchIsAuthorized.html
    const commandEntities: EntityJson[] = [];
    try {
      const response: authzen.AccessEvaluationsResponse = {
        evaluations: [],
      };

      const requests: BatchIsAuthorizedInputItem[] = [];
      let requestContext;
      if (request.context) {
        requestContext = {
          cedarJson: JSON.stringify(request.context),
        };
      }

      if (request.subject) {
        commandEntities.push(
          ...(await this.determineEntities([request.subject])),
        );
      }
      if (request.resource) {
        commandEntities.push(
          ...(await this.determineEntities([request.resource])),
        );
      }

      for (const evaluation of request.evaluations) {
        if (evaluation.subject) {
          commandEntities.push(
            ...(await this.determineEntities([evaluation.subject])),
          );
        }
        if (evaluation.resource) {
          commandEntities.push(
            ...(await this.determineEntities([evaluation.resource])),
          );
        }
        requests.push({
          principal: this.convert(
            evaluation.subject || request.subject || { type: '', id: '' },
          ),
          action: {
            actionType: 'Action',
            actionId: evaluation.action?.name || request.action?.name || '',
          },
          resource: this.convert(
            evaluation.resource || request.resource || { type: '', id: '' },
          ),
          context: requestContext,
        });
      }

      const command: BatchIsAuthorizedCommand = new BatchIsAuthorizedCommand({
        policyStoreId: this.policyStoreId,
        entities: {
          // https://aws.amazon.com/about-aws/whats-new/2025/02/amazon-verified-permissions-cedar-json-entity-format/
          cedarJson: JSON.stringify(commandEntities),
        },
        requests: requests,
      });

      this.logger.info('Verified Permissions BatchIsAuthorizedCommand', {
        requestData: command,
      });
      const authResponse: BatchIsAuthorizedCommandOutput =
        await this.client.send(command);
      this.logger.info('Verified Permissions BatchIsAuthorizedCommandOutput', {
        responseData: authResponse,
      });

      if (authResponse.results) {
        for (const result of authResponse.results) {
          response.evaluations.push(
            this.createAccessEvaluationResponse(result),
          );

          if (
            request.options?.evaluation_semantics ===
              authzen.DENY_ON_FIRST_DENY &&
            result.decision == Decision.DENY
          ) {
            break;
          } else if (
            request.options?.evaluation_semantics ===
              authzen.PERMIT_ON_FIRST_PERMIT &&
            result.decision == Decision.ALLOW
          ) {
            break;
          }
        }
      }

      return response;
    } catch (error) {
      this.logger.error('Error processing AccessEvaluationsRequest', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestData: request,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to perform AuthZen evaluations`);
    }
  }
  async subjectsearch(
    request: authzen.SubjectSearchRequest,
  ): Promise<authzen.SearchResponse> {
    throw new Error('AuthZen subjectsearch not implemented.');
  }
  async resourcesearch(
    request: authzen.ResourceSearchRequest,
  ): Promise<authzen.SearchResponse> {
    throw new Error('AuthZen resourcesearch not implemented.');
  }
}
