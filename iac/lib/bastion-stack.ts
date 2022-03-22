import { Construct } from "constructs";
import {
    Stack,
    StackProps,
    RemovalPolicy,
    Duration,
    PhysicalName,
} from "aws-cdk-lib";
import { aws_s3 as s3 } from "aws-cdk-lib";
import { aws_s3_deployment as s3deploy } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { aws_sqs as sqs } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";
import { aws_route53 as route53 } from "aws-cdk-lib";

export interface BastionStackProps extends StackProps {
    vpc: ec2.Vpc;
    connectionStatusQueue: sqs.Queue;
    taskSecurityGroup: ec2.SecurityGroup;
}

export class BastionStack extends Stack {
    public readonly bastion: ec2.BastionHostLinux;

    constructor(scope: Construct, id: string, props: BastionStackProps) {
        super(scope, id, props);

        // Create bastion security group
        const bastionSecurityGroup = new ec2.SecurityGroup(
            this,
            "bastion-security-group",
            {
                vpc: props.vpc,
                allowAllOutbound: false,
            }
        );
        bastionSecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(22)
        );
        bastionSecurityGroup.addEgressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(443)
        );
        bastionSecurityGroup.addEgressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(80)
        );
        bastionSecurityGroup.addEgressRule(
            ec2.Peer.securityGroupId(props.taskSecurityGroup.securityGroupId),
            ec2.Port.tcp(22)
        );

        // Upload bastion script
        const bastionScriptBucket = new s3.Bucket(
            this,
            "bastion-script-bucket",
            {
                removalPolicy: RemovalPolicy.DESTROY,
                bucketName: `stratoshell-bastion-script-bucket-${this.region}`,
            }
        );

        const bastionScriptDeployment = new s3deploy.BucketDeployment(
            this,
            "bastion-script-deployment",
            {
                sources: [s3deploy.Source.asset(__dirname + "/../../bastion")],
                destinationBucket: bastionScriptBucket,
            }
        );

        // Create bastion
        this.bastion = new ec2.BastionHostLinux(this, "bastion-host", {
            vpc: props.vpc,
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass.T4G,
                ec2.InstanceSize.NANO
            ),
            subnetSelection: { subnets: props.vpc.publicSubnets },
            securityGroup: bastionSecurityGroup,
        });

        this.bastion.instance.addUserData(
            [
                `yum -y update`,
                `yum install -y jq aws-cfn-bootstrap`,
                `useradd -m ssh-user`,
                `mkdir /home/ssh-user/.ssh/`,
                `echo "StrictHostKeyChecking no" >> /etc/ssh/ssh_config`,
                `echo "UserKnownHostsFile=/dev/null" >> /etc/ssh/ssh_config`,
                `echo "ClientAliveInterval 60" >> /etc/ssh/sshd_config`,
                `echo "ClientAliveCountMax 3" >> /etc/ssh/sshd_config`,
                `echo "AllowTcpForwarding yes" >> /etc/ssh/sshd_config`,
                `systemctl restart sshd`,
                `aws s3 cp s3://stratoshell-bastion-script-bucket-${this.region}/bastion-host-key-update-script.sh /root/updateKeys.sh`,
                `chmod +x /root/updateKeys.sh`,
                `screen -d -m watch -n5 -x /root/updateKeys.sh`,
            ].join("\n")
        );
        this.bastion.instance.node.addDependency(bastionScriptDeployment);

        // Grant access
        props.connectionStatusQueue.grantConsumeMessages(this.bastion);
        bastionScriptDeployment.deployedBucket.grantRead(this.bastion);
        this.bastion.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                resources: ["*"],
                actions: [
                    "ssm:*",
                    "ec2:AssociateAddress",
                    "ec2:DescribeAddresses",
                ],
                effect: iam.Effect.ALLOW,
            })
        );

        // Route53 Record
        const hostedZone = route53.HostedZone.fromLookup(
            this,
            "stratoshell-hosted-zone",
            {
                domainName: "stratoshell.com",
            }
        );
        new route53.ARecord(this, "bastion-a-record", {
            zone: hostedZone,
            target: route53.RecordTarget.fromIpAddresses(
                this.bastion.instancePublicIp
            ),
            recordName: "bastion.stratoshell.com",
            ttl: Duration.seconds(60),
        });
    }
}
