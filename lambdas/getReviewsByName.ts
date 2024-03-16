import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from "@aws-sdk/lib-dynamodb";

import Ajv from "ajv";

const ajv = new Ajv();
const ddbDocClient = createDDbDocClient();

// Function to check the reviewer name
async function checkReviewerExistence(movieId: number, reviewerName: string): Promise<boolean> {
    // Sanitize the reviewerName received from the API to replace "%20" with spaces,
    // ensuring it matches the format stored in the database.
    const sanitizedReviewerName = reviewerName.replace(/%20/g, ' ');

    const commandInput: QueryCommandInput = {
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: "movieId = :m AND reviewerName = :rn",
        ExpressionAttributeValues: {
            ":m": movieId,
            ":rn": sanitizedReviewerName,
        },
    };

    const commandOutput = await ddbDocClient.send(new QueryCommand(commandInput));

    return commandOutput.Items !== undefined && commandOutput.Items.length > 0;
}

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {     // Note change
    try {
        console.log("Event: ", event);
        const parameters = event?.pathParameters;
        const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
        const reviewerName = parameters?.reviewerName;

        if (!movieId || !reviewerName) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "Missing movie Id or reviewerName" }),
            };
        }

        const [reviewerExists, commandOutput] = await Promise.all([
            checkReviewerExistence(movieId, reviewerName),
            queryDynamoDB(movieId, reviewerName)
        ]);

        if (!reviewerExists || !commandOutput.Items) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "No reviews found for this movie and reviewer" }),
            };
        }

        const body = {
            data: commandOutput.Items,
        };

        // Return Response
        return {
            statusCode: 200,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
        };
    } catch (error: any) {
        console.log(JSON.stringify(error));
        return {
            statusCode: 500,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ error }),
        };
    }
};

function createDDbDocClient() {
    const ddbClient = new DynamoDBClient({ region: process.env.REGION });
    const marshallOptions = {
        convertEmptyValues: true,
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
    };
    const unmarshallOptions = {
        wrapNumbers: false,
    };
    const translateConfig = { marshallOptions, unmarshallOptions };
    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}

async function queryDynamoDB(movieId: number, reviewerName: string): Promise<any> {
    const sanitizedReviewerName = reviewerName.replace(/%20/g, ' ');

    const commandInput: QueryCommandInput = {
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: "movieId = :m AND reviewerName = :rn",
        ExpressionAttributeValues: {
            ":m": movieId,
            ":rn": sanitizedReviewerName,
        },
    };

    return await ddbDocClient.send(new QueryCommand(commandInput));
}
