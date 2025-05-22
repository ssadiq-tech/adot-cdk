import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as k8s from 'aws-cdk-lib/aws-eks/lib/k8s';
import * as fs from 'fs';
import { Construct } from 'constructs';

export class AdotEKSStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Load the cluster (assuming it's already created in your account)
    const cluster = eks.Cluster.fromClusterAttributes(this, 'Cluster', {
      clusterName: 'adot-eks-clusters',
      clusterArn: 'arn:aws:iam::131332286832:role/eksctl-adot-eks-clusters-cluster-ServiceRole-H1pnlT7iEYi4',
      oidcProvider: 'arn:aws:iam::131332286832:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/883752FFF3EFBDB7B44543F17F0C3358',
    });

    // Load YAML files for the Kubernetes manifests
    const otelAgentConf = fs.readFileSync('manifests/otel-agent-conf.yaml', 'utf8');
    const awsOtelEksCI = fs.readFileSync('manifests/aws-otel-eks-ci.yaml', 'utf8');
    const awsOtelSA = fs.readFileSync('manifests/aws-otel-sa.yaml', 'utf8');

    // Apply the manifests to the cluster
    new k8s.KubernetesManifest(this, 'otel-agent-config', {
      cluster,
      manifest: [
        JSON.parse(otelAgentConf),  // Convert YAML to JSON
      ],
    });

    new k8s.KubernetesManifest(this, 'aws-otel-eks-ci', {
      cluster,
      manifest: [
        JSON.parse(awsOtelEksCI),  // Convert YAML to JSON
      ],
    });

    new k8s.KubernetesManifest(this, 'aws-otel-sa', {
      cluster,
      manifest: [
        JSON.parse(awsOtelSA),  // Convert YAML to JSON
      ],
    });
  }
}
