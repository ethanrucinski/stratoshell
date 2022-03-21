const {
    ECSClient,
    RunTaskCommand,
    CapacityProviderStrategyItem,
} = require("@aws-sdk/client-ecs");

exports.createTask = function (
    publicKey,
    requestId,
    requesterId,
    image,
    cpu,
    ram
) {
    // Connect
    const client = new ECSClient();

    const subnetList = process.env.SUBNET_LIST;
    const subnets = subnetList.split(",");
    // let subnets = [
    //     process.env.ECS_SUBNETS,
    //     process.env.ECS_SUBNET_B,
    //     process.env.ECS_SUBNET_C,
    // ];
    //subnets = subnets.filter((item) => item != null);

    const command = new RunTaskCommand({
        cluster: process.env.CLUSTER_NAME,
        count: 1,
        capacityProviderStrategy: [
            {
                capacityProvider: "FARGATE_SPOT",
                weight: 1,
            },
        ],
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: "DISABLED",
                securityGroups: [process.env.ECS_TASK_SECURITY_GROUP_ID],
                subnets: subnetList.split(","),
            },
        },
        platformVersion: "1.4.0",
        overrides: {
            containerOverrides: [
                {
                    environment: [
                        {
                            name: "AUTHORIZED_KEYS",
                            value: publicKey,
                        },
                    ],
                    name: image,
                },
            ],
            cpu: `${cpu}`,
            memory: `${ram * 1024}`,
        },
        tags: [
            {
                key: "RequestUUID",
                value: requestId,
            },
            {
                key: "RequesterId",
                value: requesterId,
            },
        ],
        taskDefinition: image,
        group: requestId,
    });

    return new Promise((resolve, reject) => {
        client
            .send(command)
            .then((data) => {
                console.log(`Started task ${data.tasks[0].taskArn}`);
                console.log("ECS: ok");
                resolve(data.tasks[0]);
            })
            .catch((err) => {
                console.log("Failed to start task!");
                console.log(err);
                reject(err);
            });
    });
};
