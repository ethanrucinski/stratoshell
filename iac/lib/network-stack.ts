import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";

export class NetworkStack extends Stack {
    public readonly vpc: ec2.Vpc;
    public readonly ecrApiEndpoint: ec2.InterfaceVpcEndpoint;
    public readonly ecrDkrEndpoint: ec2.InterfaceVpcEndpoint;
    public readonly s3Endpoint: ec2.GatewayVpcEndpoint;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Create main vpc
        this.vpc = new ec2.Vpc(this, "stratoshell-vpc", {
            cidr: this.region == "us-east-2" ? "10.0.0.0/16" : "10.1.0.0/16",
            enableDnsHostnames: true,
            enableDnsSupport: true,
            natGateways: 0,
            // gatewayEndpoints: {
            //     S3: {
            //         service: ec2.GatewayVpcEndpointAwsService.S3,
            //     },
            // },
        });

        // Add S3 Endpoint
        this.s3Endpoint = this.vpc.addGatewayEndpoint(
            "stratoshell-s3-endpoint",
            {
                service: ec2.GatewayVpcEndpointAwsService.S3,
            }
        );

        // Create ECR interface endpoint
        this.ecrApiEndpoint = new ec2.InterfaceVpcEndpoint(
            this,
            "stratoshell-ecr-api-endpoint",
            {
                vpc: this.vpc,
                service: ec2.InterfaceVpcEndpointAwsService.ECR,
            }
        );
        this.ecrDkrEndpoint = new ec2.InterfaceVpcEndpoint(
            this,
            "stratoshell-ecr-docker-endpoint",
            {
                vpc: this.vpc,
                service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
            }
        );
    }
}
