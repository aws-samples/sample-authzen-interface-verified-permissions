// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as xray from 'aws-cdk-lib/aws-xray';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import {
  AccessEvaluationRequestSchema,
  AccessEvaluationsRequestSchema,
  zodToOpenAPISchema,
} from '../../src/authzen';
export interface AuthZENPDPStackProps extends cdk.StackProps {
  policyStoreId: string;
  tableName?: string;
  hostname?: string;
  certificateArn?: string; // Required if hostname is provided
}
export class AuthZENPDPStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthZENPDPStackProps) {
    super(scope, id, props);

    if (props.hostname && !props.certificateArn) {
      throw new Error(
        'certificateArn must be provided when hostname is specified',
      );
    }

    const observabilityScope = new Construct(this, 'Observability');

    function createLambdaIntegration(
      lambda: lambda.Function,
      api: string,
    ): apigateway.LambdaIntegration {
      return new apigateway.LambdaIntegration(lambda, {
        requestTemplates: {
          'application/json': `{
  "api": "${api}",
  "request": $input.json('$')
}`,
        },
        integrationResponses: [
          {
            // Success response when Lambda returns a non-null result
            statusCode: '200',
            responseParameters: {
              'method.response.header.Content-Type': "'application/json'",
            },
            responseTemplates: {
              'application/json': `
#set($inputRoot = $input.path('$'))
#if($inputRoot && "$inputRoot" != "null")
  $input.json('$')
#else
  #set($context.responseOverride.status = 501)
  null
#end
`,
            },
          },
          {
            // Error response when Lambda returns null
            statusCode: '501',
            selectionPattern: 'null',
            responseParameters: {
              'method.response.header.Content-Type': "'application/json'",
            },
            responseTemplates: {
              'application/json': 'null',
            },
          },
        ],
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        proxy: false,
      });
    }

    function createPOSTMethod(
      resource: apigateway.Resource,
      api: string,
      requestModels:
        | {
            [param: string]: cdk.aws_apigateway.IModel;
          }
        | undefined,
    ): apigateway.Method {
      const method = resource.addMethod(
        'POST',
        createLambdaIntegration(handler, api),
        {
          authorizer: authorizer,
          apiKeyRequired: true,
          requestValidator: requestValidator,
          requestModels: requestModels,
          methodResponses: [
            {
              statusCode: '200',
              responseParameters: {
                'method.response.header.Content-Type': true,
              },
            },
            {
              statusCode: '501',
              responseParameters: {
                'method.response.header.Content-Type': true,
              },
            },
          ],
        },
      );
      NagSuppressions.addResourceSuppressions(
        resource,
        [
          {
            id: 'AwsSolutions-COG4',
            reason:
              'Custom authorizer that gets shared secret from Authorization header',
          },
        ],
        true,
      );

      return method;
    }

    const policyStoreArn = `arn:${this.partition}:verifiedpermissions::${this.account}:policy-store/${props.policyStoreId}`;

    const POWERTOOLS_SERVICE_NAME = 'AuthZEN';
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_xray.CfnGroup.html
    new xray.CfnGroup(
      observabilityScope,
      `${POWERTOOLS_SERVICE_NAME}XRayGroup`,
      {
        groupName: POWERTOOLS_SERVICE_NAME,
        filterExpression: `annotation.Service = "${POWERTOOLS_SERVICE_NAME}"`,
      },
    );

    const dataProtectionPolicy = new logs.DataProtectionPolicy({
      name: 'SensitiveDataMaskingPolicy',
      description: 'Masks email addresses and names in logs',
      identifiers: [
        new logs.DataIdentifier(logs.DataIdentifier.EMAILADDRESS.toString()),
        new logs.DataIdentifier(logs.DataIdentifier.NAME.toString()),
      ],
    });

