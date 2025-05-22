import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as fs from 'fs';

export class AdotEksCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Reference existing EKS cluster by name and role
    const cluster = eks.Cluster.fromClusterAttributes(this, 'ExistingCluster', {
      clusterName: 'adot-eks-clusters',
      kubectlRoleArn: 'arn:aws:iam::131332286832:role/eksctl-adot-eks-clusters-cluster-ServiceRole-H1pnlT7iEYi4'
    });

    // Apply aws-otel-sa.yaml
    const otelSaManifest = fs.readFileSync('./manifests/aws-otel-sa.yaml', 'utf8');
    cluster.addManifest('OtelServiceAccount', ...eks.KubernetesManifest.fromYaml(this, 'OtelSa', {
      cluster,
      manifest: [otelSaManifest],
    }).toJson());

    // Apply otel-agent-conf.yaml
    const otelConfManifest = fs.readFileSync('./manifests/otel-agent-conf.yaml', 'utf8');
    cluster.addManifest('OtelConfigMap', ...eks.KubernetesManifest.fromYaml(this, 'OtelConf', {
      cluster,
      manifest: [otelConfManifest],
    }).toJson());

    // Apply aws-otel-eks-ci.yaml (DaemonSet)
    const adotDaemonSetManifest = fs.readFileSync('./manifests/aws-otel-eks-ci.yaml', 'utf8');
    cluster.addManifest('OtelDaemonSet', ...eks.KubernetesManifest.fromYaml(this, 'OtelDaemonSet', {
      cluster,
      manifest: [adotDaemonSetManifest],
    }).toJson());
  }
}
