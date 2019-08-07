import 'source-map-support/register'
import * as core from '@aws-cdk/core'
import * as iam from '@aws-cdk/aws-iam'
import { PolicyStatement, Role, ServicePrincipal } from '@aws-cdk/aws-iam'
import * as cloudtrail from '@aws-cdk/aws-cloudtrail'
import * as logs from '@aws-cdk/aws-logs'
import { FilterPattern, MetricFilter, RetentionDays } from '@aws-cdk/aws-logs'
import * as s3 from '@aws-cdk/aws-s3'
import { Alarm, Metric } from '@aws-cdk/aws-cloudwatch'

/**
 * Builds the stack
 */
class CloudTrailAlertStack extends core.Stack {

  constructor(scope: core.App, id: string, props?: core.StackProps) {
    super(scope, id, props);

    const trailBucket = new s3.Bucket(this, 'CloudTrail');
    // GetBucketAcl
    trailBucket.addToResourcePolicy(new iam.PolicyStatement({
      principals: [new ServicePrincipal('cloudtrail.amazonaws.com')],
      resources: [trailBucket.bucketArn],
      actions: [
        's3:GetBucketAcl'
      ]
    }));
    // PutObject to CloudTrail
    trailBucket.addToResourcePolicy(new iam.PolicyStatement({
      principals: [new ServicePrincipal('cloudtrail.amazonaws.com')],
      resources: [trailBucket.arnForObjects('CloudTrail/logs/*')],
      conditions: {
        'StringEquals': {
          's3:x-amz-acl': 'bucket-owner-full-control'
        }
      },
      actions: [
        's3:PutObject'
      ]
    }));

    const trailLogGroup = new logs.LogGroup(this, 'CloudTrailLogGroup', {
      retention: RetentionDays.ONE_YEAR
    });
    const trailLogRole = new Role(this, 'CloudTrailLogRole', {
      assumedBy: new ServicePrincipal('cloudtrail.amazonaws.com')
    });
    trailLogRole.addToPolicy(new PolicyStatement({
      resources: [trailLogGroup.logGroupArn],
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ]
    }));
    trailLogRole.node.addDependency(trailLogGroup);

    //
    const trail = new cloudtrail.CfnTrail(this, 'Trail', {
      s3BucketName: trailBucket.bucketName,
      s3KeyPrefix: 'CloudTrail/logs',

      cloudWatchLogsLogGroupArn: trailLogGroup.logGroupArn,
      cloudWatchLogsRoleArn: trailLogRole.roleArn,

      isLogging: true
    });
    trail.node.addDependency(trailLogGroup);
    trail.node.addDependency(trailLogRole);
    trail.node.addDependency(trailBucket);

    //
    const resourceDeletionMetric = new Metric({
      namespace: this.stackName,
      metricName: 'ResourceDeletionMetric',
    });

    //
    const resourceDeletionEventFilter = new MetricFilter(this, 'resourceDeletionEventFilter', {
      filterPattern: FilterPattern.stringValue('$.eventName', '=', 'Delete*'),

      metricNamespace: resourceDeletionMetric.namespace,
      metricName: resourceDeletionMetric.metricName,
      logGroup: trailLogGroup,
    });
    resourceDeletionEventFilter.node.addDependency(trailLogGroup);

    //
    const resourceDeletionAlarm = new Alarm(this, 'ResourceDeletionAlarm', {
      metric: resourceDeletionMetric,
      threshold: 1,
      evaluationPeriods: 1,
    });
  }
}

// Runs
const app = new core.App();
new CloudTrailAlertStack(app, 'CloudTrailAlert');
app.synth();
