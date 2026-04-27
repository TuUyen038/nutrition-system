module.exports = {
  openapi: "3.0.0",
  info: {
    title: "Nutrition App API",
    version: "1.0.0",
    description: "Tài liệu API cho hệ thống quản lý dinh dưỡng",
  },
  servers: [
    {
      url: "http://localhost:3000/api",
      description: "Local server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
};