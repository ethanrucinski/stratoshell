import { Construct } from "constructs";
import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { aws_sqs as sqs } from "aws-cdk-lib";

export class ApiStack extends Stack {
    public readonly containerRequestQueue: sqs.Queue;
    public readonly connectionStatusQueue: sqs.Queue;

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
    }
}
