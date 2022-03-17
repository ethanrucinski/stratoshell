#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DynamoStack } from "../lib/dynamo-stack";

const app = new cdk.App();

// Network resources
new NetworkStack(app, "stratoshell-network-stack", {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});

// Dynamo resources in primary region only
if (process.env.CDK_DEFAULT_REGION == "us-east-2") {
    new DynamoStack(app, "stratoshell-dynamo-stack", {
        env: {
            account: process.env.CDK_DEFAULT_ACCOUNT,
            region: process.env.CDK_DEFAULT_REGION,
        },
    });
}
