import * as cdk from 'aws-cdk-lib';
import { AdotEKSStack } from './adot-eks-cdk-stack';

const app = new cdk.App();
new AdotEKSStack(app, 'AdotEKSStack');
