const {
    SSMClient,
    GetParameterCommand,
    DeleteParametersCommand,
    PutParameterCommand,
} = require("@aws-sdk/client-ssm");

exports.createActivateCommand = function (requestId, ip) {
    // Start by getting the current parameter
    let command = new GetParameterCommand({
        Name: `/activekeys/${requestId}`,
        WithDecryption: true,
    });

    const client = new SSMClient();
    let keyValue = "";
    return new Promise((resolve, reject) => {
        client
            .send(command)
            .then((data) => {
                console.log("SSM: Got public key value");
                keyValue = data.Parameter.Value;

                command = new PutParameterCommand({
                    DataType: "text",
                    Name: `/activecommands/${requestId}`,
                    Overwrite: true,
                    Type: "SecureString",
                    Value: JSON.stringify({
                        ip: ip,
                        command: `command="exit" ${keyValue}`,
                    }),
                });
                client
                    .send(command)
                    .then(() => {
                        console.log("SSM: Ok");
                        resolve();
                    })
                    .catch((err) => {
                        console.log("SSM: Could not set active command");
                        console.log(err);
                        reject(err);
                    });
            })
            .catch((err) => {
                console.log("SSM: Could not get public key");
                console.log(err);
                reject(err);
            });
    });
};

exports.deactivateKey = function (requestId) {
    // Start by getting the current parameter
    let command = new DeleteParametersCommand({
        Names: [`/activekeys/${requestId}`, `/activecommands/${requestId}`],
    });

    const client = new SSMClient();
    return new Promise((resolve, reject) => {
        client
            .send(command)
            .then(() => {
                console.log("SSM: Deleted old parameters");

                resolve();
            })
            .catch((err) => {
                console.log("Couldn't retrieve parameter");
                console.log(err);
                reject(err);
            });
    });
};
