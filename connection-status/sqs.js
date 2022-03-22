const {
    SQSClient,
    GetQueueUrlCommand,
    SendMessageCommand,
} = require("@aws-sdk/client-sqs");

// Publishes message to connection status queue to check if the user has connected to this task by 5 minutes from now
exports.publishCheckDisconnect = (requestId) => {
    return new Promise((resolve, reject) => {
        const client = new SQSClient();
        let command = new GetQueueUrlCommand({
            QueueName: process.env.CONNECTION_STATUS_QUEUE_NAME,
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
                            StringValue: "CheckDisconnect",
                        },
                    },
                    MessageBody: JSON.stringify({
                        requestId: requestId,
                    }),
                    DelaySeconds: 5 * 60,
                });
                client
                    .send(command)
                    .then((data) => {
                        console.log("Sent check disconnect message");
                        console.log(data);
                        resolve(requestId);
                    })
                    .catch((err) => {
                        console.log("Couldn't send check disconnect message");
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
