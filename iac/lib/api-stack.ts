import { Construct } from "constructs";
import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { aws_sqs as sqs } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_route53 as route53 } from "aws-cdk-lib";
import { aws_route53_targets as targets } from "aws-cdk-lib";
import { aws_certificatemanager as acm } from "aws-cdk-lib";
import { aws_apigateway as apigateway } from "aws-cdk-lib";
import { aws_cognito as cognito } from "aws-cdk-lib";

export class ApiStack extends Stack {
    public readonly containerRequestQueue: sqs.Queue;
    public readonly connectionStatusQueue: sqs.Queue;
    public readonly api: apigateway.RestApi;
    public readonly keygenApi: lambda.Function;

    constructor(scope: Construct, id: string, props: StackProps) {
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

        // Api gateway
        this.api = new apigateway.RestApi(this, "api", {
            domainName: {
                domainName: domain,
                certificate: apiDomainCertificate,
                endpointType: apigateway.EndpointType.REGIONAL,
            },
            endpointConfiguration: {
                types: [apigateway.EndpointType.REGIONAL],
            },
        });
        const v1 = this.api.root.addResource("v1");
        new route53.RecordSet(this, "api-recordset", {
            recordType: route53.RecordType.A,
            target: route53.RecordTarget.fromAlias(
                new targets.ApiGateway(this.api)
            ),
            recordName: domain,
            zone: hostedZone,
        });

        // Authorizer
        const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
            this,
            "api-authorizer",
            {
                cognitoUserPools: [
                    cognito.UserPool.fromUserPoolId(
                        this,
                        "stratoshell-user-pool",
                        "stratoshell-user-pool"
                    ),
                ],
                identitySource: "method.request.header.Authorization",
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
        });
        this.containerRequestQueue.grantSendMessages(this.keygenApi);

        const keygen = v1.addResource("keygen");
        keygen.addMethod(
            "POST",
            new apigateway.LambdaIntegration(this.keygenApi),
            {
                apiKeyRequired: true,
                authorizationScopes: [
                    "https://api.stratoshell.com/stratoshell.taskApi",
                ],
                authorizationType: apigateway.AuthorizationType.COGNITO,
                authorizer: authorizer,
            }
        );
    }
}
