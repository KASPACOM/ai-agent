import logging
from typing import Optional
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    filters,
    ContextTypes
)
from src.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)

class TelegramBot:
    """Telegram bot integration"""
    
    def __init__(
        self,
        token: str,
        agent: Optional[BaseAgent] = None
    ):
        self.token = token
        self.agent = agent or BaseAgent()
        self.application = Application.builder().token(token).build()
        
        # Register handlers
        self.application.add_handler(CommandHandler("start", self.start_command))
        self.application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_message))
    
    async def start_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command"""
        await update.message.reply_text(
            "Hello! I'm your AI assistant. How can I help you today?"
        )
    
    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle incoming messages"""
        try:
            response = await self.agent.process_message(update.message.text)
            await update.message.reply_text(response.content)
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            await update.message.reply_text(
                "I apologize, but I encountered an error processing your message."
            )
    
    def run(self):
        """Run the bot"""
        self.application.run_polling() 