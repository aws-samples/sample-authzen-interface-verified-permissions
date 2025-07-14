// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import {
  CedarValueJson,
  EntityJson,
  EntityUidJson,
  Schema,
  SchemaJson,
  TypeAndId,
} from '@cedar-policy/cedar-wasm';
import { DynamoDBClient, AttributeValue } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
export abstract class CedarPIP {
  private _schema: Schema;

  get schema(): Schema {
    return this._schema;
  }

  set schema(value: Schema) {
    this._schema = value;
  }

  protected makeEntityKey(identifier: EntityUidJson): string {
    const { type, id } =
      '__entity' in identifier ? identifier.__entity : identifier;

    return `${type}::"${id.replace(/"/g, '\\"')}"`;
  }

  abstract findEntities(uids: TypeAndId[]): Promise<EntityJson[]>;
}
export interface ICedarPIPProvider {
  setPip(pip: CedarPIP): void;
}

export class CedarInMemoryPIP extends CedarPIP {
  protected entitiesByType: Record<string, Record<string, EntityJson>> = {};

  static fromBasePath(basePath: string): CedarInMemoryPIP {
    const entitiesJson: string = fs.readFileSync(
      path.join(basePath, 'cedarentities.json'),
      'utf-8',
    );
    const entities: EntityJson[] = JSON.parse(entitiesJson);

    const schemaJson: string = fs.readFileSync(
      path.join(basePath, 'cedarschema.json'),
      'utf-8',
    );
    const schema: SchemaJson<string> = JSON.parse(schemaJson);

    const pip = new CedarInMemoryPIP();
    pip.setEntities(entities);
    pip.schema = schema;

    return pip;
  }

  async findEntities(uids: TypeAndId[]): Promise<EntityJson[]> {
    const entities: EntityJson[] = [];
    const parents: TypeAndId[] = [];
    uids.map((uid) => {
      if (this.entitiesByType[uid.type]) {
        const entity = this.entitiesByType[uid.type][uid.id];
        if (entity) {
          if (
            !entities.some(
              (e) => this.makeEntityKey(e.uid) === this.makeEntityKey(uid),
            )
          ) {
            entities.push(entity);
            entity.parents.map((parent) => {
              const { type, id } = (
                '__entity' in parent ? parent.__entity : parent
              ) as TypeAndId;
              if (
                !entities.some(
                  (e) =>
                    this.makeEntityKey(e.uid) ===
                    this.makeEntityKey({ type, id }),
                )
              ) {
                parents.push({ type, id });
              }
            });
          }
        }
      }
    });

    if (parents.length > 0) {
      entities.push(...(await this.findEntities(parents)));
    }

    return entities;
  }

  setEntities(entities: EntityJson[]): void {
    entities.forEach((entity) => {
      if (!entity.uid) return;

      const { type, id } = (
        '__entity' in entity.uid ? entity.uid.__entity : entity.uid
      ) as TypeAndId;
      if (!this.entitiesByType[type]) {
        this.entitiesByType[type] = {};
      }
      this.entitiesByType[type][id] = entity;
    });
  }
}

