#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DynamoStack } from "../lib/dynamo-stack";
import { ImageStack } from "../lib/image-stack";

const app = new cdk.App();

const appConfig = {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
};

// Network resources
new NetworkStack(app, "stratoshell-network-stack", appConfig);

// Dynamo resources in primary region only
if (process.env.CDK_DEFAULT_REGION == "us-east-2") {
    new DynamoStack(app, "stratoshell-dynamo-stack", appConfig);
}

// Task and images
new ImageStack(app, "stratoshell-image-stack", appConfig);
