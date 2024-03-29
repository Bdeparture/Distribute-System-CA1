import * as apig from "aws-cdk-lib/aws-apigateway";
import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import { generateBatch } from "../shared/util";
import { MethodOptions } from 'aws-cdk-lib/aws-apigateway';
import { movies, movieCasts, movieReviews } from "../seed/movies";
import * as iam from "aws-cdk-lib/aws-iam";

export class RestAPIStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Tables 
    const moviesTable = new dynamodb.Table(this, "MoviesTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Movies",
    });

    const movieReviewsTable = new dynamodb.Table(this, "MovieReviewsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "reviewerName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "MovieReviews",
    });
    // second index
    movieReviewsTable.addGlobalSecondaryIndex({
      indexName: 'ReviewerNameIndex',
      partitionKey: { name: 'reviewerName', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL, 
    });

    const movieCastsTable = new dynamodb.Table(this, "MovieCastTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "actorName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "MovieCast",
    });

    movieCastsTable.addLocalSecondaryIndex({
      indexName: "roleIx",
      sortKey: { name: "roleName", type: dynamodb.AttributeType.STRING },
    });

     // User pool
     const userPoolId = cdk.Fn.importValue('AuthAPIStack-UserPoolId');
     const userPoolClientId = cdk.Fn.importValue(
       'AuthAPIStack-UserPoolClientId',
     );

    // Functions 
    const appCommonFnProps = (tableName: string) => {
      return {
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'handler',
        environment: {
          USER_POOL_ID: userPoolId,
          CLIENT_ID: userPoolClientId,
          REGION: cdk.Aws.REGION,
          TABLE_NAME: tableName,
        },
      };
    };

    const getMovieByIdFn = new lambdanode.NodejsFunction(
      this,
      "GetMovieByIdFn",
      {
         ...appCommonFnProps(moviesTable.tableName),
        entry: `${__dirname}/../lambdas/getMovieById.ts`,
      }
    );

    const getAllMoviesFn = new lambdanode.NodejsFunction(
      this,
      "GetAllMoviesFn",
      {
        ...appCommonFnProps(moviesTable.tableName),
        entry: `${__dirname}/../lambdas/getAllMovies.ts`,
      }
    );

    //Add movie reviews
    const addMovieReviewsFn = new lambdanode.NodejsFunction(
      this,
      "AddMovieReviewsFn",
      {
        ...appCommonFnProps(movieReviewsTable.tableName),
        entry: `${__dirname}/../lambdas/addMovieReviews.ts`,
      }
    )

    //Get all the reviews 
    const getAllMovieReviewsFn = new lambdanode.NodejsFunction(this, "GetMovieReviewsFn", {
      ...appCommonFnProps(movieReviewsTable.tableName),
      entry: `${__dirname}/../lambdas/getAllMovieReviews.ts`,
    });

    //Get reviews by reviewer name
    const getReviewsByNameFn = new lambdanode.NodejsFunction(
      this,
      "GetReviewsByNameFn",
      {
        ...appCommonFnProps(movieReviewsTable.tableName),
        entry: `${__dirname}/../lambdas/getReviewsByName.ts`,
      }
    );

    //update movie review
    const updateMovieReviewFn = new lambdanode.NodejsFunction(
      this,
      "updateMovieReviewFn",
      {
        ...appCommonFnProps(movieReviewsTable.tableName),
        entry: `${__dirname}/../lambdas/updateMovieReview.ts`,
      }
    );

    //get all reviews by reviwer name 
    const getAllReviewsByNameFn = new lambdanode.NodejsFunction(
      this,
      "getAllReviewsByNameFn",
      {
        ...appCommonFnProps(movieReviewsTable.tableName),
        entry: `${__dirname}/../lambdas/getAllReviewsByName.ts`,
      }
    );

    const newMovieFn = new lambdanode.NodejsFunction(this, "AddMovieFn", {
      ...appCommonFnProps(moviesTable.tableName),
      entry: `${__dirname}/../lambdas/addMovie.ts`,
    });

    const getTranslationFn = new lambdanode.NodejsFunction(
      this,
      'GetTranslationFn',
      {
        ...appCommonFnProps(movieReviewsTable.tableName),
        entry: `${__dirname}/../lambdas/getTranslation.ts`,
      },
    );

    new custom.AwsCustomResource(this, "moviesddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [moviesTable.tableName]: generateBatch(movies),
            [movieCastsTable.tableName]: generateBatch(movieCasts),
            [movieReviewsTable.tableName]: generateBatch(movieReviews),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("moviesddbInitData"), //.of(Date.now().toString()),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [moviesTable.tableArn, movieCastsTable.tableArn, movieReviewsTable.tableArn] // Includes movie review
      }),
    });

    // Authorizor
    const authorizerFn = new lambdanode.NodejsFunction(this, 'AuthorizerFn', {
      ...appCommonFnProps(''),
      entry: `${__dirname}/../lambdas/auth/authorizer.ts`,
    });

    const requestAuthorizer = new apig.RequestAuthorizer(
      this,
      'RequestAuthorizer',
      {
        identitySources: [apig.IdentitySource.header('cookie')],
        handler: authorizerFn,
        resultsCacheTtl: cdk.Duration.minutes(0),
      },
    );

    const methodOptions: MethodOptions = { 
        authorizer: requestAuthorizer,
        authorizationType: apig.AuthorizationType.CUSTOM,
    };
    // Permissions 
    moviesTable.grantReadData(getMovieByIdFn)
    moviesTable.grantReadData(getAllMoviesFn)
    moviesTable.grantReadWriteData(newMovieFn)
    movieReviewsTable.grantReadWriteData(addMovieReviewsFn)
    movieReviewsTable.grantReadData(getAllMovieReviewsFn)
    movieReviewsTable.grantReadData(getReviewsByNameFn)
    movieReviewsTable.grantReadWriteData(updateMovieReviewFn)
    movieReviewsTable.grantReadData(getAllReviewsByNameFn)
    movieReviewsTable.grantReadData(getTranslationFn);

    // REST API 
    const api = new apig.RestApi(this, "RestAPI", {
      description: "demo api",
      endpointTypes: [apig.EndpointType.REGIONAL],
      deployOptions: {
        stageName: "dev",
      },
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      },
    });

    const moviesEndpoint = api.root.addResource("movies");
    moviesEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getAllMoviesFn, { proxy: true })
    );

    const movieEndpoint = moviesEndpoint.addResource("{movieId}");
    movieEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieByIdFn, { proxy: true })
    );

    moviesEndpoint.addMethod(
      "POST",
      new apig.LambdaIntegration(newMovieFn,{proxy: true}), methodOptions
    );

    const movieReviewsEndpoint = moviesEndpoint.addResource("reviews");
    movieReviewsEndpoint.addMethod(
      "POST",
      new apig.LambdaIntegration(addMovieReviewsFn, { proxy: true }), methodOptions
    );

    const reviewsEndpoint = movieEndpoint.addResource("reviews");
    reviewsEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getAllMovieReviewsFn, { proxy: true })
    );

    const reviewerNameEndpoint = reviewsEndpoint.addResource("{reviewerName}");
    reviewerNameEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getReviewsByNameFn, { proxy: true })
    );

    reviewerNameEndpoint.addMethod(
      "PUT",
      new apig.LambdaIntegration(updateMovieReviewFn, { proxy: true }), methodOptions
    );

    const reviewEndpoint = api.root.addResource("reviews");
    const reviewerNamesEndpoint = reviewEndpoint.addResource("{reviewerName}");
    reviewerNamesEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getAllReviewsByNameFn, { proxy: true })
    );

    const reviewerMovieIdEndpoint = reviewerNamesEndpoint.addResource('{movieId}');
    const translateEndpopint = reviewerMovieIdEndpoint.addResource('translation');
    translateEndpopint.addMethod(
      'GET',
      new apig.LambdaIntegration(getTranslationFn, {proxy: true}),
    );
  }
}
