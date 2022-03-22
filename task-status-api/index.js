const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const tableName = process.env.TASK_REQUEST_TABLE_NAME;

function lookupTaskStatus(requestId) {
    const command = new GetItemCommand({
        TableName: tableName,
        Key: marshall({
            RequestUUID: requestId,
        }),
        ProjectionExpression:
            "RequestUUID, TaskStatus, TaskPrivateIp, RequesterId",
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
                    reject({
                        error: "No matching request found",
                    });
                }
            })
            .catch((err) => {
                console.log("Couldn't query dynamo");
                console.log(err);
                reject(err);
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

    let username = null;
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
            } else {
                const mappedData = {
                    requestId: data.RequestUUID,
                    taskStatus: data.TaskStatus,
                    taskPrivateIp: data.TaskPrivateIp,
                };
                callback(null, sendResponse(200, mappedData));
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
