import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";
import 'source-map-support/register';

const ddbDocClient = createDDbDocClient();
const translateClient = new TranslateClient({});

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => { // CHANGED

    try {
        console.log("Event: ", event);
        const movieId = event.pathParameters?.movieId ? parseInt(event.pathParameters.movieId) : null;
        const reviewerName = event.pathParameters?.reviewerName;
        const languageCode = event.queryStringParameters?.language || 'en';

        if (!movieId || !reviewerName) {
            return {
                statusCode: 400,
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ Message: "Missing movie ID or reviewer name" }),
            };
        }

        const review = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.TABLE_NAME,
                Key: { movieId, reviewerName },
            }));

        if (!review.Item || !review.Item.content) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "Review content not found or empty." }),
            };
        }

        const translateCommand = new TranslateTextCommand({
            Text: review.Item.content,
            SourceLanguageCode: 'auto',
            TargetLanguageCode: languageCode,
        });

        const translatedTextResponse = await translateClient.send(translateCommand);


        let body = {
            originalReview: review.Item,
            translatedReview: translatedTextResponse.TranslatedText,
        };

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
            statusCode: 400,
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