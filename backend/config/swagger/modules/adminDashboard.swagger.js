module.exports = {
  "/admin/dashboard/stats": {
    get: {
      tags: ["Dashboard"],
      summary: "Lấy thống kê dashboard",
      description: "Lấy dữ liệu thống kê cho dashboard (ADMIN và USER)",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Dữ liệu thống kê dashboard",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  donutChart: { type: "object" },
                  lineChart: { type: "object" },
                },
              },
            },
          },
        },
        401: {
          description: "Chưa xác thực",
        },
      },
    },
  },
};
