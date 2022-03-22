const {
    DynamoDBClient,
    UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");
const tableName = process.env.TASK_REQUEST_TABLE_NAME;

exports.updateStatusAndTimestamp = function (
    requestId,
    status,
    timestampField,
    timestamp,
    ip,
    subnetId,
    version
) {
    // Connect to DB
    const db = new DynamoDBClient();

    let command;
    if (ip && subnetId) {
        command = new UpdateItemCommand({
            TableName: tableName,
            Key: marshall({
                RequestUUID: requestId,
            }),
            ExpressionAttributeValues: marshall({
                ":status": status,
                ":timestamp": timestamp,
                ":ip": ip,
                ":subnetId": subnetId,
                ":version": version,
            }),
            UpdateExpression: `SET TaskStatus = :status, ${timestampField} = :timestamp, TaskPrivateIp = :ip, TaskSubnetId = :subnetId, LatestVersion = :version`,
            ConditionExpression: `attribute_not_exists(LatestVersion) or LatestVersion < :version`,
        });
    } else {
        command = new UpdateItemCommand({
            TableName: tableName,
            Key: marshall({
                RequestUUID: requestId,
            }),
            ExpressionAttributeValues: marshall({
                ":status": status,
                ":timestamp": timestamp,
                ":version": version,
            }),
            UpdateExpression: `SET TaskStatus = :status, ${timestampField} = :timestamp, LatestVersion = :version`,
            ConditionExpression: `attribute_not_exists(LatestVersion) or LatestVersion < :version`,
        });
    }

    return new Promise((resolve, reject) => {
        db.send(command)
            .then((data) => {
                console.log("Dynamo: ok");
                resolve(data);
            })
            .catch((err) => {
                console.log(err);
                reject(err);
            });
    });
};
