import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { aws_ecs as ecs } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import * as fs from "fs";

export class ImageStack extends Stack {
    public readonly cluster: ecs.Cluster;

    constructor(
        scope: Construct,
        id: string,
        vpc: ec2.Vpc,
        props?: StackProps
    ) {
        super(scope, id, props);

        // Create ECS cluster
        this.cluster = new ecs.Cluster(this, "stratoshell-cluster", {
            vpc: vpc,
            enableFargateCapacityProviders: true,
        });

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

            taskDefinition.addContainer(`${dockerpath}-container`, {
                image: ecs.ContainerImage.fromAsset(
                    __dirname + `/../../images/${dockerpath}/`,
                    {}
                ),
            });
        });
    }
}
