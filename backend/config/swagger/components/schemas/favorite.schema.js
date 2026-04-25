module.exports = {
  Favorite: {
    type: "object",
    properties: {
      _id: {
        type: "string",
        format: "ObjectId",
      },
      userId: {
        type: "string",
        format: "ObjectId",
      },
      recipeId: {
        type: "string",
        format: "ObjectId",
      },
      recipeSnapshot: {
        $ref: "#/components/schemas/Recipe",
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
    },
  },
};
