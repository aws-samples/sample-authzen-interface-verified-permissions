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
} from '@cedar-policy/cedar-wasm';
import { CedarPIPAuthZENProxy } from './base-authzen';

export class CedarAuthZENProxy
  extends CedarPIPAuthZENProxy
  implements authzen.IAuthZEN
{
  private policies: PolicySet = {};

  setPolicies(policies: PolicySet): void {
    this.policies = policies;
  }

  convert(entity: authzen.Entity): TypeAndId {
    return {
      type: entity.type,
      id: entity.id,
    };
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

    return response;
  }
  evaluations(
    request: authzen.AccessEvaluationsRequest,
  ): Promise<authzen.AccessEvaluationsResponse> {
    throw new Error('AuthZEN evaluations not implemented.');
  }
  subjectsearch(
    request: authzen.SubjectSearchRequest,
  ): Promise<authzen.SearchResponse> {
    throw new Error('AuthZEN subjectsearch not implemented.');
  }
  resourcesearch(
    request: authzen.ResourceSearchRequest,
  ): Promise<authzen.SearchResponse> {
    throw new Error('AuthZEN resourcesearch not implemented.');
  }
}
