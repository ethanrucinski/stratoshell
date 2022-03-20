import { Construct } from "constructs";
import { Stack, StackProps, Duration, RemovalPolicy } from "aws-cdk-lib";
import { aws_cognito as cognito } from "aws-cdk-lib";
import { aws_route53 as route53 } from "aws-cdk-lib";
import { aws_route53_targets as targets } from "aws-cdk-lib";
import { aws_certificatemanager as acm } from "aws-cdk-lib";

export class CognitoStack extends Stack {
    public readonly userPool: cognito.UserPool;
    public readonly userPoolDomain: cognito.UserPoolDomain;

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
            userPoolName: "stratoshell-user-pool",
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
                region: "us-east-1",
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

        // Cognito Route53 entry
        new route53.RecordSet(this, "cognito-recordset", {
            recordType: route53.RecordType.A,
            target: route53.RecordTarget.fromAlias(
                new targets.UserPoolDomainTarget(this.userPoolDomain)
            ),
            recordName: domain,
            zone: hostedZone,
        });
    }
}
