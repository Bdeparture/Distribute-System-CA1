import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import Ajv from "ajv";
import schema from "../shared/types.schema.json";

const ajv = new Ajv();
const ddbClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try {
        const isValidQueryParams = ajv.compile(
            schema.definitions["MovieReviewQueryParams"] || {}
        );
        console.log("Event: ", event);
        const parameters = event?.pathParameters;
        const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
        const minRating = event?.queryStringParameters?.minRating ? parseInt(event.queryStringParameters.minRating) : undefined;
        const year = event?.queryStringParameters?.year ? parseInt(event.queryStringParameters.year) : undefined;

        if (!movieId) {
            return {
                statusCode: 400,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "Invalid movie Id" }),
            };
        }

        const commandInput: QueryCommandInput = {
            TableName: process.env.TABLE_NAME,
            KeyConditionExpression: "movieId = :m",
            ExpressionAttributeValues: {
                ":m": movieId,
            },
        };

        const commandOutput = await ddbClient.send(
            new QueryCommand(commandInput)
        );

        if (!commandOutput || !commandOutput.Items || commandOutput.Items.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "No movie reviews found for this movie" }),
            };
        }

        let reviews = commandOutput.Items;

        // Filter by minRating if provided
        if (minRating) {
            reviews = reviews.filter(item => item.rating >= minRating);
        }

        // Filter by year if provided
        if (year) {
            reviews = reviews.filter(item => {
                const reviewYear = new Date(item.reviewDate).getFullYear();
                return reviewYear === year;
            });
        }

        return {
            statusCode: 200,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                data: reviews,
            }),
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