    // Create Lambda function
    const handler = new nodejs.NodejsFunction(this, 'PDPLambda', {
      description: 'AuthZEN PDP Lambda Function',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: 'src/lambda/index.ts',
      handler: 'lambdaHandler',
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        POWERTOOLS_SERVICE_NAME: POWERTOOLS_SERVICE_NAME,
        POLICY_STORE_ID: props.policyStoreId,
        ...(props.tableName && { ENTITIES_TABLE_NAME: props.tableName }),
      },
      bundling: {
        target: 'es2022',
        format: nodejs.OutputFormat.ESM,
        tsconfig: 'src/tsconfig.json',
        // use banner to fix esbuild bug; see https://github.com/evanw/esbuild/pull/2067
        // nosemgrep: missing-template-string-indicator
        banner: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
        nodeModules: ['@aws-sdk/client-verifiedpermissions'],
      },
    });
    createLogGroup(observabilityScope, handler, dataProtectionPolicy);
    handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['verifiedpermissions:IsAuthorized'],
        resources: [policyStoreArn],
      }),
    );
    handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:BatchGetItem'],
        resources: [
          `arn:${this.partition}:dynamodb:${this.region}:${this.account}:table/${props.tableName}`,
        ],
      }),
    );

    // Create CloudWatch log group for API Gateway access logs
    const apiLogGroup = new logs.LogGroup(observabilityScope, 'AccessLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create API Gateway with API key required
    const api = new apigateway.RestApi(this, 'RestApi', {
      restApiName: 'AuthZEN PDP API',
      description: 'AuthZEN interface for Verified Permissions',
      apiKeySourceType: apigateway.ApiKeySourceType.AUTHORIZER,
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      deployOptions: {
        accessLogDestination: new apigateway.LogGroupLogDestination(
          apiLogGroup,
        ),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        tracingEnabled: true,
      },
      defaultMethodOptions: {
        requestValidatorOptions: {
          validateRequestBody: true,
          validateRequestParameters: true,
        },
      },
    });
    // TODO: add WAFv2
    NagSuppressions.addResourceSuppressions(
      api,
      [
        {
          id: 'AwsSolutions-APIG3',
          reason: 'TODO - add WAFv2',
        },
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Needs to push to CloudWatch logs',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs',
          ],
        },
      ],
      true,
    );

    if (props.hostname && props.certificateArn) {
      api.addDomainName('CustomDomain', {
        domainName: props.hostname!.toLowerCase(),
        certificate: acm.Certificate.fromCertificateArn(
          this,
          'Certificate',
          props.certificateArn!,
        ),
        endpointType: apigateway.EndpointType.REGIONAL,
        securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
      });
    }

    // Create API key and usage plan
    const apiKey = api.addApiKey('ApiKey', {
      description: 'AuthZEN PDP API Key',
    });
    const usagePlan = api.addUsagePlan('UsagePlan', {
      name: 'Standard',
      description: 'AuthZEN PDP usage plan',
      apiStages: [
        {
          api,
          stage: api.deploymentStage,
        },
      ],
      throttle: {
        rateLimit: 20,
        burstLimit: 5,
      },
    });
    usagePlan.addApiKey(apiKey);

    // NOTE: In this sample, access to the API uses a shared secret for simplicity
    // Review your threat model and adopt more robust mechanisms such as OAuth 2.0 bearer tokens,
    // client certificate authentication, or AWS Identity and Access Management (IAM) temporary credentials.
    const apiSecret = new secretsmanager.Secret(this, 'ApiCredentials', {
      description: 'AuthZEN PDP API Credentials',
      generateSecretString: {
        secretStringTemplate: '{}',
        generateStringKey: 'authSecret',
        includeSpace: false,
        passwordLength: 40,
        requireEachIncludedType: true,
        excludePunctuation: true,
      },
    });
    NagSuppressions.addResourceSuppressions(
      apiSecret,
      [
        {
          id: 'AwsSolutions-SMG4',
          reason: 'Sample does not use automatic rotation',
        },
      ],
      true,
    );

    // Create the custom resource provider to update the secret with the API key value
    const apiKeyProviderFunction = new nodejs.NodejsFunction(
      this,
      'ApiKeyValueProviderLambda',
      {
        description: 'API Key Value Capture Function',
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        handler: 'handler',
        entry: 'custom-resources/api-key-lookup.ts',
        initialPolicy: [
          new iam.PolicyStatement({
            actions: ['apigateway:GET'],
            resources: [apiKey.keyArn],
          }),
          new iam.PolicyStatement({
            actions: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:PutSecretValue',
            ],
            resources: [apiSecret.secretArn],
          }),
        ],
      },
    );
    createLogGroup(observabilityScope, apiKeyProviderFunction);
    const apiKeyProvider = new cdk.custom_resources.Provider(
      this,
      'ApiKeyValueProvider',
      {
        onEventHandler: apiKeyProviderFunction,
      },
    );
    NagSuppressions.addResourceSuppressions(
      apiKeyProvider,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'Need to test before changing runtime version',
        },
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Needs access to write to CloudWatch Logs',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          ],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Needs access to lambda:InvokeFunction *',
          appliesTo: [
            'Action::lambda:InvokeFunction',
            `Resource::<ApiKeyValueProviderLambda5F07729C.Arn>:*`,
          ],
        },
      ],
      true,
    );

    // Create the custom resource
    new cdk.CustomResource(this, 'ApiKeyValueCapture', {
      serviceToken: apiKeyProvider.serviceToken,
      properties: {
        ApiKeyId: apiKey.keyId,
        SecretId: apiSecret.secretArn,
      },
    });

    // Output the secret ARN for reference
    new cdk.CfnOutput(this, 'ApiCredentialsSecretArn', {
      value: apiSecret.secretArn,
      description: 'The ARN of the secret containing API credentials',
    });

    // Create Lambda authorizer
    const authorizerFunction = new nodejs.NodejsFunction(
      this,
      'AuthorizerLambda',
      {
        description: 'AuthZEN PDP Lambda Authorizer Function',
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        entry: 'src/lambda/authorizer.ts',
        handler: 'lambdaHandler',
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          POWERTOOLS_SERVICE_NAME: POWERTOOLS_SERVICE_NAME,
          SECRET_ARN: apiSecret.secretArn,
        },
        bundling: {
          target: 'es2022',
          format: nodejs.OutputFormat.ESM,
          tsconfig: 'src/tsconfig.json',
          // use banner to fix esbuild bug; see https://github.com/evanw/esbuild/pull/2067
          // nosemgrep: missing-template-string-indicator
          banner: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
        },
      },
    );
    createLogGroup(observabilityScope, authorizerFunction);
    apiSecret.grantRead(authorizerFunction);

    // Create authorizer
    const authorizer = new apigateway.TokenAuthorizer(this, 'ApiAuthorizer', {
      handler: authorizerFunction,
      identitySource: apigateway.IdentitySource.header('Authorization'),
      // resultsCacheTtl: cdk.Duration.seconds(0),
    });

    const evaluationRequestModel = new apigateway.Model(
      this,
      'EvaluationRequestModel',
      {
        restApi: api,
        contentType: 'application/json',
        description: 'Validation model for AuthZEN evaluation requests',
        modelName: 'EvaluationRequest',
        schema: zodToOpenAPISchema(AccessEvaluationRequestSchema),
      },
    );
    const evaluationsRequestModel = new apigateway.Model(
      this,
      'EvaluationRequestsModel',
      {
        restApi: api,
        contentType: 'application/json',
        description: 'Validation model for AuthZEN evaluations requests',
        modelName: 'EvaluationsRequest',
        schema: zodToOpenAPISchema(AccessEvaluationsRequestSchema),
      },
    );

    // Create a request validator
    const requestValidator = api.addRequestValidator('RequestValidator', {
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    const v1 = api.root.addResource('access').addResource('v1');

    // https://openid.github.io/authzen/#name-https-access-evaluation-req
    const evaluationResource = v1.addResource('evaluation');
    createPOSTMethod(evaluationResource, 'evaluation', {
      'application/json': evaluationRequestModel,
    });

    // https://openid.github.io/authzen/#name-https-access-evaluations-re
    const evaluationsResource = v1.addResource('evaluations');
    createPOSTMethod(evaluationsResource, 'evaluations', {
      'application/json': evaluationsRequestModel,
    });

    // https://openid.github.io/authzen/#name-https-subject-search-reques
    const subjectsearchResource = v1.addResource('subjectsearch');
    createPOSTMethod(subjectsearchResource, 'subjectsearch', undefined);

    // https://openid.github.io/authzen/#name-https-resource-search-reque
    const resourcesearchResource = v1.addResource('resourcesearch');
    createPOSTMethod(resourcesearchResource, 'resourcesearch', undefined);

    handler.addPermission('APIGatewayInvoke', {
      principal: new cdk.aws_iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: api.arnForExecuteApi('POST', '/*'),
    });
  }
}

const createLogGroup = (
  scope: Construct,
  lambda: lambda.Function,
  dataProtectionPolicy?: logs.DataProtectionPolicy,
): void => {
  const logGroup = new logs.LogGroup(scope, `${lambda.node.id}LogGroup`, {
    logGroupName: `/aws/lambda/${lambda.functionName}`,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    retention: logs.RetentionDays.ONE_MONTH,
    dataProtectionPolicy: dataProtectionPolicy,
  });

  addLambdaSuppressions(lambda);
};

const addLambdaSuppressions = (construct: Construct): void => {
  NagSuppressions.addResourceSuppressions(
    construct,
    [
      {
        id: 'AwsSolutions-L1',
        reason: 'Need to test before changing runtime version',
      },
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Needs access to write to CloudWatch Logs',
        appliesTo: [
          'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        ],
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Needs access to XRay Put*',
        appliesTo: [
          'xray:PutTelemetryRecords',
          'xray:PutTraceSegments',
          'Resource::*',
        ],
      },
    ],
    true,
  );
};
