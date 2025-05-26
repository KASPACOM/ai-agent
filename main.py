import asyncio
import logging
from dotenv import load_dotenv
from fastapi import FastAPI
from agno import Agent, ReasoningTools

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Kasparebro AI Agent")

# Initialize Agno agent
agent = Agent(
    model="gpt-4",  # or your preferred model
    tools=[ReasoningTools()],
    memory=True
)

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("Starting Kasparebro AI Agent...")
    # Initialize your services here

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Kasparebro AI Agent...")
    # Cleanup your services here

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 