type DynamoDBItem = Record<string, AttributeValue>;
type EntityDynamoDBItem = {
  PK: string;
  SK: string;
  GSISK: string;
  attrs: Record<string, CedarValueJson>;
  parents: EntityUidJson[];
  tags?: Record<string, CedarValueJson>;
};

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

  static constructDynamoDBItem(entity: EntityJson): DynamoDBItem {
    const uid = entity.uid;
    const { type, id } = '__entity' in uid ? uid.__entity : uid;
    const key = `${type}::"${id.replace(/"/g, '\\"')}"`;

    const item: DynamoDBItem = {
      PK: { S: type },
      SK: { S: id },
      GSISK: { S: key },
      attrs: { M: formatDynamoDB(entity.attrs) },
      parents: {
        L: entity.parents.map((p) => {
          return { M: formatDynamoDB(p) };
        }),
      },
    };

    if (entity.tags) {
      item.tags = { M: formatDynamoDB(entity.tags) };
    }

    return item;
  }

  async batchGetEntities(
    uids: TypeAndId[],
  ): Promise<Record<string, EntityJson>> {
    if (uids.length === 0) return {};

    // Group keys by type to optimize BatchGet operations
    const keysByType: Record<string, Array<{ PK: string; SK: string }>> = {};

    uids.forEach((uid: TypeAndId) => {
      const { type, id } = (
        '__entity' in uid ? uid.__entity : uid
      ) as TypeAndId;
      if (!keysByType[type]) {
        keysByType[type] = [];
      }
      keysByType[type].push({ PK: type, SK: id });
    });

    // Create a map to store results
    const entityMap: Record<string, EntityJson> = {};

    // Process each type in batches (DynamoDB has a limit of 100 items per BatchGet)
    const batchSize = 100;
    const batchPromises: Promise<void>[] = [];

    Object.entries(keysByType).forEach(([type, keys]) => {
      // Process keys in batches of batchSize
      for (let i = 0; i < keys.length; i += batchSize) {
        const batchKeys = keys.slice(i, i + batchSize);

        const batchPromise = (async (): Promise<void> => {
          const command = new BatchGetCommand({
            RequestItems: {
              [this.tableName]: {
                Keys: batchKeys,
              },
            },
          });

          const response = await this.docClient.send(command);

          if (response.Responses && response.Responses[this.tableName]) {
            response.Responses[this.tableName].forEach((item) => {
              const entity = constructCedar(item as EntityDynamoDBItem);
              const key = this.makeEntityKey(entity.uid);
              entityMap[key] = entity;
            });
          }
        })();

        batchPromises.push(batchPromise);
      }
    });

    await Promise.all(batchPromises);
    return entityMap;
  }

  async findEntities(uids: TypeAndId[]): Promise<EntityJson[]> {
    const entities: EntityJson[] = [];

    // Get all requested entities in batch
    const entityMap = await this.batchGetEntities(uids);

    // Process each entity and its parents
    await Promise.all(
      uids.map(async (uid) => {
        const key = this.makeEntityKey(uid);
        const entity = entityMap[key];

        if (entity) {
          // Add the entity to results
          if (!entities.some((e) => this.makeEntityKey(e.uid) === key)) {
            entities.push(entity);
          }

          // Process parents (may require additional batch gets)
          if (entity.parents && entity.parents.length > 0) {
            // Collect all parent IDs
            const parentIds = entity.parents.map((parent) => {
              return '__entity' in parent ? parent.__entity : parent;
            });

            // Get all parents in batch
            const parentMap = await this.batchGetEntities(parentIds);

            // Add parents to results
            Object.values(parentMap).forEach((parentEntity) => {
              const parentKey = this.makeEntityKey(parentEntity.uid);
              if (
                !entities.some((e) => this.makeEntityKey(e.uid) === parentKey)
              ) {
                entities.push(parentEntity);
              }
            });
          }
        }
      }),
    );

    return entities;
  }
}

// Helper function to convert JSON to DynamoDB format
const formatDynamoDB = (
  item: Record<string, CedarValueJson> | EntityUidJson,
): DynamoDBItem => {
  return Object.entries(item).reduce((acc, [key, value]) => {
    if (value === null || value === undefined) {
      acc[key] = { NULL: true };
    } else if (typeof value === 'string') {
      acc[key] = { S: value };
    } else if (typeof value === 'number') {
      acc[key] = { N: value.toString() };
    } else if (typeof value === 'boolean') {
      acc[key] = { BOOL: value };
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        acc[key] = { L: [] };
        // } else if (value.every((item) => typeof item === 'string')) {
        //   acc[key] = { SS: value };
        // } else if (value.every((item) => typeof item === 'number')) {
        //   acc[key] = { NS: value.map((n) => n.toString()) };
      } else {
        acc[key] = {
          L: value.map((v) => {
            if (typeof v === 'string') return { S: v };
            if (typeof v === 'number') return { N: v.toString() };
            if (typeof v === 'boolean') return { BOOL: v };
            return { NULL: true };
          }),
        };
      }
    }
    return acc;
  }, {} as DynamoDBItem);
};

const constructCedar = (item: EntityDynamoDBItem): EntityJson => {
  const entity: EntityJson = {
    uid: {
      type: item.PK,
      id: item.SK,
    },
    attrs: item.attrs,
    parents: item.parents,
  };

  if (item.tags) {
    entity.tags = item.tags;
  }

  return entity;
};
