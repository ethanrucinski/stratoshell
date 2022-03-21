import { Construct } from "constructs";
import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { aws_sqs as sqs } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_route53 as route53 } from "aws-cdk-lib";
import { aws_certificatemanager as acm } from "aws-cdk-lib";
import { aws_apigatewayv2 as apigateway } from "aws-cdk-lib";
import { aws_cognito as cognito } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { aws_ssm as ssm } from "aws-cdk-lib";
import { aws_ecs as ecs } from "aws-cdk-lib";
import { aws_lambda_event_sources as eventSource } from "aws-cdk-lib";

export class ApiStack extends Stack {
    public readonly containerRequestQueue: sqs.Queue;
    public readonly connectionStatusQueue: sqs.Queue;
    public readonly keygenApi: lambda.Function;
    public readonly taskBuilder: lambda.Function;

    constructor(
        scope: Construct,
        id: string,
        props: StackProps,
        userPool: cognito.UserPool,
        vpc: ec2.Vpc,
        cluster: ecs.Cluster,
        taskSecurityGroup: ec2.SecurityGroup
    ) {
        super(scope, id, props);

        // Make queues
        const deadRequestQueue = new sqs.Queue(this, "dead-request-queue", {
            fifo: true,
        });
        this.containerRequestQueue = new sqs.Queue(
            this,
            "container-request-queue",
            {
                contentBasedDeduplication: true,
                fifo: true,
                retentionPeriod: Duration.seconds(7200),
                visibilityTimeout: Duration.seconds(120),
                deadLetterQueue: {
                    queue: deadRequestQueue,
                    maxReceiveCount: 3,
                },
            }
        );
        this.connectionStatusQueue = new sqs.Queue(
            this,
            "connection-status-queue",
            {
                retentionPeriod: Duration.seconds(7200),
                visibilityTimeout: Duration.seconds(300),
            }
        );

        // Look up hosted zone
        const hostedZone = route53.HostedZone.fromLookup(
            this,
            "stratoshell-hosted-zone",
            {
                domainName: "stratoshell.com",
            }
        );

        // API domain
        const domain = `api.stratoshell.com`;
        const apiDomainCertificate = new acm.DnsValidatedCertificate(
            this,
            "stratoshell-api-domain-certificate",
            {
                domainName: domain,
                hostedZone: hostedZone,
                region: this.region,
            }
        );

        const api = new apigateway.CfnApi(this, "api", {
            protocolType: "HTTP",
            name: "stratoshell-api",
        });
        const stage = new apigateway.CfnStage(this, "api-stage", {
            apiId: api.ref,
            autoDeploy: true,
            stageName: "prod",
        });
        const apiDomainName = new apigateway.CfnDomainName(
            this,
            "api-domain-name",
            {
                domainName: domain,
                domainNameConfigurations: [
                    {
                        certificateArn: apiDomainCertificate.certificateArn,
                        endpointType: "REGIONAL",
                    },
                ],
            }
        );
        const apiGatewayMapping = new apigateway.CfnApiMapping(
            this,
            "api-mapping",
            {
                domainName: domain,
                apiId: api.ref,
                stage: stage.ref,
            }
        );
        apiGatewayMapping.addDependsOn(apiDomainName);
        new route53.CfnRecordSet(this, "api-recordset", {
            aliasTarget: {
                dnsName: apiDomainName.attrRegionalDomainName,
                hostedZoneId: apiDomainName.attrRegionalHostedZoneId,
                evaluateTargetHealth: true,
            },
            hostedZoneId: hostedZone.hostedZoneId,
            type: route53.RecordType.A,
            name: domain,
        });

        // User pool resource server
        const userPoolResourceServerScope = new cognito.ResourceServerScope({
            scopeName: "stratoshell.taskApi",
            scopeDescription: "Stratoshell task api scope",
        });
        const userPoolResourceServer = new cognito.UserPoolResourceServer(
            this,
            "stratoshell-api-server",
            {
                identifier: "https://api.stratoshell.com",
                userPoolResourceServerName: "Task API resource server",
                scopes: [userPoolResourceServerScope],
                userPool: userPool,
            }
        );

        // User pool client
        const userPoolClient = new cognito.UserPoolClient(
            this,
            "stratoshell-client",
            {
                userPool: userPool,
                authFlows: {
                    userPassword: true,
                },
                generateSecret: true,
                oAuth: {
                    callbackUrls: [
                        "http://localhost",
                        "http://localhost:3000/callback",
                    ],
                    flows: {
                        authorizationCodeGrant: true,
                        implicitCodeGrant: true,
                    },
                    logoutUrls: ["http://localhost:3000/logout"],
                    scopes: [
                        cognito.OAuthScope.EMAIL,
                        cognito.OAuthScope.OPENID,
                        cognito.OAuthScope.PROFILE,
                        cognito.OAuthScope.resourceServer(
                            userPoolResourceServer,
                            userPoolResourceServerScope
                        ),
                    ],
                },
                preventUserExistenceErrors: true,
            }
        );
        const authorizer = new apigateway.CfnAuthorizer(
            this,
            "api-authorizer",
            {
                apiId: api.ref,
                authorizerType: "JWT",
                identitySource: ["$request.header.Authorization"],
                jwtConfiguration: {
                    audience: [userPoolClient.userPoolClientId],
                    issuer: userPool.userPoolProviderUrl,
                },
                name: "stratoshell-api-authorizer",
            }
        );

        // Keygen Api
        this.keygenApi = new lambda.Function(this, "keygen-api", {
            code: lambda.Code.fromAsset(__dirname + "/../../keygen-api", {
                bundling: {
                    image: lambda.Runtime.NODEJS_14_X.bundlingImage,
                    user: "root",
                    command: [
                        "bash",
                        "-c",
                        "npm install && cp -au . /asset-output",
                    ],
                },
            }),
            handler: "index.handler",
            runtime: lambda.Runtime.NODEJS_14_X,
            environment: {
                CONTAINER_REQUEST_QUEUE_NAME:
                    this.containerRequestQueue.queueName,
            },
            memorySize: 192,
            timeout: Duration.minutes(5),
        });
        this.containerRequestQueue.grantSendMessages(this.keygenApi);
        this.keygenApi.addToRolePolicy(
            new iam.PolicyStatement({
                resources: ["*"],
                effect: iam.Effect.ALLOW,
                actions: [
                    "ecs:DescribeTasks",
                    "ecs:ListTaskDefinitions",
                    "ecs:DescribeTaskDefinition",
                ],
            })
        );
        const keygenApiIntegration = new apigateway.CfnIntegration(
            this,
            "keygen-integration",
            {
                apiId: api.ref,
                integrationMethod: "POST",
                integrationType: "AWS_PROXY",
                integrationUri: this.keygenApi.functionArn,
                payloadFormatVersion: "2.0",
            }
        );
        new apigateway.CfnRoute(this, "keygen-route", {
            apiId: api.ref,
            routeKey: "POST /keygen",
            target: "integrations/" + keygenApiIntegration.ref,
            authorizationScopes: [
                "https://api.stratoshell.com/stratoshell.taskApi",
            ],
            authorizationType: "JWT",
            authorizerId: authorizer.ref,
        });
        new lambda.CfnPermission(this, "keygen-api-permission", {
            functionName: this.keygenApi.functionName,
            action: "lambda:InvokeFunction",
            principal: "apigateway.amazonaws.com",
            sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:*`,
        });

        // Task Builder Lambda
        const taskRequestTableName =
            ssm.StringParameter.fromStringParameterName(
                this,
                "task-request-table-name",
                "/stratoshell/dynamodb/task_request_table_name"
            );
        this.taskBuilder = new lambda.Function(this, "task-builder", {
            code: lambda.Code.fromAsset(__dirname + "/../../task-builder", {
                bundling: {
                    image: lambda.Runtime.NODEJS_14_X.bundlingImage,
                    user: "root",
                    command: [
                        "bash",
                        "-c",
                        "npm install && cp -au . /asset-output",
                    ],
                },
            }),
            handler: "index.handler",
            runtime: lambda.Runtime.NODEJS_14_X,
            environment: {
                TASK_REQUEST_TABLE_NAME: taskRequestTableName.stringValue,
                CLUSTER_NAME: cluster.clusterName,
                ECS_TASK_SECURITY_GROUP_ID: taskSecurityGroup.securityGroupId,
                SUBNET_LIST: vpc.isolatedSubnets
                    .map((subnet) => subnet.subnetId)
                    .join(","),
            },
            memorySize: 128,
            timeout: Duration.minutes(1),
        });
        this.taskBuilder.addEventSource(
            new eventSource.SqsEventSource(this.containerRequestQueue)
        );
        this.taskBuilder.addToRolePolicy(
            new iam.PolicyStatement({
                resources: ["*"],
                effect: iam.Effect.ALLOW,
                actions: [
                    "ssm:PutParameter",
                    "dynamodb:ConditionCheckItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem",
                    "ecs:RunTask",
                    "iam:PassRole",
                ],
            })
        );
    }
}
