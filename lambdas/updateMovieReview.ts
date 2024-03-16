import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, UpdateCommandInput, QueryCommand, QueryCommandInput  } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

async function validateInput(movieId: number, reviewerName: string, pathMovieId: number, pathReviewerName: string): Promise<boolean> {
    // Validate whether the movieId and reviewerName in the request body match those in the path parameters.
    const sanitizedReviewerName = pathReviewerName.replace(/%20/g, ' ');
    const isValidInput = movieId === pathMovieId && reviewerName === sanitizedReviewerName;
    return isValidInput;
}
// Function to check the reviewer name
async function checkReviewerExistence(pathMovieId: number, pathReviewerName: string): Promise<boolean> {
    // Sanitize the reviewerName received from the API to replace "%20" with spaces,
    // ensuring it matches the format stored in the database.
    const sanitizedReviewerName = pathReviewerName.replace(/%20/g, ' ');

    const commandInput: QueryCommandInput = {
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: "movieId = :m AND reviewerName = :rn",
        ExpressionAttributeValues: {
            ":m": pathMovieId,
            ":rn": sanitizedReviewerName,
        },
    };

    const commandOutput = await ddbDocClient.send(new QueryCommand(commandInput));

    return commandOutput.Items !== undefined && commandOutput.Items.length > 0;
}

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try {
        const parameters = event?.pathParameters;
        const pathMovieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
        const pathReviewerName = parameters?.reviewerName;
        const requestBody = event.body ? JSON.parse(event.body) : undefined;
        const { movieId, reviewerName, reviewDate, content, rating} = requestBody;

        if (!pathMovieId || !pathReviewerName) {
            return {
                statusCode: 400,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ message: "Invalid request parameters" }),
            };
        }

        const [reviewerExists, commandOutput] = await Promise.all([
            checkReviewerExistence(pathMovieId, pathReviewerName),
            queryDynamoDB(pathMovieId, pathReviewerName)
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

        const isValidInput = await validateInput(movieId, reviewerName, pathMovieId, pathReviewerName);
        if (!isValidInput) {
            return {
                statusCode: 400,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ message: "Invalid movieId or reviewerName" }),
            };
        }
        
        // update the data
        await updateReview(movieId, reviewerName, reviewDate, content, rating);

        // return successful
        return {
            statusCode: 200,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ message: "Review text updated successfully" }),
        };
    } catch (error: any) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ message: error }),
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

async function updateReview(movieId: number, reviewerName: string, reviewDate: string, content: string, rating: number): Promise<void> {
    let updateExpression = "SET";
    let expressionAttributeValues: Record<string, any> = {};

    if (reviewDate) {
        updateExpression += " reviewDate = :d,";
        expressionAttributeValues[":d"] = reviewDate;
    }
    if (content) {
        updateExpression += " content = :c,";
        expressionAttributeValues[":c"] = content;
    }
    if (typeof rating === "number") {
        updateExpression += " rating = :r,";
        expressionAttributeValues[":r"] = rating;
    }

    // remove the last comma
    updateExpression = updateExpression.slice(0, -1);

    const commandInput: UpdateCommandInput = {
        TableName: process.env.TABLE_NAME,
        Key: {
            movieId: movieId,
            reviewerName: reviewerName,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
    };
    await ddbDocClient.send(new UpdateCommand(commandInput));
}

async function queryDynamoDB(pathMovieId: number, pathReviewerName: string): Promise<any> {
    const sanitizedReviewerName = pathReviewerName.replace(/%20/g, ' ');

    const commandInput: QueryCommandInput = {
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: "movieId = :m AND reviewerName = :rn",
        ExpressionAttributeValues: {
            ":m": pathMovieId,
            ":rn": sanitizedReviewerName,
        },
    };

    return await ddbDocClient.send(new QueryCommand(commandInput));
}