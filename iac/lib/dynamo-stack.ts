import { Construct } from "constructs";
import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { aws_dynamodb as dynamo } from "aws-cdk-lib";
import { aws_ssm as ssm } from "aws-cdk-lib";

export class DynamoStack extends Stack {
    public readonly taskRequestTable: dynamo.Table;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // TaskRequestTable
        const replicaRegions = ["us-west-2"];
        this.taskRequestTable = new dynamo.Table(this, "task-request-table", {
            partitionKey: {
                name: "RequestUUID",
                type: dynamo.AttributeType.STRING,
            },
            billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY,
            replicationRegions: replicaRegions,
        });
        new ssm.StringParameter(this, "task-request-table-name", {
            parameterName: "/stratoshell/dynamodb/task_request_table_name",
            stringValue: this.taskRequestTable.tableName,
        });

        replicaRegions.forEach((region) => {
            const replicaRegionParamStack = new Stack(
                scope,
                "stratoshell-task-request-table-parameter",
                {
                    ...props,
                    ...{
                        env: {
                            account: props?.env?.account,
                            region: region,
                        },
                    },
                }
            );
            new ssm.StringParameter(
                replicaRegionParamStack,
                "task-request-table-name",
                {
                    parameterName:
                        "/stratoshell/dynamodb/task_request_table_name",
                    stringValue: this.taskRequestTable.tableName,
                }
            );
        });
    }
}
