# Simplify Converter
  
This is a facility toolkit to support converting from Serverless framework's YAML definition to OpenAPI 3.0 specs that compatible with Simplify specs definition.

*Node.js-based command line toolkit requires node >= 8.x version or later.*

```
npm install -g simplify-converter
simplify-converter serverless -i spec.yaml -o ../output -c config.yaml
```

Serverless Framework example: `spec.yaml`

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
functions:
  get-pets-list:
    handler: src/index.handler
    events:
      - http:
          method: get
          path: pets
          description: Retrieve list of pets.

plugins:
  - serverless-webpack
  - serverless-plugin-log-retention

resources:
  Resources:
    SharedFileResourcesBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: my-shared-files-bucket
        CorsConfiguration:
          CorsRules:
            - AllowedMethods:
                - GET
                - POST
              AllowedOrigins:
                - "*"
              AllowedHeaders:
```

Mapping Configuration: `config.yaml`

```
ProjectName: ServerlessAPI
ProjectDesc: Serverless to OpenAPI 3.0 specs
DeploymentName: serverless-dev
DeploymentRegion: eu-west-1
DeploymentProfile: simplify-eu
Mappings:
  Functions:
    'get-pets-list':
      ServiceName: pets-service
      ServiceModel: pets
```
TODO: there will be no need to have this!
(Possible to convert directly from yaml)
***Simplify Toolkit @Copyright 2020***
