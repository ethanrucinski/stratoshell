import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { aws_ecs as ecs } from "aws-cdk-lib";
import * as fs from "fs";

export class ImageStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Get list of dockerfiles
        const dockerpath = fs
            .readdirSync("../../images")
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
                    `../../images/${dockerpath}`,
                    {}
                ),
            });
        });
    }
}
