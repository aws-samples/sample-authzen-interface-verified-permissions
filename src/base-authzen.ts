// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as authzen from './authzen';
import { EntityJson } from '@cedar-policy/cedar-wasm';
import { ICedarPIPProvider, CedarPIP } from './pip';

export abstract class CedarPIPAuthZENProxy implements ICedarPIPProvider {
  private pip: CedarPIP;

  setPip(pip: CedarPIP): void {
    this.pip = pip;
  }

  async determineEntities(entities: authzen.Entity[]): Promise<EntityJson[]> {
    const determined: EntityJson[] = [];

    // TODO: doesn't dedup EntityJson inside determined

    await Promise.all(
      entities.map(async (entity) => {
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
          if (this.pip) {
            // fetch EntityJson from PIP
            const found = await this.pip.findEntities([entity]);
            found.forEach((e) => {
              determined.push(e);
            });
          }
        }
      }),
    );
    return determined;
  }
}
