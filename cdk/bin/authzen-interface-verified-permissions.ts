#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import 'source-map-support/register';
import * as path from 'node:path';

import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

import { AuthZENPDPStack } from '../lib/authzen-api-lambda-stack';
import { AuthZENPolicyStoreStack } from '../lib/authzen-avp-stack';

const app = new cdk.App();
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Define tags that will be applied to all resources
const tags = {
  project: 'AuthZEN Interop Sample',
};

const stackName = app.node.tryGetContext('stackName');

// entities data from AuthZEN Interop Payload Spec
// https://authzen-interop.net/docs/scenarios/todo-1.1/
// https://authzen-interop.net/docs/scenarios/api-gateway/
const BASE_PATH = path.resolve(__dirname, '..', '..', 'cedar', 'todo-app');

// cd cdk && npx cdk deploy AuthZENPolicyStoreStack

new AuthZENPolicyStoreStack(app, 'AuthZENPolicyStoreStack', {
  stackName: stackName || 'AuthZENPolicyStoreStack',
  description: 'Sample AuthZEN Interop Policy Store w/ entities data',
  tags: tags,
  basePath: BASE_PATH,
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// npx cdk deploy -c policyStoreId=$POLICY_STORE_ID -c tableName=$ENTITIES_TABLE_NAME AuthZENPDPStack
// OR optional parameters to use a custom domain name:
// npx cdk deploy -c policyStoreId=$POLICY_STORE_ID -c tableName=$ENTITIES_TABLE_NAME -c hostname=api.example.com -c certificateArn=arn:aws:acm:region:account:certificate/xxx AuthZENPDPStack

const policyStoreId = app.node.tryGetContext('policyStoreId');
const tableName = app.node.tryGetContext('tableName');
const hostname = app.node.tryGetContext('hostname');
const certificateArn = app.node.tryGetContext('certificateArn');

new AuthZENPDPStack(app, 'AuthZENPDPStack', {
  stackName: stackName || 'AuthZENPDPStack',
  description: 'Sample AuthZEN Interop Policy Decision Point (PDP)',
  tags: tags,
  policyStoreId: policyStoreId,
  tableName: tableName,
  hostname: hostname,
  certificateArn: certificateArn,
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
