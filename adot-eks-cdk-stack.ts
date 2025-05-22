import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class AdotEksCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Cluster details from your input
    const clusterName = 'adot-eks-clusters';
    const oidcProviderArn = 'arn:aws:iam::131332286832:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/883752FFF3EFBDB7B44543F17F0C3358';
    const kubectlRoleArn = 'arn:aws:iam::131332286832:role/eksctl-adot-eks-clusters-cluster-ServiceRole-H1pnlT7iEYi4';

    // Import the existing EKS cluster
    const cluster = eks.Cluster.fromClusterAttributes(this, 'ExistingEksCluster', {
      clusterName,
      kubectlRoleArn,
      kubectlEnvironment: {
        // Add any environment variables needed for kubectl
      },
      openIdConnectProvider: iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
        this,
        'OIDCProvider',
        oidcProviderArn
      ),
    });

    // Create the namespace
    const namespace = new eks.KubernetesManifest(this, 'AdotNamespace', {
      cluster,
      manifest: [{
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: 'aws-otel-eks',
        },
      }],
    });

    // Create the ServiceAccount with IAM role
    const adotServiceAccount = cluster.addServiceAccount('AdotServiceAccount', {
      name: 'aws-otel-sa',
      namespace: 'aws-otel-eks',
    });

    // Add required permissions for ADOT Collector
    adotServiceAccount.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: [
        'logs:PutLogEvents',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:DescribeLogStreams',
        'logs:DescribeLogGroups',
        'cloudwatch:PutMetricData',
        'ec2:DescribeVolumes',
        'ec2:DescribeTags',
        'ssm:GetParameter',
      ],
      resources: ['*'],
    }));

    // Create the ConfigMap
    const configMap = new eks.KubernetesManifest(this, 'AdotConfigMap', {
      cluster,
      manifest: [{
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'otel-agent-conf',
          namespace: 'aws-otel-eks',
          labels: {
            app: 'opentelemetry',
            component: 'otel-agent-conf',
          },
        },
        data: {
          'otel-agent-config': `extensions:
  health_check:

receivers:
  awscontainerinsightreceiver:

processors:
  batch/metrics:
    timeout: 60s

exporters:
  awsemf:
    namespace: ContainerInsights
    log_group_name: '/aws/containerinsights/${clusterName}/performance'
    log_stream_name: '{NodeName}'
    resource_to_telemetry_conversion:
      enabled: true
    dimension_rollup_option: NoDimensionRollup
    parse_json_encoded_attr_values: [Sources, kubernetes]
    metric_declarations:
      # node metrics
      - dimensions: [[NodeName, InstanceId, ClusterName]]
        metric_name_selectors:
          - node_cpu_utilization
          - node_memory_utilization
          - node_network_total_bytes
          - node_cpu_reserved_capacity
          - node_memory_reserved_capacity
          - node_number_of_running_pods
          - node_number_of_running_containers
      - dimensions: [[ClusterName]]
        metric_name_selectors:
          - node_cpu_utilization
          - node_memory_utilization
          - node_network_total_bytes
          - node_cpu_reserved_capacity
          - node_memory_reserved_capacity
          - node_number_of_running_pods
          - node_number_of_running_containers
          - node_cpu_usage_total
          - node_cpu_limit
          - node_memory_working_set
          - node_memory_limit

      # pod metrics
      - dimensions: [[PodName, Namespace, ClusterName], [Service, Namespace, ClusterName], [Namespace, ClusterName], [ClusterName]]
        metric_name_selectors:
          - pod_cpu_utilization
          - pod_memory_utilization
          - pod_network_rx_bytes
          - pod_network_tx_bytes
          - pod_cpu_utilization_over_pod_limit
          - pod_memory_utilization_over_pod_limit
      - dimensions: [[PodName, Namespace, ClusterName], [ClusterName]]
        metric_name_selectors:
          - pod_cpu_reserved_capacity
          - pod_memory_reserved_capacity
      - dimensions: [[PodName, Namespace, ClusterName]]
        metric_name_selectors:
          - pod_number_of_container_restarts

      # cluster metrics
      - dimensions: [[ClusterName]]
        metric_name_selectors:
          - cluster_node_count
          - cluster_failed_node_count

      # service metrics
      - dimensions: [[Service, Namespace, ClusterName], [ClusterName]]
        metric_name_selectors:
          - service_number_of_running_pods

      # node fs metrics
      - dimensions: [[NodeName, InstanceId, ClusterName], [ClusterName]]
        metric_name_selectors:
          - node_filesystem_utilization

      # namespace metrics
      - dimensions: [[Namespace, ClusterName], [ClusterName]]
        metric_name_selectors:
          - namespace_number_of_running_pods

service:
  pipelines:
    metrics:
      receivers: [awscontainerinsightreceiver]
      processors: [batch/metrics]
      exporters: [awsemf]

  extensions: [health_check]`
        },
      }],
    });

    // Create the DaemonSet
    const daemonSet = new eks.KubernetesManifest(this, 'AdotDaemonSet', {
      cluster,
      manifest: [{
        apiVersion: 'apps/v1',
        kind: 'DaemonSet',
        metadata: {
          name: 'aws-otel-eks-ci',
          namespace: 'aws-otel-eks',
        },
        spec: {
          selector: {
            matchLabels: {
              name: 'aws-otel-eks-ci',
            },
          },
          template: {
            metadata: {
              labels: {
                name: 'aws-otel-eks-ci',
              },
            },
            spec: {
              containers: [
                {
                  name: 'aws-otel-collector',
                  image: 'public.ecr.aws/aws-observability/aws-otel-collector:latest',
                  securityContext: {
                    runAsUser: 0,
                    runAsGroup: 0,
                  },
                  env: [
                    {
                      name: 'K8S_NODE_NAME',
                      valueFrom: {
                        fieldRef: {
                          fieldPath: 'spec.nodeName',
                        },
                      },
                    },
                    {
                      name: 'HOST_IP',
                      valueFrom: {
                        fieldRef: {
                          fieldPath: 'status.hostIP',
                        },
                      },
                    },
                    {
                      name: 'HOST_NAME',
                      valueFrom: {
                        fieldRef: {
                          fieldPath: 'spec.nodeName',
                        },
                      },
                    },
                    {
                      name: 'K8S_NAMESPACE',
                      valueFrom: {
                        fieldRef: {
                          fieldPath: 'metadata.namespace',
                        },
                      },
                    },
                  ],
                  imagePullPolicy: 'Always',
                  command: [
                    '/awscollector',
                    '--config=/conf/otel-agent-config.yaml',
                  ],
                  volumeMounts: [
                    {
                      name: 'rootfs',
                      mountPath: '/rootfs',
                      readOnly: true,
                    },
                    {
                      name: 'dockersock',
                      mountPath: '/var/run/docker.sock',
                      readOnly: true,
                    },
                    {
                      name: 'containerdsock',
                      mountPath: '/run/containerd/containerd.sock',
                    },
                    {
                      name: 'varlibdocker',
                      mountPath: '/var/lib/docker',
                      readOnly: true,
                    },
                    {
                      name: 'sys',
                      mountPath: '/sys',
                      readOnly: true,
                    },
                    {
                      name: 'devdisk',
                      mountPath: '/dev/disk',
                      readOnly: true,
                    },
                    {
                      name: 'otel-agent-config-vol',
                      mountPath: '/conf',
                    },
                  ],
                  resources: {
                    limits: {
                      cpu: '200m',
                      memory: '200Mi',
                    },
                    requests: {
                      cpu: '200m',
                      memory: '200Mi',
                    },
                  },
                },
              ],
              volumes: [
                {
                  configMap: {
                    name: 'otel-agent-conf',
                    items: [
                      {
                        key: 'otel-agent-config',
                        path: 'otel-agent-config.yaml',
                      },
                    ],
                  },
                  name: 'otel-agent-config-vol',
                },
                {
                  name: 'rootfs',
                  hostPath: {
                    path: '/',
                  },
                },
                {
                  name: 'dockersock',
                  hostPath: {
                    path: '/var/run/docker.sock',
                  },
                },
                {
                  name: 'varlibdocker',
                  hostPath: {
                    path: '/var/lib/docker',
                  },
                },
                {
                  name: 'containerdsock',
                  hostPath: {
                    path: '/run/containerd/containerd.sock',
                  },
                },
                {
                  name: 'sys',
                  hostPath: {
                    path: '/sys',
                  },
                },
                {
                  name: 'devdisk',
                  hostPath: {
                    path: '/dev/disk/',
                  },
                },
              ],
              serviceAccountName: 'aws-otel-sa',
            },
          },
        },
      }],
    });

    // Add dependencies
    configMap.node.addDependency(namespace);
    daemonSet.node.addDependency(adotServiceAccount);
    daemonSet.node.addDependency(configMap);
  }
}
