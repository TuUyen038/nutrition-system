const axios = require("axios");

const baseURL =
  process.env.AI_SERVICE_URL ||
  process.env.RAG_BASE_URL ||
  "http://localhost:8000";

const timeout = Number(process.env.AI_SERVICE_TIMEOUT_MS || 8000);

const headers = () => {
  const key = process.env.AI_INTERNAL_KEY || process.env.INTERNAL_KEY;
  return key ? { "x-internal-key": key } : {};
};

async function classify(text) {
  const response = await axios.post(
    `${baseURL}/router/classify`,
    { text },
    {
      timeout: Number(process.env.AI_CLASSIFY_TIMEOUT_MS || 3000),
      headers: headers(),
    },
  );
  return response.data;
}

async function retrieve(query, topK = 5, audiences = null) {
  const response = await axios.post(
    `${baseURL}/rag/retrieve`,
    { query, top_k: topK, audiences },
    { timeout, headers: headers() },
  );
  return response.data;
}

module.exports = { classify, retrieve };
