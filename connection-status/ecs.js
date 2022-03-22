const { ECSClient, StopTaskCommand } = require("@aws-sdk/client-ecs");

exports.stopTask = function (taskArn) {
    const command = new StopTaskCommand({
        task: taskArn,
        cluster: process.env.CLUSTER_NAME,
    });
    const client = new ECSClient();

    return new Promise((resolve, reject) => {
        client
            .send(command)
            .then(() => {
                console.log(`ECS: Task ${taskArn} stopped`);
                resolve();
            })
            .catch((err) => {
                console.log("Couldn't stop task");
                console.log(err);
                reject("Couldn't stop instance");
            });
    });
};
