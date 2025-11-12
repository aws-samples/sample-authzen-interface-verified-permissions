// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { VerifiedPermissionsClient } from '@aws-sdk/client-verifiedpermissions';
import { EntityJson } from '@cedar-policy/cedar-wasm';
import express, { Express, Request, Response } from 'express';

import {
  AccessEvaluationRequestSchema,
  AccessEvaluationsRequestSchema,
  ActionSearchRequestSchema,
  ResourceSearchRequestSchema,
  SubjectSearchRequestSchema,
} from './authzen';
import { VerifiedPermissionsAuthZENProxy } from './avp-authzen';
import { CedarPIPAuthZENProxy } from './base-authzen';
import { CedarAuthZENProxy } from './cedar-authzen';
import { CedarDynamoDBPIP, CedarInMemoryPIP } from './pip';

function isEntitiesFilePath(filePath: string): boolean {
  return (
    path.basename(filePath) === 'cedarentities.json' && fs.existsSync(filePath)
  );
}
function isDirectoryPath(path: string): boolean {
  try {
    return fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function createApp(
  POLICY_STORE_ID: string,
  ENTITIES_TABLE_NAME: string,
): Express {
  const AWS_REGION = process.env['AWS_REGION'];
  const config = { region: AWS_REGION };

  let authzenProxy: CedarPIPAuthZENProxy;

  if (isDirectoryPath(POLICY_STORE_ID)) {
    const tmpProxy = CedarAuthZENProxy.fromBasePath(POLICY_STORE_ID);
    authzenProxy = tmpProxy;
  } else {
    const client = new VerifiedPermissionsClient(config);
    const tmpProxy = new VerifiedPermissionsAuthZENProxy();
    tmpProxy.setVerifiedPermissionsClient(client);
    tmpProxy.setPolicyStoreId(POLICY_STORE_ID);
    authzenProxy = tmpProxy;
  }

  if (isEntitiesFilePath(ENTITIES_TABLE_NAME)) {
    const pip = new CedarInMemoryPIP();
    const entitiesJson = fs.readFileSync(ENTITIES_TABLE_NAME, 'utf-8');
    const entities: EntityJson[] = JSON.parse(entitiesJson);
    pip.loadEntities(entities);
    authzenProxy.pip = pip;
  } else {
    const ddbClient = new DynamoDBClient(config);
    const pip = new CedarDynamoDBPIP(ddbClient, ENTITIES_TABLE_NAME);
    authzenProxy.pip = pip;
  }

  const app = express();
  app.use(express.json());
  // https://openid.github.io/authzen/#name-request-identification
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'];
    if (requestId) res.setHeader('X-Request-ID', requestId);
    next();
  });

  // ignore https://docs.aws.amazon.com/amazonq/detector-library/typescript/cross-site-request-forgery/
  // amazonq-ignore-next-line
  app.post('/access/v1/evaluation', async (req: Request, res: Response) => {
    try {
      const validatedData = AccessEvaluationRequestSchema.parse(req.body);
      const result = await authzenProxy.evaluation(validatedData);
      // amazonq-ignore-next-line
      res.json(result);
    } catch (error) {
      console.error('Error processing evaluation:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ignore https://docs.aws.amazon.com/amazonq/detector-library/typescript/cross-site-request-forgery/
  // amazonq-ignore-next-line
  app.post('/access/v1/evaluations', async (req: Request, res: Response) => {
    try {
      const validatedData = AccessEvaluationsRequestSchema.parse(req.body);
      const result = await authzenProxy.evaluations(validatedData);
      // amazonq-ignore-next-line
      res.json(result);
    } catch (error) {
      console.error('Error processing evaluations:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ignore https://docs.aws.amazon.com/amazonq/detector-library/typescript/cross-site-request-forgery/
  // amazonq-ignore-next-line
  app.post('/access/v1/search/subject', async (req: Request, res: Response) => {
    try {
      const validatedData = SubjectSearchRequestSchema.parse(req.body);
      const result = await authzenProxy.subjectsearch(validatedData);
      // It is RECOMMENDED that the page object be the first key in the response
      res.json({
        ...(result.page && { page: result.page }),
        ...(result.context && { context: result.context }),
        results: result.results,
      });
    } catch (error) {
      console.error('Error processing subjectsearch:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ignore https://docs.aws.amazon.com/amazonq/detector-library/typescript/cross-site-request-forgery/
  // amazonq-ignore-next-line
  app.post(
    '/access/v1/search/resource',
    async (req: Request, res: Response) => {
      try {
        const validatedData = ResourceSearchRequestSchema.parse(req.body);
        const result = await authzenProxy.resourcesearch(validatedData);
        // It is RECOMMENDED that the page object be the first key in the response
        res.json({
          ...(result.page && { page: result.page }),
          ...(result.context && { context: result.context }),
          results: result.results,
        });
      } catch (error) {
        console.error('Error processing resourcesearch:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    },
  );

  // ignore https://docs.aws.amazon.com/amazonq/detector-library/typescript/cross-site-request-forgery/
  // amazonq-ignore-next-line
  app.post('/access/v1/search/action', async (req: Request, res: Response) => {
    try {
      const validatedData = ActionSearchRequestSchema.parse(req.body);
      const result = await authzenProxy.actionsearch(validatedData);
      // It is RECOMMENDED that the page object be the first key in the response
      res.json({
        ...(result.page && { page: result.page }),
        ...(result.context && { context: result.context }),
        results: result.results,
      });
    } catch (error) {
      console.error('Error processing actionsearch:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get(
    '/.well-known/authzen-configuration',
    (req: Request, res: Response) => {
      try {
        const host = req.get('host');
        const protocol = req.secure ? 'https' : 'http';
        const baseUrl = `${protocol}://${host}`;

        res.json({
          policy_decision_point: baseUrl,
          access_evaluation_endpoint: `${baseUrl}/access/v1/evaluation`,
          access_evaluations_endpoint: `${baseUrl}/access/v1/evaluations`,
          search_subject_endpoint: `${baseUrl}/access/v1/search/subject`,
          search_action_endpoint: `${baseUrl}/access/v1/search/action`,
          search_resource_endpoint: `${baseUrl}/access/v1/search/resource`,
        });
      } catch (error) {
        console.error('Error processing authzen-configuration:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    },
  );

  return app;
}

export { createApp };

// Start server if this file is run directly
if (require.main === module) {
  const POLICY_STORE_ID = process.env['POLICY_STORE_ID'] as string;
  const ENTITIES_TABLE_NAME = process.env['ENTITIES_TABLE_NAME'] as string;

  if (!POLICY_STORE_ID) {
    console.error('POLICY_STORE_ID environment variable is not set');
    process.exit(2);
  }
  if (!ENTITIES_TABLE_NAME) {
    console.error('ENTITIES_TABLE_NAME environment variable is not set');
    process.exit(3);
  }
  const PORT = process.env.PORT || 3000;
  const app = createApp(POLICY_STORE_ID, ENTITIES_TABLE_NAME);
  app.listen(PORT, () => {
    console.log(
      `AuthZEN PDP (Amazon Verified Permissions proxy) is running on port ${PORT}`,
    );
  });
}
