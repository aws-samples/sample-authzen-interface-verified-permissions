// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

// based on https://openid.github.io/authzen/
// TODO: open issue asking for official TypeScript types or zod schema

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function removeAdditionalProperties(obj: any): void {
  if (typeof obj !== 'object' || obj === null) {
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item) => removeAdditionalProperties(item));
    return;
  }

  delete obj.additionalProperties;

  for (const key in obj) {
    removeAdditionalProperties(obj[key]);
  }
}

// allows reuse for API Gateway request validation
export const zodToOpenAPISchema = (schema: z.ZodTypeAny): object => {
  const obj = zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  });

  removeAdditionalProperties(obj);
  return obj;
};

// Define the base schemas
const EntitySchema = z.object({
  type: z.string(),
  id: z.string(),
  properties: z.record(z.unknown()).optional(),
});

const ActionSchema = z.object({
  name: z.string(),
  properties: z.record(z.unknown()).optional(),
});

// Define the AccessEvaluationRequest schema
export const AccessEvaluationRequestSchema = z.object({
  subject: EntitySchema,
  resource: EntitySchema,
  action: ActionSchema,
  context: z.record(z.unknown()).optional(),
});

// Derive the TypeScript types from the schema
export type Entity = z.infer<typeof EntitySchema>;
export type Action = z.infer<typeof ActionSchema>;
export type AccessEvaluationRequest = z.infer<
  typeof AccessEvaluationRequestSchema
>;

export const EXECUTE_ALL = 'execute_all';
export const DENY_ON_FIRST_DENY = 'deny_on_first_deny';
export const PERMIT_ON_FIRST_PERMIT = 'permit_on_first_permit';
const EvaluationSemanticsSchema = z.enum([
  EXECUTE_ALL,
  DENY_ON_FIRST_DENY,
  PERMIT_ON_FIRST_PERMIT,
]);

const EvaluationOptionsSchema = z.intersection(
  z.record(z.unknown()),
  z.object({
    evaluation_semantics: EvaluationSemanticsSchema.optional(),
  }),
);

const EvaluationItemSchema = z.object({
  subject: EntitySchema.optional(),
  resource: EntitySchema.optional(),
  action: ActionSchema.optional(),
});

// Define the AccessEvaluationsRequestSchema schema
export const AccessEvaluationsRequestSchema = z
  .object({
    subject: EntitySchema.optional(),
    resource: EntitySchema.optional(),
    action: ActionSchema.optional(),
    context: z.record(z.unknown()).optional(),
    evaluations: z.array(EvaluationItemSchema),
    options: EvaluationOptionsSchema.optional(),
  })
  .strict();

// Derive the TypeScript types from the schema
export type AccessEvaluationsRequest = z.infer<
  typeof AccessEvaluationsRequestSchema
>;

export type ReasonField = {
  [key: string]: string;
};

export type ReasonObject = {
  id: string;
  reason_admin: ReasonField;
  reason_user: ReasonField;
};
export type AccessEvaluationResponse = {
  decision: boolean;
  context?: Record<string, unknown> | ReasonObject;
};

export type AccessEvaluationsResponse = {
  evaluations: AccessEvaluationResponse[];
};

const EntityWithOptionalIdSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
});

const PageSchema = z.object({
  next_token: z.string(),
});

export const SubjectSearchRequestSchema = z.object({
  subject: EntityWithOptionalIdSchema,
  resource: EntitySchema,
  action: ActionSchema,
  context: z.record(z.unknown()).optional(),
  page: PageSchema.optional(),
});

export const ResourceSearchRequestSchema = z.object({
  subject: EntitySchema,
  resource: EntityWithOptionalIdSchema,
  action: ActionSchema,
  context: z.record(z.unknown()).optional(),
  page: PageSchema.optional(),
});

export const ActionSearchRequestSchema = z.object({
  subject: EntitySchema,
  resource: EntitySchema,
  context: z.record(z.unknown()).optional(),
  page: PageSchema.optional(),
});

export type EntityWithOptionalId = z.infer<typeof EntityWithOptionalIdSchema>;
export type SubjectSearchRequest = z.infer<typeof SubjectSearchRequestSchema>;
export type ResourceSearchRequest = z.infer<typeof ResourceSearchRequestSchema>;
export type ActionSearchRequest = z.infer<typeof ActionSearchRequestSchema>;
export type SearchResponse = {
  results: Entity[];
  page?: {
    next_token: string;
  };
};
export type ActionSearchResponse = {
  results: {
    name: string;
  }[];
  page?: {
    next_token: string;
  };
};

export interface IAuthZEN {
  evaluation(
    request: AccessEvaluationRequest,
  ): Promise<AccessEvaluationResponse>;
  evaluations(
    request: AccessEvaluationsRequest,
  ): Promise<AccessEvaluationsResponse>;
  subjectsearch(request: SubjectSearchRequest): Promise<SearchResponse>;
  resourcesearch(request: ResourceSearchRequest): Promise<SearchResponse>;
  actionsearch(request: ActionSearchRequest): Promise<ActionSearchResponse>;
}

export type AuthZENRequest =
  | AccessEvaluationRequest
  | AccessEvaluationsRequest
  | SubjectSearchRequest
  | ResourceSearchRequest
  | ActionSearchRequest;

export type AuthZENResponse =
  | AccessEvaluationResponse
  | AccessEvaluationsResponse
  | SearchResponse
  | ActionSearchResponse;
