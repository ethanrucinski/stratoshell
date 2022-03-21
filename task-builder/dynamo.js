const {
    DynamoDBClient,
    PutItemCommand,
    UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");
const tableName = process.env.TASK_REQUEST_TABLE_NAME;

// Create record in dynamodb with request ID and creation time
exports.publishEvent = function (
    requestId,
    requester,
    userRequestTime,
    image,
    cpu,
    ram
) {
    // Connect to DB
    const db = new DynamoDBClient();

    const command = new PutItemCommand({
        TableName: tableName,
        Item: marshall({
            RequestUUID: requestId,
            RequesterId: requester,
            UserRequestTime: userRequestTime,
            Image: image,
            CPU: cpu,
            RAM: ram,
        }),
    });
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

exports.addTaskArnAndCreationTime = function (
    requestId,
    taskArn,
    taskRequestTime
) {
    // Connect to DB
    const db = new DynamoDBClient();

    const command = new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({
            RequestUUID: requestId,
        }),
        ExpressionAttributeValues: marshall({
            ":taskArn": taskArn,
            ":taskRequestTime": taskRequestTime,
            ":connectionStatus": "DISCONNECTED",
            ":connectionStatusUpdateTime": Date.now(),
        }),
        UpdateExpression:
            "SET TaskArn = :taskArn, TaskRequestTime = :taskRequestTime, ConnectionStatus = :connectionStatus, ConnectionStatusUpdateTime = :connectionStatusUpdateTime",
    });

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

exports.createTaskFailed = function (requestId, error) {
    // Connect to DB
    const db = new DynamoDBClient();

    const command = new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({
            RequestUUID: requestId,
        }),
        ExpressionAttributeValues: marshall({
            ":error": error,
        }),
        UpdateExpression: "SET TaskCreationError = :error",
    });

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
