import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";

export class NetworkStack extends Stack {
    public readonly vpc: ec2.Vpc;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Create main vpc
        this.vpc = new ec2.Vpc(this, "stratoshell-vpc", {
            cidr: this.region == "us-east-2" ? "10.0.0.0/16" : "10.1.0.0/16",
            enableDnsHostnames: true,
            enableDnsSupport: true,
            natGateways: 0,
        });

        // Create ECR interface endpoint
        new ec2.InterfaceVpcEndpoint(this, "stratoshell-ecr-endpoint", {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        });
        new ec2.InterfaceVpcEndpoint(this, "stratoshell-ecr-api-endpoint", {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.ECR,
        });
    }
}
