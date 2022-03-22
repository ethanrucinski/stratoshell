const dynamo = require("./dynamo.js"),
    sqs = require("./sqs.js"),
    ecs = require("./ecs.js");

const handler = async function (event) {
    const result = await Promise.all(
        event.Records.map((record) => {
            try {
                JSON.parse(record.body);
            } catch (err) {
                console.log(err);
                console.log(record);
                console.log(event);
                throw err;
            }
            const requestId = JSON.parse(record.body).requestId,
                messageType = record.messageAttributes.Type.stringValue,
                messageTimestamp = parseInt(record.attributes.SentTimestamp);

            console.log(`Got message ${messageType} for ${requestId}`);
            return new Promise((resolve) => {
                if (messageType == "CONNECT" || messageType == "DISCONNECT") {
                    // Need to update status based on message timestamp in dynamodb
                    dynamo
                        .updateConnectDisconnectTime(
                            requestId,
                            messageType,
                            messageTimestamp
                        )
                        .then((data) => {
                            if (messageType == "DISCONNECT" && data) {
                                sqs.publishCheckDisconnect(requestId)
                                    .then(() => {
                                        resolve();
                                    })
                                    .catch((err) => {
                                        console.log(
                                            `Couldn't publish check disconnect for ${requestId}`
                                        );
                                        console.log(record);
                                        console.log(err);
                                        resolve();
                                    });
                            } else {
                                resolve();
                            }
                        })
                        .catch((err) => {
                            console.log(
                                `Couldn't update connection status for ${requestId}`
                            );
                            console.log(record);
                            console.log(err);
                            resolve();
                        });
                } else if (messageType == "CheckDisconnect") {
                    // Need to check if it's been disconnected more than 5 minutes or stopped
                    dynamo
                        .checkConnectionStatus(requestId)
                        .then((data) => {
                            if (
                                data.ConnectionStatus == "DISCONNECTED" &&
                                Date.now() - data.ConnectionStatusUpdateTime >
                                    60 * 5 * 1000 &&
                                ["PENDING", "PROVISIONING", "RUNNING"].includes(
                                    data.TaskStatus
                                )
                            ) {
                                console.log(`Stopping task for ${requestId}`);
                                ecs.stopTask(data.TaskArn)
                                    .then(() => {
                                        console.log(
                                            `Stopped task for ${requestId}`
                                        );
                                        resolve();
                                    })
                                    .catch((err) => {
                                        console.log(
                                            `Couldn't stop task for ${requestId}`
                                        );
                                        console.log(record);
                                        console.log(err);
                                        resolve();
                                    });
                            } else {
                                resolve();
                            }
                        })
                        .catch((err) => {
                            console.log(
                                `Couldn't check connection status for ${requestId}`
                            );
                            console.log(record);
                            console.log(err);
                            resolve();
                        });
                } else {
                    console.log("Invalid message type");
                    resolve();
                }
            });
        })
    );
    return result;
};

module.exports = { handler: handler };
