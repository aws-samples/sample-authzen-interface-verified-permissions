// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as verifiedpermissions from 'aws-cdk-lib/aws-verifiedpermissions';
import { EntityJson } from '@cedar-policy/cedar-wasm';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CedarDynamoDBPIP } from '../../src/pip';
import { PutItemInput } from '@aws-sdk/client-dynamodb';

export interface AuthZENPolicyStoreStackProps extends cdk.StackProps {
  basePath: string;
}
export class AuthZENPolicyStoreStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: AuthZENPolicyStoreStackProps,
  ) {
    super(scope, id, props);

    const BASE_PATH = props.basePath;
    const SCHEMA_FILE = path.resolve(BASE_PATH, 'cedarschema.json');

    let cedarJson = fs.readFileSync(SCHEMA_FILE, 'utf8');
    // minify the schema to avoid any SchemaDefinition max length (e.g. 100,000 bytes)
    // https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/quotas.html
    cedarJson = JSON.stringify(JSON.parse(cedarJson), null, 0);

    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_verifiedpermissions.CfnPolicyStore.html
    const cfnPolicyStore = new verifiedpermissions.CfnPolicyStore(
      this,
      'PolicyStore',
      {
        description: 'OpenID AuthZEN Interop Payload Spec Policy Store',
        // Interop sample data does not have a namespace, but AVP schemas require one
        // so even though there is a schema in the project, do not push to policy store
        validationSettings: {
          mode: 'OFF', // "STRICT"
        },
        // schema: {
        //   cedarJson: cedarJson,
        // },
      },
    );

    const policyScope = new Construct(this, 'Policies');
    const files = fs.readdirSync(BASE_PATH);
    for (const file of files) {
      if (path.extname(file) === '.cedar') {
        const filePath = path.join(BASE_PATH, file);

        const content = fs.readFileSync(filePath, 'utf8');
        const cfnPolicy = new verifiedpermissions.CfnPolicy(policyScope, file, {
          policyStoreId: cfnPolicyStore.attrPolicyStoreId,
          definition: {
            static: {
              description: file,
              statement: content,
            },
          },
        });
      }
    }

    new cdk.CfnOutput(this, 'PolicyStoreId', {
      value: cfnPolicyStore.attrPolicyStoreId,
      description: 'The id of the Verified Permissions Policy Store',
    });

    // --

    const entitiesScope = new Construct(this, 'Entities');

    // entities data from AuthZEN Interop Payload Spec
    // https://authzen-interop.net/docs/scenarios/todo-1.1/
    // https://authzen-interop.net/docs/scenarios/api-gateway/
    const ENTITIES_FILE = path.resolve(BASE_PATH, 'cedarentities.json');
    const entities: EntityJson[] = JSON.parse(
      fs.readFileSync(ENTITIES_FILE, 'utf-8'),
    );

    // Create the DynamoDB table
    const table = new dynamodb.Table(entitiesScope, 'CedarEntitiesTable', {
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
    });
    NagSuppressions.addResourceSuppressions(
      table,
      [
        {
          id: 'AwsSolutions-DDB3',
          reason: 'Point-in-time Recovery not require for sample',
        },
      ],
      true,
    );

    // Create batch write requests for each entity
    const items = entities.map((entity) => ({
      PutRequest: {
        Item: CedarDynamoDBPIP.constructDynamoDBItem(entity),
      } as PutItemInput,
    }));

    // Split items into chunks of 25 (DynamoDB batch write limit)
    const chunks = [];
    for (let i = 0; i < items.length; i += 25) {
      chunks.push(items.slice(i, i + 25));
    }

    // Create an AwsCustomResource for each chunk
    chunks.forEach((chunk, index) => {
      const custom = new cr.AwsCustomResource(
        entitiesScope,
        `LoadCedarEntities${index}`,
        {
          onCreate: {
            service: 'DynamoDB',
            action: 'batchWriteItem',
            parameters: {
              RequestItems: {
                [table.tableName]: chunk,
              },
            },
            physicalResourceId: cr.PhysicalResourceId.of(
              `CedarEntitiesLoad${index}`,
            ),
          },
          policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
            resources: [table.tableArn],
          }),
          installLatestAwsSdk: false,
        },
      );
      NagSuppressions.addStackSuppressions(
        this,
        [
          {
            id: 'AwsSolutions-L1',
            reason: 'latest runtime version not needed for data load',
          },
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Needs access to write to CloudWatch Logs',
            appliesTo: [
              'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
            ],
          },
        ],
        false,
      );
    });

    new cdk.CfnOutput(this, 'CedarEntitiesTableName', {
      value: table.tableName,
      description: 'The name of the DynamoDB table for Cedar entities',
    });
  }
}
