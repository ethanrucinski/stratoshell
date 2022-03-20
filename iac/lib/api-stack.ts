import { Construct } from "constructs";
import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { aws_sqs as sqs } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_route53 as route53 } from "aws-cdk-lib";
import { aws_route53_targets as targets } from "aws-cdk-lib";
import { aws_certificatemanager as acm } from "aws-cdk-lib";
//import { aws_apigateway as apigateway } from "aws-cdk-lib";
import { aws_apigatewayv2 as apigateway } from "aws-cdk-lib";
import { aws_cognito as cognito } from "aws-cdk-lib";

export class ApiStack extends Stack {
    public readonly containerRequestQueue: sqs.Queue;
    public readonly connectionStatusQueue: sqs.Queue;
    //public readonly api: apigateway.RestApi;
    public readonly keygenApi: lambda.Function;

    constructor(
        scope: Construct,
        id: string,
        props: StackProps,
        userPool: cognito.UserPool
    ) {
        super(scope, id, props);

        // Make queues
        this.containerRequestQueue = new sqs.Queue(
            this,
            "container-request-queue",
            {
                contentBasedDeduplication: true,
                fifo: true,
                retentionPeriod: Duration.seconds(7200),
                visibilityTimeout: Duration.seconds(300),
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

        // // Api gateway
        // this.api = new apigateway.RestApi(this, "api", {
        //     domainName: {
        //         domainName: domain,
        //         certificate: apiDomainCertificate,
        //         endpointType: apigateway.EndpointType.REGIONAL,
        //     },
        //     endpointConfiguration: {
        //         types: [apigateway.EndpointType.REGIONAL],
        //     },
        // });
        // const v1 = this.api.root.addResource("v1");
        // new route53.RecordSet(this, "api-recordset", {
        //     recordType: route53.RecordType.A,
        //     target: route53.RecordTarget.fromAlias(
        //         new targets.ApiGateway(this.api)
        //     ),
        //     recordName: domain,
        //     zone: hostedZone,
        // });

        // // Authorizer
        // const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
        //     this,
        //     "api-authorizer",
        //     {
        //         cognitoUserPools: [
        //             cognito.UserPool.fromUserPoolId(
        //                 this,
        //                 "stratoshell-user-pool",
        //                 "stratoshell-user-pool"
        //             ),
        //         ],
        //         identitySource:
        //             apigateway.IdentitySource.header("Authorization"),
        //     }
        // );

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
            timeout: Duration.minutes(5)
        });
        this.containerRequestQueue.grantSendMessages(this.keygenApi);
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
    }
}
