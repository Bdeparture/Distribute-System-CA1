import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDynamoDBDocumentClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try {
        console.log("Event: ", event);
        const parameters = event?.pathParameters;
        const reviewerName = parameters?.reviewerName;

        if (!reviewerName) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "Missing reviewerName" }),
            };
        }

        const commandOutput = await queryDynamoDB(reviewerName);

        if (!commandOutput.Items || commandOutput.Items.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "No reviews found for this reviewer" }),
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

function createDynamoDBDocumentClient() {
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

async function queryDynamoDB(reviewerName: string): Promise<any> {
    const sanitizedReviewerName = reviewerName.replace(/%20/g, ' ');

    const commandInput: QueryCommandInput = {
        TableName: process.env.TABLE_NAME,
        IndexName: 'ReviewerNameIndex', // second index
        KeyConditionExpression: "reviewerName = :rn", 
        ExpressionAttributeValues: {
            ":rn": sanitizedReviewerName,
        },
    };

    return await ddbDocClient.send(new QueryCommand(commandInput));
}