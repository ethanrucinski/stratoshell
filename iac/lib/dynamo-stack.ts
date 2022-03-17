import { Construct } from "constructs";
import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { aws_dynamodb as dynamo } from "aws-cdk-lib";

export class DynamoStack extends Stack {
    public readonly taskRequestTable: dynamo.Table;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // TaskRequestTable
        this.taskRequestTable = new dynamo.Table(this, "task-request-table", {
            partitionKey: {
                name: "RequestUUID",
                type: dynamo.AttributeType.STRING,
            },
            billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY,
        });
    }
}
