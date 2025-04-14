// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import express, { Request, Response } from 'express';
import { VerifiedPermissionsAuthZENProxy } from './avp-authzen';
import {
  AccessEvaluationRequestSchema,
  AccessEvaluationsRequestSchema,
} from './authzen';
import { VerifiedPermissionsClient } from '@aws-sdk/client-verifiedpermissions';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CedarInMemoryPIP } from './pip';
import { EntityJson } from '@cedar-policy/cedar-wasm';

const POLICY_STORE_ID = process.env['POLICY_STORE_ID'] as string;
const BASE_PATH = path.resolve(__dirname, '..', 'cedar');

const app = express();
app.use(express.json());

const authZEN = new VerifiedPermissionsAuthZENProxy();
const entitiesJson = fs.readFileSync(
  path.join(BASE_PATH, 'cedarentities.json'),
  'utf-8',
);
const entities: Array<EntityJson> = JSON.parse(entitiesJson);
const client = new VerifiedPermissionsClient();

authZEN.setVerifiedPermissionsClient(client);
authZEN.setPolicyStoreId(POLICY_STORE_ID);
const pip = new CedarInMemoryPIP();
pip.setEntities(entities);
authZEN.setPip(pip);

// ignore https://docs.aws.amazon.com/amazonq/detector-library/typescript/cross-site-request-forgery/
// amazonq-ignore-next-line
app.post('/access/v1/evaluation', async (req: Request, res: Response) => {
  try {
    const validatedData = AccessEvaluationRequestSchema.parse(req.body);
    const result = await authZEN.evaluation(validatedData);
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
    const result = await authZEN.evaluations(validatedData);
    res.json(result);
  } catch (error) {
    console.error('Error processing evaluations:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export { app, authZEN };

// Start server if this file is run directly
if (require.main === module) {
  if (!POLICY_STORE_ID) {
    console.error('POLICY_STORE_ID environment variable is not set');
    process.exit(2);
  }
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(
      `AuthZEN PDP (Amazon Verified Permissions proxy) is running on port ${PORT}`,
    );
  });
}
