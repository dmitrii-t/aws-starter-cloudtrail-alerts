import 'source-map-support/register'
import * as core from '@aws-cdk/core'
import { Aws, Fn } from '@aws-cdk/core'
import * as iam from '@aws-cdk/aws-iam'
import { PolicyStatement, Role, ServicePrincipal } from '@aws-cdk/aws-iam'
import * as cloudtrail from '@aws-cdk/aws-cloudtrail'
import * as sqs from '@aws-cdk/aws-sqs'
import * as logs from '@aws-cdk/aws-logs'
import { RetentionDays } from '@aws-cdk/aws-logs'
import * as s3 from '@aws-cdk/aws-s3'
import { RemovalPolicy } from '@aws-cdk/core';

/**
 * Builds the stack
 */
class CloudTrailAlertStack extends core.Stack {

  constructor(scope: core.App, id: string, props?: core.StackProps) {
    super(scope, id, props);

    const trailDeliveryBucket = new s3.Bucket(this, 'CloudTrailDeliveryBucket');
    // GetBucketAcl
    trailDeliveryBucket.addToResourcePolicy(new iam.PolicyStatement({
      principals: [new ServicePrincipal('cloudtrail.amazonaws.com')],
      resources: [trailDeliveryBucket.bucketArn],
      actions: [
        's3:GetBucketAcl'
      ]
    }));
    // PutObject to AWSLogs/
    trailDeliveryBucket.addToResourcePolicy(new iam.PolicyStatement({
      principals: [new ServicePrincipal('cloudtrail.amazonaws.com')],
      resources: [trailDeliveryBucket.arnForObjects(Fn.join('', ['AWSLogs/', Aws.ACCOUNT_ID, '/*']))],
      conditions: {
        'StringEquals': {
          's3:x-amz-acl': 'bucket-owner-full-control'
        }
      },
      actions: [
        's3:PutObject'
      ]
    }));

    const trailDeliveryLogGroup = new logs.LogGroup(this, 'CloudWatchLogGroup', {
      retention: RetentionDays.ONE_YEAR
    });
    const trailDeliveryLogRole = new Role(this, 'CloudWatchLogRole', {
      assumedBy: new ServicePrincipal('cloudtrail.amazonaws.com')
    });
    trailDeliveryLogRole.addToPolicy(new PolicyStatement({
      resources: [trailDeliveryLogGroup.logGroupArn],
      actions: [
        'logs:PutLogEvents',
        'logs:CreateLogStream'
      ]
    }));

    //
    const trail = new cloudtrail.CfnTrail(this, 'CloudTrail', {
      s3BucketName: trailDeliveryBucket.bucketName,
      cloudWatchLogsLogGroupArn: trailDeliveryLogGroup.logGroupArn,
      cloudWatchLogsRoleArn: trailDeliveryLogRole.roleArn,
      isLogging: true
    });
    trail.node.addDependency(trailDeliveryLogGroup);
    trail.node.addDependency(trailDeliveryBucket);


    // Creates target queue as soon as the trail is created
    const queue = new sqs.Queue(this, 'TargetQueue');
    queue.node.addDependency(trail)
  }
}

// Runs
const app = new core.App();
new CloudTrailAlertStack(app, 'CloudTrailAlert');
app.synth();
