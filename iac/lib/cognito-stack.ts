import { Construct } from "constructs";
import { Stack, StackProps, Duration, RemovalPolicy } from "aws-cdk-lib";
import { aws_cognito as cognito } from "aws-cdk-lib";
import { aws_route53 as route53 } from "aws-cdk-lib";
import { aws_certificatemanager as acm } from "aws-cdk-lib";

export class CognitoStack extends Stack {
    public readonly userPool: cognito.UserPool;
    public readonly userPoolDomain: cognito.UserPoolDomain;
    public readonly userPoolResourceServer: cognito.UserPoolResourceServer;
    public readonly userPoolClient: cognito.UserPoolClient;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Look up hosted zone
        const hostedZone = route53.HostedZone.fromLookup(
            this,
            "stratoshell-hosted-zone",
            {
                domainName: "stratoshell.com",
            }
        );

        // User pool
        this.userPool = new cognito.UserPool(this, "stratoshell-pool", {
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            signInAliases: { email: true },
            passwordPolicy: {
                minLength: 10,
                requireLowercase: true,
                requireSymbols: true,
                requireDigits: true,
                requireUppercase: true,
                tempPasswordValidity: Duration.days(1),
            },
            removalPolicy: RemovalPolicy.DESTROY,
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
            },
            signInCaseSensitive: true,
        });

        // User pool domain
        const domain = `auth.stratoshell.com`;
        const poolDomainCertificate = new acm.DnsValidatedCertificate(
            this,
            "stratoshell-pool-domain-certificate",
            {
                domainName: domain,
                hostedZone: hostedZone,
                region: this.region,
            }
        );

        this.userPoolDomain = new cognito.UserPoolDomain(
            this,
            "stratoshell-pool-domain",
            {
                customDomain: {
                    domainName: domain,
                    certificate: poolDomainCertificate,
                },
                userPool: this.userPool,
            }
        );

        // // User pool resource server
        // const userPoolResourceServerScope = new cognito.ResourceServerScope({
        //     scopeName: "stratoshell.taskApi",
        //     scopeDescription: "Stratoshell task api scope",
        // });
        // this.userPoolResourceServer = new cognito.UserPoolResourceServer(
        //     this,
        //     "stratoshell-api-server",
        //     {
        //         identifier: "https://api.stratoshell.com",
        //         userPoolResourceServerName: "Task API resource server",
        //         scopes: [userPoolResourceServerScope],
        //         userPool: this.userPool,
        //     }
        // );

        // // User pool client
        // this.userPoolClient = new cognito.UserPoolClient(
        //     this,
        //     "stratoshell-client",
        //     {
        //         userPool: this.userPool,
        //         authFlows: {
        //             userPassword: true,
        //         },
        //         generateSecret: true,
        //         oAuth: {
        //             callbackUrls: [
        //                 "http://localhost",
        //                 "http://localhost:3000/callback",
        //             ],
        //             flows: {
        //                 authorizationCodeGrant: true,
        //                 implicitCodeGrant: true,
        //             },
        //             logoutUrls: ["http://localhost:3000/logout"],
        //             scopes: [
        //                 cognito.OAuthScope.EMAIL,
        //                 cognito.OAuthScope.OPENID,
        //                 cognito.OAuthScope.PROFILE,
        //                 cognito.OAuthScope.resourceServer(
        //                     this.userPoolResourceServer,
        //                     userPoolResourceServerScope
        //                 ),
        //             ],
        //         },
        //         preventUserExistenceErrors: true,
        //     }
        // );
    }
}
