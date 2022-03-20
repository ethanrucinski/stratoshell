#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DynamoStack } from "../lib/dynamo-stack";
import { ImageStack } from "../lib/image-stack";
import { CognitoStack } from "../lib/cognito-stack";
import { ApiStack } from "../lib/api-stack";

const app = new cdk.App();

const appConfig = {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
};

// Network resources
const networkStack = new NetworkStack(
    app,
    "stratoshell-network-stack",
    appConfig
);

// Dynamo resources in primary region only
if (process.env.CDK_DEFAULT_REGION == "us-east-2") {
    new DynamoStack(app, "stratoshell-dynamo-stack", appConfig);
}

// Task and images
new ImageStack(app, "stratoshell-image-stack", {
    ...appConfig,
    ...{
        ecrApiEndpoint: networkStack.ecrApiEndpoint,
        ecrDkrEndpoint: networkStack.ecrDkrEndpoint,
        s3Endpoint: networkStack.s3Endpoint,
        vpc: networkStack.vpc,
    },
});

// Cognito in primary region only
if (process.env.CDK_DEFAULT_REGION == "us-east-2") {
    new CognitoStack(app, "stratoshell-cognito-stack", appConfig);
}

// Api stack
//new ApiStack(app, "stratoshell-api-stack", appConfig);
