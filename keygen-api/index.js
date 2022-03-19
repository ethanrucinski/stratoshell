// Imports
const { generateKeyPair } = require("crypto");
const sshpk = require("sshpk");
const { v4: uuidv4 } = require("uuid");

const {
    SQSClient,
    GetQueueUrlCommand,
    SendMessageCommand,
} = require("@aws-sdk/client-sqs");
const { checkResourceConfig, checkImageName } = require("./conatinerRules");

// Trigger process for handling public key
const savePublicKey = (publicKey, userName, image, cpu, ram) => {
    // Need to publish event to SQS to start new container
    let requestId = uuidv4();
    console.log(`Created request: ${requestId}`);
    return new Promise((resolve, reject) => {
        const client = new SQSClient();
        let command = new GetQueueUrlCommand({
            QueueName: process.env.CONTAINER_REQUEST_QUEUE_NAME,
        });
        client
            .send(command)
            .then((data) => {
                console.log("Got Queue URL");
                command = new SendMessageCommand({
                    QueueUrl: data.QueueUrl,
                    MessageAttributes: {
                        Type: {
                            DataType: "String",
                            StringValue: "EnvironmentRequest",
                        },
                    },
                    MessageBody: JSON.stringify({
                        requestId: requestId,
                        publicKey: publicKey,
                        requesterId: userName,
                        image: image,
                        cpu: cpu,
                        ram: ram,
                    }),
                    MessageDeduplicationId: requestId,
                    MessageGroupId: "EnvironmentRequest",
                });
                client
                    .send(command)
                    .then((data) => {
                        console.log("Sent message");
                        console.log(data);
                        resolve(requestId);
                    })
                    .catch((err) => {
                        console.log("Couldn't send request message");
                        console.log(err);
                        reject(err);
                    });
            })
            .catch((err) => {
                console.log("Couldn't get queue url");
                console.log(err);
                reject("Couldn't find request queue.");
            });
    });
};

const handler = (event, _, callback) => {
    console.log(event.requestContext.authorizer.jwt);

    // Main entrypoint for lambda proxy integration
    console.log("Starting key request!");
    console.log(`Received event: ${JSON.stringify(event, null, 2)}`);

    let userName;

    try {
        userName = event.requestContext.authorizer.jwt.claims.username;
    } catch (err) {
        // no username properly provided
        console.log(err);
    }

    if (!userName) {
        callback(null, sendResponse(200, { error: "Invalid username." }));
        return;
    }

    const body = JSON.parse(event.body || "{}");

    // Validate other inputs
    let image, cpu, ram;
    if (!(image = body.image)) {
        console.log("No image provided");
        callback(null, sendResponse(200, { error: "Missing image." }));
        return;
    }

    if (!(cpu = body.cpu)) {
        console.log("No cpu provided");
        callback(null, sendResponse(200, { error: "Missing cpu." }));
        return;
    }

    if (!(ram = body.ram)) {
        console.log("No RAM provided");
        callback(null, sendResponse(200, { error: "Missing ram." }));
        return;
    }

    if (!checkResourceConfig(cpu, ram)) {
        callback(
            null,
            sendResponse(200, { error: "Invalid resource configuration." })
        );
        return;
    }

    checkImageName(image)
        .then((result) => {
            if (result) {
                const keyFormat = {
                    modulusLength: 4096,
                    publicKeyEncoding: {
                        type: "pkcs1",
                        format: "pem",
                    },
                    privateKeyEncoding: {
                        type: "pkcs8",
                        format: "pem",
                    },
                };

                generateKeyPair(
                    "rsa",
                    keyFormat,
                    (err, publicKey, privateKey) => {
                        if (err) {
                            // handle Error
                            console.log(`Failed to generate keys: ${err}`);
                            callback(
                                null,
                                sendResponse(500, {
                                    error: "Could not generate keys.",
                                })
                            );
                        } else {
                            // Build keys and send back in response
                            const pub = sshpk
                                .parseKey(publicKey, "pem")
                                .toString("ssh");
                            const priv = sshpk
                                .parsePrivateKey(privateKey, "pem")
                                .toString("ssh");

                            console.log("Successfully generated key pair.");

                            // Push key to SSM
                            savePublicKey(pub, userName, image, cpu, ram)
                                .then((requestId) => {
                                    callback(
                                        null,
                                        sendResponse(200, {
                                            //public: pub,
                                            private: priv,
                                            requestId: requestId,
                                        })
                                    );
                                })
                                .catch((err) => {
                                    callback(
                                        null,
                                        sendResponse(500, { error: err })
                                    );
                                });
                        }
                    }
                );
            } else {
                callback(
                    null,
                    sendResponse(200, { error: "Invalid image configuration." })
                );
            }
        })
        .catch((err) => {
            console.log(err);
            callback(null, sendResponse(500, { error: err }));
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
