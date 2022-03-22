const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const { ECSClient, StopTaskCommand } = require("@aws-sdk/client-ecs");

const tableName = process.env.TASK_REQUEST_TABLE_NAME;

function stopTask(taskArn) {
    const command = new StopTaskCommand({
        task: taskArn,
        cluster: process.env.CLUSTER_NAME,
    });
    const client = new ECSClient();

    return new Promise((resolve, reject) => {
        client
            .send(command)
            .then((data) => {
                console.log(`ECS: Task ${taskArn} stopped`);
                resolve();
            })
            .catch((err) => {
                console.log("Couldn't stop task");
                console.log(err);
                reject("Couldn't stop instance");
            });
    });
}

function lookupTaskStatus(requestId) {
    const command = new GetItemCommand({
        TableName: tableName,
        Key: marshall({
            RequestUUID: requestId,
        }),
        ProjectionExpression: "RequestUUID, TaskStatus, TaskArn, RequesterId",
    });

    const client = new DynamoDBClient();

    return new Promise((resolve, reject) => {
        client
            .send(command)
            .then((data) => {
                // Queried dynamo
                console.log(`Dynamo: Request ${requestId} ok`);
                if (data.Item) {
                    let unmarshalled = unmarshall(data.Item);
                    resolve(unmarshalled);
                } else {
                    reject("No matching task found");
                }
            })
            .catch((err) => {
                console.log("Couldn't load task records");
                console.log(err);
                reject("Couldn't load task records");
            });
    });
}

const handler = function (event, _, callback) {
    // Build body
    const body = JSON.parse(event.body);

    // Check parameters
    if (!body.requestId) {
        callback(null, sendResponse(200, { error: "Missing requestId" }));
        return;
    } else if (body.requestId.length != 36) {
        callback(null, sendResponse(200, { error: "Invalid requestId" }));
        return;
    }

    let username;

    try {
        username = event.requestContext.authorizer.jwt.claims.username;
    } catch (err) {
        // no username properly provided
        console.log(err);
    }

    if (!username) {
        callback(null, sendResponse(200, { error: "Invalid username." }));
        return;
    }

    lookupTaskStatus(body.requestId)
        .then((data) => {
            console.log(data);
            if (data.RequesterId != username) {
                callback(null, sendResponse(200, { error: "Unauthorized" }));
            } else if (data.TaskStatus == "RUNNING" && data.TaskArn != null) {
                stopTask(data.TaskArn)
                    .then(() => {
                        callback(
                            null,
                            sendResponse(200, {
                                requestId: data.RequestUUID,
                                status: "ok",
                            })
                        );
                    })
                    .catch((err) => {
                        callback(
                            null,
                            sendResponse(200, {
                                requestId: data.RequestUUID,
                                taskStatus: data.TaskStatus,
                                error: err,
                            })
                        );
                    });
            } else {
                callback(
                    null,
                    sendResponse(200, {
                        requestId: data.RequestUUID,
                        taskStatus: data.TaskStatus,
                        error: "No instances to stop",
                    })
                );
            }
        })
        .catch((err) => {
            callback(null, sendResponse(200, err));
        });
};

function sendResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    };
}

module.exports = { handler: handler };
