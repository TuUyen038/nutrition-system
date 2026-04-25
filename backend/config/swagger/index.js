const swaggerJsdoc = require("swagger-jsdoc");
const loadModules = require("./loadModules");

const baseConfig = require("./config/swagger.config");

const paths = loadModules(__dirname + "/modules");
const schemas = loadModules(__dirname + "/components/schemas");



// schemas
const authSchemas = require("./components/schemas/auth.schema");
// const mealLogSchemas = require("./components/schemas/mealLog.schema");
const commonSchemas = require("./components/schemas/common.schema");

// paths
const authPaths = require("./modules/auth.swagger");
// const mealLogPaths = require("./modules/mealLog.swagger");

const options = {
  definition: {
    ...baseConfig,

    paths,

    components: {
      ...baseConfig.components,
      schemas,
    },

    
  },

  apis: [], // không cần nếu bạn không dùng swagger-jsdoc comment
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;