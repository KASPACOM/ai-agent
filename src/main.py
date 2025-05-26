"""
Main entry point for the AI Agent system.
Uses the Orchestrator to manage all components.
"""
import asyncio
import logging
import os
import signal
from dotenv import load_dotenv
from orchestrator import Orchestrator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/app.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

class Application:
    """Main application class that manages the orchestrator."""
    
    def __init__(self):
        """Initialize the application."""
        self.orchestrator = None
        self.running = False
        
        # Load environment variables
        load_dotenv("development.env")
        
        # Validate required environment variables
        self._validate_environment()
        
        logger.info("Application initialized")
    
    def _validate_environment(self):
        """Validate that required environment variables are set."""
        required_vars = [
            "TELEGRAM_BOT_TOKEN",
            "OPENAI_API_KEY"
        ]
        
        missing_vars = []
        for var in required_vars:
            if not os.getenv(var):
                missing_vars.append(var)
        
        if missing_vars:
            raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
        
        logger.info("Environment variables validated")
    
    async def start(self):
        """Start the application."""
        try:
            logger.info("Starting AI Agent System...")
            
            # Create orchestrator configuration
            config = {
                "model_name": os.getenv("MODEL_NAME", "gpt-4o"),
                "telegram_token": os.getenv("TELEGRAM_BOT_TOKEN"),
                "openai_api_key": os.getenv("OPENAI_API_KEY")
            }
            
            # Initialize orchestrator
            self.orchestrator = Orchestrator(config)
            
            # Start the orchestrator
            await self.orchestrator.start()
            
            self.running = True
            logger.info("🚀 AI Agent System started successfully!")
            logger.info("📱 Telegram bot is listening for messages...")
            logger.info("🤖 AI agent is ready to process requests...")
            logger.info("⚙️ Task manager is running...")
            logger.info("🔧 Action manager is ready...")
            
            # Keep the application running
            await self._keep_alive()
            
        except Exception as e:
            logger.error(f"Failed to start application: {e}")
            raise
    
    async def stop(self):
        """Stop the application."""
        if not self.running:
            return
        
        logger.info("Stopping AI Agent System...")
        self.running = False
        
        if self.orchestrator:
            await self.orchestrator.stop()
        
        logger.info("AI Agent System stopped")
    
    async def _keep_alive(self):
        """Keep the application running until interrupted."""
        try:
            while self.running:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger.info("Application interrupted")
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
    
    async def health_check(self):
        """Perform a health check of all components."""
        if self.orchestrator:
            return await self.orchestrator.health_check()
        return {"status": "not_running"}

# Global application instance
app = Application()

async def main():
    """Main function."""
    try:
        # Set up signal handlers for graceful shutdown
        def signal_handler(signum, frame):
            logger.info(f"Received signal {signum}")
            asyncio.create_task(app.stop())
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Start the application
        await app.start()
        
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    except Exception as e:
        logger.error(f"Application error: {e}")
        raise
    finally:
        await app.stop()

if __name__ == "__main__":
    try:
        # Create logs directory if it doesn't exist
        os.makedirs("logs", exist_ok=True)
        
        # Run the application
        asyncio.run(main())
        
    except KeyboardInterrupt:
        logger.info("Application interrupted by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        exit(1) 