import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { aws_ecs as ecs } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";
import * as fs from "fs";

export interface ImageStackProps extends StackProps {
    vpc: ec2.Vpc;
    ecrApiEndpoint: ec2.InterfaceVpcEndpoint;
    ecrDkrEndpoint: ec2.InterfaceVpcEndpoint;
    s3Endpoint: ec2.GatewayVpcEndpoint;
}

export class ImageStack extends Stack {
    public readonly cluster: ecs.Cluster;
    public readonly taskSecurityGroup: ec2.SecurityGroup;

    constructor(scope: Construct, id: string, props: ImageStackProps) {
        super(scope, id, props);

        // Create ECS cluster
        this.cluster = new ecs.Cluster(this, "stratoshell-cluster", {
            vpc: props.vpc,
            enableFargateCapacityProviders: true,
        });

        this.taskSecurityGroup = new ec2.SecurityGroup(
            this,
            "task-security-group",
            {
                vpc: props.vpc,
                allowAllOutbound: true,
            }
        );

        // Get list of dockerfiles
        const dockerpath = fs
            .readdirSync(__dirname + "/../../images")
            .filter((path) => !path.includes(".sh"));

        // Build task definitions for each dockerfile
        dockerpath.forEach((dockerpath) => {
            const taskDefinition = new ecs.FargateTaskDefinition(
                this,
                `${dockerpath}-task-definition`,
                {
                    memoryLimitMiB: 512,
                    cpu: 256,
                    family: dockerpath,
                }
            );

            const containerImage = ecs.ContainerImage.fromAsset(
                __dirname + `/../../images/${dockerpath}/`,
                {}
            );

            taskDefinition.addContainer(`${dockerpath}-container`, {
                image: containerImage,
            });

            if (taskDefinition.executionRole) {
                // Add exec role to resource permissions
                props.ecrApiEndpoint.addToPolicy(
                    new iam.PolicyStatement({
                        principals: [taskDefinition.executionRole],
                        actions: ["*"],
                        effect: iam.Effect.ALLOW,
                        resources: ["*"],
                    })
                );

                props.ecrDkrEndpoint.addToPolicy(
                    new iam.PolicyStatement({
                        principals: [taskDefinition.executionRole],
                        actions: ["*"],
                        effect: iam.Effect.ALLOW,
                        resources: ["*"],
                    })
                );

                props.s3Endpoint.addToPolicy(
                    new iam.PolicyStatement({
                        principals: [taskDefinition.executionRole],
                        actions: ["*"],
                        effect: iam.Effect.ALLOW,
                        resources: ["*"],
                    })
                );
            }
        });
    }
}
