// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as authzen from './authzen';
import { EntityJson, TypeAndId } from '@cedar-policy/cedar-wasm';
import { ICedarPIPProvider, CedarPIP } from './pip';

export abstract class CedarPIPAuthZENProxy
  implements ICedarPIPProvider, authzen.IAuthZEN
{
  abstract evaluation(
    request: authzen.AccessEvaluationRequest,
  ): Promise<authzen.AccessEvaluationResponse>;
  abstract evaluations(
    request: authzen.AccessEvaluationsRequest,
  ): Promise<authzen.AccessEvaluationsResponse>;
  abstract subjectsearch(
    request: authzen.SubjectSearchRequest,
  ): Promise<authzen.SearchResponse>;
  abstract resourcesearch(
    request: authzen.ResourceSearchRequest,
  ): Promise<authzen.SearchResponse>;
  abstract actionsearch(
    request: authzen.ActionSearchRequest,
  ): Promise<authzen.ActionSearchResponse>;
  private pip: CedarPIP;

  setPip(pip: CedarPIP): void {
    this.pip = pip;
  }

  async determineEntities(entities: authzen.Entity[]): Promise<EntityJson[]> {
    const determined: EntityJson[] = [];
    const undetermined: TypeAndId[] = [];

    entities.map((entity) => {
      if (entity.properties) {
        // create an EntityJson from incoming properties
        determined.push({
          uid: {
            type: entity.type,
            id: entity.id,
          },
          attrs: entity.properties,
          parents: [],
        } as EntityJson);
      } else {
        const { type, id } = entity;
        undetermined.push({ type, id });
      }
    });

    if (this.pip && undetermined.length > 0) {
      // fetch EntityJson from PIP
      const found = await this.pip.findEntities(undetermined);
      found.forEach((e) => {
        determined.push(e);
      });
    }

    return determined;
  }

  async extractEntities(
    request: authzen.AccessEvaluationsRequest,
  ): Promise<EntityJson[]> {
    const extracted: EntityJson[] = [];
    if (request.subject) {
      extracted.push(...(await this.determineEntities([request.subject])));
    }
    if (request.resource) {
      extracted.push(...(await this.determineEntities([request.resource])));
    }

    for (const evaluation of request.evaluations) {
      if (evaluation.subject) {
        extracted.push(...(await this.determineEntities([evaluation.subject])));
      }
      if (evaluation.resource) {
        extracted.push(
          ...(await this.determineEntities([evaluation.resource])),
        );
      }
    }

    return extracted;
  }
}
