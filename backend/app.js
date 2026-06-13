const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const connectDB = require("./config/database");
const indexRoutes = require("./routes/index.routes");

const swaggerUi = require("swagger-ui-express");
const swaggerSpecs = require("./config/swagger");

connectDB();

const app = express();

app.use(cors({
origin: ["http://localhost:3000", "http://localhost:3001"],
methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// đặt ping ở đây, trước routes cũng được
app.get('/api/ping', (req, res) => {
  res.json({ success: true, message: 'pong' });
});

app.use("/api", indexRoutes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// app.listen để cuối file
app.listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000');
});

module.exports = app;
