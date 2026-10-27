# Resume Customizer

Web app that tailors a candidate's resume to a job description using an LLM.

## Tech Stack
- Frontend: Next.js (React, App Router)
- Backend: Python FastAPI
- LLM: Groq API

## LLM Provider & Model
- Provider: Groq
- Model: `openai/gpt-oss-20b` (configurable via `GROQ_MODEL` env var)

## Setup & Run (local)
Backend:
```
cd backend
cp .env.example .env  # add GROQ_API_KEY
pip install -r requirements.txt  # or pip install fastapi uvicorn python-multipart groq pdfplumber python-docx reportlab python-dotenv
uvicorn main:app --reload --port 8000
```
Frontend:
```
cd frontend
npm install
npm run dev
```
Open http://localhost:3000

## Architecture
Next.js frontend (JD input, resume upload, output + download) -> REST API -> FastAPI backend (PDF/DOCX parsing, prompt engineering, LLM integration, response formatting) -> Groq LLM provider.

## Limitations / Trade-offs
- No authentication or history persistence.
- LLM output is plain text; PDF download is basic single-column layout.
- Large files limited to 5MB; extraction quality depends on resume format.
- Requires valid GROQ_API_KEY.

## AI Tools Used
- Groq API (LLM provider)
- ChatGPT/Copilot for development assistance
