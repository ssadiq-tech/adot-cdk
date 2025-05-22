#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AdotEksCdkStack } from '../lib/adot-eks-cdk-stack';

const app = new cdk.App();
new AdotEksCdkStack(app, 'AdotEksCdkStack', {
  env: {
    account: '131332286832',
    region: 'us-east-1',
  },
});
