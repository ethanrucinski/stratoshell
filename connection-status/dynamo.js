const {
    DynamoDBClient,
    UpdateItemCommand,
    GetItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { unmarshall, marshall } = require("@aws-sdk/util-dynamodb");
const tableName = process.env.TASK_REQUEST_TABLE_NAME;

exports.updateConnectDisconnectTime = function (requestId, status, timestamp) {
    // Connect to DB
    const db = new DynamoDBClient();
    const recordStatus = status == "CONNECT" ? "CONNECTED" : "DISCONNECTED";

    const command = new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({
            RequestUUID: requestId,
        }),
        ExpressionAttributeValues: marshall({
            ":status": recordStatus,
            ":timestamp": timestamp,
        }),
        UpdateExpression:
            "SET ConnectionStatus = :status, ConnectionStatusUpdateTime = :timestamp",
        ConditionExpression: `attribute_not_exists(ConnectionStatusUpdateTime) or ConnectionStatusUpdateTime < :timestamp`,
    });

    return new Promise((resolve, reject) => {
        db.send(command)
            .then(() => {
                resolve(true);
            })
            .catch((err) => {
                if (
                    err.toString().split(":")[0] ==
                    "ConditionalCheckFailedException"
                ) {
                    resolve(false);
                } else {
                    reject(err);
                }
            });
    });
};

exports.checkConnectionStatus = function (requestId) {
    const db = new DynamoDBClient();
    const command = new GetItemCommand({
        TableName: tableName,
        Key: marshall({
            RequestUUID: requestId,
        }),
        ProjectionExpression:
            "ConnectionStatus, ConnectionStatusUpdateTime, TaskStatus, TaskArn",
    });

    return new Promise((resolve, reject) => {
        db.send(command)
            .then((data) => {
                const result = unmarshall(data.Item);
                resolve(result);
            })
            .catch((err) => {
                reject(err);
            });
    });
};
