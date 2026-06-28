# Smart Nutrition Recommendation System
  
  Nutrition Recommendation System is a full-stack web application that delivers personalized meal planning, automated nutrition analysis from recipes, and conversational assistance through an intelligent chatbot.
  The platform is tailored for Vietnamese users, leveraging Vietnamese food data, local ingredients, and culturally relevant dietary and exercise patterns.

---
## Main Features

#### User Features

- Manage personal profiles, daily and weekly meal.
- Calculate personalized nutritional requirements (TDEE, BRM).
- Receive adaptive daily and weekly meal recommendations.
- Track meal history and daily nutrition intake.
- Calculate total calories and detailed nutritional facts from recipes/food image.
- Interact with the AI chatbot for nutrition assistance.

#### Admin Features

- Manage ingredients, recipes, exercises, users, audit logs.
- Maintain the nutrition knowledge base.

---

## Tech Stack

### Frontend
- React 18
- Material UI

### Backend
- Node.js
- Express 
- MongoDB + Mongoose
- JWT Authentication
- Cloudinary
- Gemini API

### Search Service
- Python
- Sentence Transformers (multilingual-e5-base)
- FAISS

---

## Installation

## Backend Setup

cd backend  
npm install  
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

## Search Service (Python)

cd search-service
python3 -m venv venv  
source venv/bin/activate
python3 -m pip install -r requirements.txt
python build_index.py
uvicorn server:app --host 0.0.0.0 --port 8000 --reload

Search Service will run at:
http://localhost:8000

---
