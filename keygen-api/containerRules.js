const {
    ECSClient,
    DescribeTaskDefinitionCommand,
} = require("@aws-sdk/client-ecs");

function evaluateResources(ram, min, max) {
    return ram % 1 == 0 && ram >= min && ram <= max;
}

exports.checkResourceConfig = function (cpu, ram) {
    const config = {
        256: [1, 2],
        512: [1, 4],
        1024: [2, 8],
        2048: [4, 16],
        4096: [8, 30],
    };

    return (
        [256, 512, 1024, 248, 4096].includes(cpu) &&
        ((cpu == 256 && ram == 0.5) ||
            evaluateResources(ram, config[cpu][0], config[cpu][1]))
    );
};

exports.checkImageName = function (imageName) {
    const client = new ECSClient();
    const command = new DescribeTaskDefinitionCommand({
        taskDefinition: imageName,
    });

    return new Promise((resolve) => {
        client
            .send(command)
            .then((data) => {
                resolve(data?.taskDefinition?.family != null);
            })
            .catch((err) => {
                if (err.message != "Unable to describe task definition.")
                    console.log(err);
                resolve(false);
            });
    });
};
