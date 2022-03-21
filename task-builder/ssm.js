const { SSMClient, PutParameterCommand } = require("@aws-sdk/client-ssm");

//Adds parameter for public key to SSM
exports.createParameter = function (requestId, publicKey) {
    const client = new SSMClient();

    let command = new PutParameterCommand({
        DataType: "text",
        Name: `/activekeys/${requestId}`,
        Overwrite: true,
        Type: "SecureString",
        Value: publicKey,
    });

    return new Promise((resolve, reject) => {
        client
            .send(command)
            .then((data) => {
                console.log("SSM: ok");
                resolve(data);
            })
            .catch((err) => {
                console.log(err);
                reject(err);
            });
    });
};
