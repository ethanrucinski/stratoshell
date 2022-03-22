const { ECSClient, DescribeTasksCommand } = require("@aws-sdk/client-ecs");

exports.getTaskTags = function (clusterArn, taskArn) {
    const command = new DescribeTasksCommand({
        cluster: clusterArn,
        tasks: [taskArn],
        include: ["TAGS"],
    });

    const client = new ECSClient();

    return new Promise((resolve, reject) => {
        client
            .send(command)
            .then((data) => {
                console.log(data.tasks[0].attachments[0].details);
                try {
                    let tags = {};
                    data.tasks[0].tags.forEach((tag) => {
                        tags[tag.key] = tag.value;
                    });
                    console.log("ECS: Got tags");

                    // Try to get IP Address

                    try {
                        const ip = data.tasks[0].attachments[0].details.filter(
                            (item) => item.name == "privateIPv4Address"
                        )[0].value;
                        const subnetId = data.tasks[0].attachments[0].details.filter(
                            (item) => item.name == "subnetId"
                        )[0].value;
                        tags.ip = ip;
                        tags.subnetId = subnetId;
                    } catch {
                        console.log("No IP found");
                    }

                    resolve(tags);
                } catch (err) {
                    console.log("Couldn't process tags on container");
                    reject(err);
                }
            })
            .catch((err) => {
                console.log(err);
                reject(err);
            });
    });
};
