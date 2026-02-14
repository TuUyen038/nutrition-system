# Smart Nutrition Recommendation System
  
  AI Nutrition Recommendation System is a full-stack web application that delivers personalized nutrition recommendations and weekly meal planning powered by AI. 
  The platform is tailored for Vietnamese users, leveraging Vietnamese food data, local ingredients, and culturally relevant dietary and exercise patterns.

---
## Overview

This system allows users to:

- Create and manage weekly meal plans 
- Track daily calories and macronutrients
- Analyze nutrition data with charts
- Receive AI-powered food recommendations
- Upload and manage food-related images

The application is built with a React frontend and a Node.js + Express backend using MongoDB.

---

## Tech Stack

### Frontend
- React 18
- React Router v6
- Material UI (MUI)
- Chart.js
- React Table
- Yup (form validation)
- Day.js

### Backend
- Node.js
- Express 5
- MongoDB + Mongoose
- JWT Authentication
- Cloudinary (image storage)
- Multer
- Nodemailer
- Swagger (API documentation)

### AI Integration
- Google GenAI
- HuggingFace Inference API
- Transformers

---

## Installation

## Backend Setup

cd backend  
npm install  

Create a `.env` file inside the backend directory:

PORT=5000  
MONGO_URI=your_mongodb_connection_string  
JWT_SECRET=your_jwt_secret  
CLOUDINARY_CLOUD_NAME=your_cloud_name  
CLOUDINARY_API_KEY=your_api_key  
CLOUDINARY_API_SECRET=your_api_secret  
...

Run the backend:

npm run dev  

Backend will run at:

http://localhost:3000  

Swagger API documentation:

http://localhost:3000/api-docs  

---

## Frontend Setup

cd frontend  
npm install  
npm start  

Frontend will run at:
http://localhost:3000 (default port)

If a custom PORT is configured:
http://localhost:3001

---
