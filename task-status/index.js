const ecs = require("./ecs.js"),
    dynamo = require("./dynamo.js"),
    ssm = require("./ssm.js"),
    sqs = require("./sqs.js");


const handler = function (event) {
    console.log(`Handling event for ${event.detail.taskArn}`);
    console.log(`Event version ${event.detail.version}`);
    //console.log(event)
    console.log(event.detail);

    // Constants
    const clusterArn = event.detail.clusterArn,
        taskArn = event.detail.taskArn,
        updateTime = Date.parse(event.detail.updatedAt),
        version = event.detail.version;

    let status = "",
        timestampField = "";

    // Identify event type
    switch (version) {
        case 1:
            console.log("Provisioning event");
            console.log("No custom logic");
            return;
        case 2:
            console.log("Pending event");
            status = "PENDING";
            timestampField = "TaskPendingTime";
            break;
        case 3:
            console.log("Running event");
            status = "RUNNING";
            timestampField = "TaskStartTime";
            break;
        case 4:
            console.log("Stop initiated event");
            console.log("No custom logic");
            return;
        case 5:
            console.log("Stop initiated event 2");
            status = "STOPPING";
            timestampField = "TaskStopRequestTime";
            break;
        case 6:
            console.log("Deprovisioning event");
            status = "STOPPED";
            timestampField = "TaskStopTime";
            break;
        case 7:
            console.log("Stopped event");
            console.log("No custom logic");
            return;
        default:
            console.log(event);
            console.log("Unknown event");
            console.log("No custom logic");
            return;
    }

    return new Promise((resolve) => {
        let requestId, ip, subnetId;
        ecs.getTaskTags(clusterArn, taskArn)
            .then((data) => {
                // Got tags... enough for dynamodb query
                requestId = event.detail.group;
                ip = data.ip;
                subnetId = data.subnetId;
                dynamo
                    .updateStatusAndTimestamp(
                        requestId,
                        status,
                        timestampField,
                        updateTime,
                        ip,
                        subnetId,
                        version
                    )
                    .then(() => {
                        console.log("Updated container status");
                        if (status == "STOPPED") {
                            console.log("Deregistering key");
                            ssm.deactivateKey(requestId)
                                .then(() => {
                                    console.log("Deregistered key in SSM");
                                    resolve();
                                })
                                .catch((err) => {
                                    console.log(
                                        "Couldn't deregister key in SSM"
                                    );
                                    resolve(err);
                                });
                        } else if (status == "PENDING") {
                            ssm.createActivateCommand(requestId, ip)
                                .then(() => {
                                    console.log(
                                        `Registered active command from message: ${version}`
                                    );
                                })
                                .catch((err) => {
                                    console.log("Couldn't activate command");
                                    resolve(err);
                                });
                        } else if (status == "RUNNING") {
                            // Register command
                            sqs.publishCheckDisconnect(requestId)
                                .then(() => {
                                    console.log(
                                        "Published check disconnect message"
                                    );
                                    resolve();
                                })
                                .catch((err) => {
                                    console.log(
                                        "Couldn't publish check disconnect message"
                                    );
                                    reject(err);
                                });
                        } else {
                            resolve();
                        }
                    })
                    .catch((err) => {
                        console.log("Couldn't update task status!");
                        resolve(err);
                    });
            })
            .catch((err) => {
                console.log("Couldn't get task details!");
                console.log(err);
                resolve(err);
            });
    });
};

module.exports = { handler: handler };
