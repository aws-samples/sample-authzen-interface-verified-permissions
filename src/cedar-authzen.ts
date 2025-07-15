// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as authzen from './authzen';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import {
  AuthorizationAnswer,
  PolicySet,
  AuthorizationCall,
  TypeAndId,
  Context,
  EntityJson,
  PolicyId,
  Policy,
} from '@cedar-policy/cedar-wasm';
import { CedarPIPAuthZENProxy } from './base-authzen';
import * as fs from 'fs';
import * as path from 'path';
export class CedarAuthZENProxy extends CedarPIPAuthZENProxy {
  private _policies: PolicySet = {};

  get policies(): PolicySet {
    return this._policies;
  }

  set policies(value: PolicySet) {
    this._policies = value;
  }

  static fromBasePath(basePath: string): CedarAuthZENProxy {
    const staticPolicies: Record<PolicyId, Policy> = {};
    const files = fs.readdirSync(basePath);
    for (const file of files) {
      if (path.extname(file) === '.cedar') {
        const filePath = path.join(basePath, file);

        const content = fs.readFileSync(filePath, 'utf8');
        staticPolicies[file] = content;
      }
    }

    const authzenProxy = new CedarAuthZENProxy();
    authzenProxy.policies = { staticPolicies: staticPolicies };

    return authzenProxy;
  }

  convert(entity: authzen.Entity): TypeAndId {
    return {
      type: entity.type,
      id: entity.id,
    };
  }

  transferAnswer(
    answer: AuthorizationAnswer,
    response: authzen.AccessEvaluationResponse,
  ): void {
    if (answer.type == 'success') {
      if (answer.response.decision == 'allow') {
        response.decision = true;
        if (answer.response.diagnostics.reason) {
          const reasons: Record<string, string> = {};
          for (
            let index = 0;
            index < answer.response.diagnostics.reason.length;
            index++
          ) {
            reasons[`${index}`] = answer.response.diagnostics.reason[index];
          }
          response.context = {
            reason_admin: reasons,
          };
        }
      } else {
        //
      }
    }
  }

  async evaluation(
    request: authzen.AccessEvaluationRequest,
  ): Promise<authzen.AccessEvaluationResponse> {
    const response: authzen.AccessEvaluationResponse = {
      decision: false,
    };
    const call: AuthorizationCall = {
      principal: this.convert(request.subject),
      action: {
        type: 'Action',
        id: request.action.name,
      },
      resource: this.convert(request.resource),
      context: (request.context as Context) || {},
      policies: this.policies,
      entities: await this.determineEntities([
        request.subject,
        request.resource,
      ]),
    };
    const answer: AuthorizationAnswer = cedar.isAuthorized(call);
    this.transferAnswer(answer, response);

    return response;
  }
  async evaluations(
    request: authzen.AccessEvaluationsRequest,
  ): Promise<authzen.AccessEvaluationsResponse> {
    try {
      const response: authzen.AccessEvaluationsResponse = {
        evaluations: [],
      };
      const commandEntities: EntityJson[] = await this.extractEntities(request);

      for (const evaluation of request.evaluations) {
        const call: AuthorizationCall = {
          principal: this.convert(
            evaluation.subject || request.subject || { type: '', id: '' },
          ),
          action: {
            type: 'Action',
            id: evaluation.action?.name || request.action?.name || '',
          },
          resource: this.convert(
            evaluation.resource || request.resource || { type: '', id: '' },
          ),
          context: (request.context as Context) || {},
          policies: this.policies,
          entities: commandEntities,
        };
        const answer: AuthorizationAnswer = cedar.isAuthorized(call);

        const tmpResponse: authzen.AccessEvaluationResponse = {
          decision: false,
        };
        this.transferAnswer(answer, tmpResponse);
        response.evaluations.push(tmpResponse);

        if (answer.type == 'success') {
          if (
            request.options?.evaluation_semantics ===
              authzen.DENY_ON_FIRST_DENY &&
            answer.response.decision == 'deny'
          ) {
            break;
          } else if (
            request.options?.evaluation_semantics ===
              authzen.PERMIT_ON_FIRST_PERMIT &&
            answer.response.decision == 'allow'
          ) {
            break;
          }
        }
      }
      return response;
    } catch (error) {
      throw new Error('Failed to perform AuthZEN evaluations');
    }
  }
}
