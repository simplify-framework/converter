# Simplify Framework - Converter
  
![NPM Downloads](https://img.shields.io/npm/dw/simplify-converter)
![Package Version](https://img.shields.io/github/package-json/v/simplify-framework/converter?color=green)

This is a facility toolkit to support converting from Serverless framework's YAML definition to OpenAPI 3.0 specs that compatible with Simplify specs definition.

*Node.js-based command line toolkit requires node >= 8.x version or later.*

```
npm install -g simplify-converter
simplify-converter -i serverless.yaml -o .
```

Serverless Framework example: `serverless.yaml`

```yaml
# For full config options, check the docs:
#    docs.serverless.com
#    https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/
#
# Happy Coding!

service: pets-service

# You can pin your service to only deploy with a specific Serverless version
# Check out our docs for more details
# frameworkVersion: "=X.X.X"

provider:
  name: aws
  runtime: nodejs12.x
  iamRoleStatements:
    - Effect: 'Allow'
      Action:
        - 's3:ListBucket'
      Resource:
        Fn::Join:
          - ''
          - - 'arn:aws:s3:::'
            - Ref: SharedFileResourcesBucket
    - Effect: 'Allow'
      Action:
        - 's3:PutObject'
      Resource:
        Fn::Join:
          - ''
          - - 'arn:aws:s3:::'
            - Ref: SharedFileResourcesBucket
            - '/*'

functions:
  get-pets-list:
    handler: src/handlers/index.handler
    events:
      - http:
          method: get
          path: pets
          description: Retrieve list of pets.
      - schedule: rate(2 hours)
      - cloudwatchLog: '/aws/lambda/hello'
      - sns:
          arn: arn:aws:sns:${self:provider.region}:${self:provider.accountId, '01234567890'}:topicname
          topicName: topicname-${self:provider.accountId, '01234567890'}-${self:provider.region}
plugins:
  - serverless-webpack
  - serverless-plugin-log-retention

resources:
  Resources:
    SharedFileResourcesBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: ${self:service}-bucket
        CorsConfiguration:
          CorsRules:
            - AllowedMethods:
                - GET
                - POST
              AllowedOrigins:
                - "*"
```

> Resource dependancy will be generated into one CloudFormation YAML stack and be able to manage it independently.

## HOW TO: Deploy external resources
  Simplify Converter generates a set of managed stacks including Simplify SDK script to be able to run by npm commands:

  ```bash
  cd resources
  npm install
  npm run stack-deploy
  ...
  npm run stack-destroy
  ```

> Your AWS Credentials must be configured manually to have permission for deploying external resources.

***Simplify Framework @Copyright 2020***
