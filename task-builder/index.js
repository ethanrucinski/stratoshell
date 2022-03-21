const dynamo = require("./dynamo.js"),
    ecs = require("./ecs.js"),
    ssm = require("./ssm.js");


const handler = function (event) {
    console.log(event);

    return Promise.all(
        event.Records.map((msg) => {
            try {
                // Build basic parameters
                const body = JSON.parse(msg.body);
                const requestId = body.requestId,
                    publicKey = body.publicKey,
                    requesterId = body.requesterId,
                    image = body.image,
                    cpu = body.cpu,
                    ram = body.ram,
                    userRequestTime = parseInt(msg.attributes.SentTimestamp);

                // Check parameters
                if (
                    !body ||
                    !requestId ||
                    !publicKey ||
                    !requesterId ||
                    !userRequestTime
                ) {
                    console.log("Missing parameters from message");
                    console.log(msg);
                    return null;
                }

                return new Promise((resolve, reject) => {
                    // Try to do all the cascading tasks
                    ssm.createParameter(requestId, publicKey)
                        .then(() => {
                            console.log("SSM parameter created");
                            // next create dynamo record
                            dynamo
                                .publishEvent(
                                    requestId,
                                    requesterId,
                                    userRequestTime,
                                    image,
                                    cpu,
                                    ram
                                )
                                .then(() => {
                                    console.log("Dynamo record created");
                                    // next create ECS task
                                    ecs.createTask(
                                        publicKey,
                                        requestId,
                                        requesterId,
                                        image,
                                        cpu,
                                        ram
                                    )
                                        .then((data) => {
                                            console.log(
                                                "ECS task request submitted"
                                            );
                                            try {
                                                const taskArn = data.taskArn,
                                                    creationTime = Date.parse(
                                                        data.createdAt
                                                    );

                                                dynamo
                                                    .addTaskArnAndCreationTime(
                                                        requestId,
                                                        taskArn,
                                                        creationTime
                                                    )
                                                    .then(() => {
                                                        console.log(
                                                            "Updated dynamodb with task creation time"
                                                        );

                                                        resolve();
                                                    })
                                                    .catch((err) => {
                                                        console.log(
                                                            "Failed to update dynamo with creation time record"
                                                        );
                                                        console.log(err);
                                                        reject(err);
                                                    });
                                            } catch (err) {
                                                console.log(
                                                    "Failed to read task creation record"
                                                );
                                                reject(err);
                                            }
                                        })
                                        .catch((err) => {
                                            console.log(
                                                "Failed on ECS task request step"
                                            );
                                            console.log(err);
                                            dynamo
                                                .createTaskFailed(
                                                    requestId,
                                                    err
                                                )
                                                .then(() => {
                                                    console.log(
                                                        "Updated dynmao record to reflect request failed"
                                                    );
                                                    reject();
                                                })
                                                .catch((err) => {
                                                    console.log(
                                                        "Couldn't update dynamo to reflect request task failed"
                                                    );
                                                    console.log(err);
                                                    reject(err);
                                                });
                                        });
                                })
                                .catch((err) => {
                                    console.log(
                                        "Failed on dynamo record creation step"
                                    );
                                    console.log(err);
                                    reject(err);
                                });
                        })
                        .catch((err) => {
                            console.log("Failed on SSM parameter create step.");
                            reject(err);
                        });
                });
            } catch (err) {
                console.log("Couldn't read message");
                console.log(msg);
                return null;
            }
        })
    );
};

module.exports = { handler: handler };