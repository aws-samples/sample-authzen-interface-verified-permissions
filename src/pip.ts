// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { EntityJson, EntityUidJson, TypeAndId } from '@cedar-policy/cedar-wasm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

export abstract class CedarPIP {
  protected makeEntityKey(identifier: EntityUidJson): string {
    const { type, id } =
      '__entity' in identifier ? identifier.__entity : identifier;

    return `${type}::"${id.replace(/"/g, '\\"')}"`;
  }

  protected async processEntityAndParents(
    entity: EntityJson | undefined,
    entities: EntityJson[],
    getEntityFn: (parent: EntityUidJson) => Promise<EntityJson | undefined>,
  ): Promise<void> {
    if (entity) {
      entities.push(entity);

      // Process all parents
      await Promise.all(
        entity.parents.map(async (parent) => {
          const parentEntity = await getEntityFn(parent);
          if (parentEntity) {
            entities.push(parentEntity);
          }
        }),
      );
    }
  }

  abstract findEntities(ids: Array<TypeAndId>): Promise<Array<EntityJson>>;
}
export interface ICedarPIPProvider {
  setPip(pip: CedarPIP): void;
}

export class CedarInMemoryPIP extends CedarPIP {
  protected entities: EntityJson[] = [];
  protected entitiesIndex: Record<string, number> = {};

  async findEntities(ids: Array<TypeAndId>): Promise<Array<EntityJson>> {
    const entities: EntityJson[] = [];

    await Promise.all(
      ids.map(async (id) => {
        const index = this.entitiesIndex[this.makeEntityKey(id)];
        const entity = index !== undefined ? this.entities[index] : undefined;

        await this.processEntityAndParents(entity, entities, async (parent) => {
          const parentIndex = this.entitiesIndex[this.makeEntityKey(parent)];
          return parentIndex !== undefined
            ? this.entities[parentIndex]
            : undefined;
        });
      }),
    );

    return entities;
  }

  setEntities(entities: EntityJson[]): void {
    this.entities = entities;
    entities.forEach((entity, index) => {
      if (!entity.uid) return;

      const { uid } = entity;
      const entityToIndex = '__entity' in uid ? uid.__entity : uid;
      this.entitiesIndex[this.makeEntityKey(entityToIndex)] = index;
    });
  }
}

export class CedarDynamoDBPIP extends CedarPIP {
  protected client: DynamoDBClient;
  protected docClient: DynamoDBDocumentClient;
  protected tableName: string;

  constructor(client: DynamoDBClient, tableName: string) {
    super();
    this.tableName = tableName;
    this.client = client;
    this.docClient = DynamoDBDocumentClient.from(this.client);
  }

  async getEntity(id: EntityUidJson): Promise<EntityJson | undefined> {
    let entity: EntityJson | undefined;
    const pk = this.makeEntityKey(id);
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        PK: pk,
      },
    });

    const response = await this.docClient.send(command);
    const entityField: string = response.Item?.entity;
    if (entityField !== undefined) {
      entity = JSON.parse(entityField);
    }
    return entity;
  }

  async findEntities(ids: Array<TypeAndId>): Promise<Array<EntityJson>> {
    const entities: EntityJson[] = [];

    // TODO: refactor to allow for BatchGetItem
    await Promise.all(
      ids.map(async (id) => {
        const entity = await this.getEntity(id);
        await this.processEntityAndParents(
          entity,
          entities,
          this.getEntity.bind(this),
        );
      }),
    );

    return entities;
  }
}
