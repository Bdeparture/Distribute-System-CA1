import { marshall } from "@aws-sdk/util-dynamodb";
import { Movie, MovieCast, MovieReviews } from "./types";

type Entity = Movie | MovieCast | MovieReviews; // NEW
export const generateItem = (entity: Entity) => {
  return {
    PutRequest: {
      Item: marshall(entity),
    },
  };
};

export const generateBatch = (data: Entity[]) => {
  return data.map((e) => {
    return generateItem(e);
  });
};