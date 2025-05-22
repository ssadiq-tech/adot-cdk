#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AdotEksCdkStack } from './adot-eks-cdk-stack';

const app = new cdk.App();
new AdotEksCdkStack(app, 'AdotEksStack');
