"""
Telegram integration that listens for messages and coordinates with the orchestrator.
"""
import os
import logging
import asyncio
from typing import Optional
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

logger = logging.getLogger(__name__)

class TelegramListener:
    """
    Telegram bot integration that listens for messages and forwards them to the orchestrator.
    """
    
    def __init__(self, orchestrator=None):
        """Initialize the Telegram listener."""
        self.orchestrator = orchestrator
        self.application = None
        self.is_running = False
        
        # Get bot token from environment
        self.bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
        if not self.bot_token:
            raise ValueError("TELEGRAM_BOT_TOKEN environment variable is required")
        
        logger.info("TelegramListener initialized")
    
    async def start(self):
        """Start the Telegram bot."""
        if self.is_running:
            logger.warning("Telegram listener is already running")
            return
        
        try:
            # Create the Application
            self.application = Application.builder().token(self.bot_token).build()
            
            # Add handlers
            self.application.add_handler(CommandHandler("start", self.start_command))
            self.application.add_handler(CommandHandler("help", self.help_command))
            self.application.add_handler(CommandHandler("status", self.status_command))
            self.application.add_handler(CommandHandler("history", self.history_command))
            self.application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_message))
            
            # Start the bot
            await self.application.initialize()
            await self.application.start()
            await self.application.updater.start_polling()
            
            self.is_running = True
            logger.info("Telegram bot started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start Telegram bot: {e}")
            raise
    
    async def stop(self):
        """Stop the Telegram bot."""
        if not self.is_running:
            return
        
        try:
            if self.application:
                await self.application.updater.stop()
                await self.application.stop()
                await self.application.shutdown()
            
            self.is_running = False
            logger.info("Telegram bot stopped")
            
        except Exception as e:
            logger.error(f"Error stopping Telegram bot: {e}")
    
    async def start_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command."""
        user = update.effective_user
        welcome_message = f"""
🤖 Hello {user.first_name}! I'm your AI assistant.

I'm powered by an advanced AI agent system that can:
• Answer questions and have conversations
• Perform reasoning and analysis
• Execute various actions and API calls
• Remember our conversation history

Type any message to get started, or use /help for more commands.
        """
        await update.message.reply_text(welcome_message.strip())
    
    async def help_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /help command."""
        help_message = """
🔧 Available Commands:

/start - Start the bot and get a welcome message
/help - Show this help message
/status - Check the system status
/history - Show recent conversation history

💬 Just send me any message and I'll respond using my AI capabilities!

I can help with:
• Answering questions
• Problem solving and analysis
• General conversation
• Various tasks and actions
        """
        await update.message.reply_text(help_message.strip())
    
    async def status_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /status command."""
        try:
            if self.orchestrator:
                health = await self.orchestrator.health_check()
                status_message = f"""
🔍 System Status:

🎭 Orchestrator: {'✅ Running' if health['orchestrator'] else '❌ Stopped'}
🤖 AI Agent: {'✅ Active' if health['agent'] else '❌ Inactive'}
📱 Telegram: {'✅ Connected' if health['telegram'] else '❌ Disconnected'}
⚙️ Task Manager: {'✅ Running' if health['task_manager'] else '❌ Stopped'}
🔧 Action Manager: {'✅ Active' if health['action_manager'] else '❌ Inactive'}

📊 Active Sessions: {health['active_sessions']}
                """
            else:
                status_message = "❌ Orchestrator not connected"
            
            await update.message.reply_text(status_message.strip())
            
        except Exception as e:
            await update.message.reply_text(f"❌ Error checking status: {str(e)}")
    
    async def history_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /history command."""
        try:
            user_id = str(update.effective_user.id)
            chat_id = str(update.effective_chat.id)
            
            if self.orchestrator:
                # Get session data
                session_data = self.orchestrator.get_session_data(user_id, chat_id)
                agent_history = self.orchestrator.get_agent_history()
                
                if session_data:
                    history_message = f"""
📚 Session History:

👤 User ID: {user_id}
💬 Messages: {session_data.get('message_count', 0)}
🕐 Created: {session_data.get('created_at', 'Unknown')}

🤖 Agent History: {len(agent_history)} interactions

Last message: {session_data.get('last_message', 'None')[:100]}...
                    """
                else:
                    history_message = "📚 No session history found. Start a conversation!"
            else:
                history_message = "❌ Orchestrator not connected"
            
            await update.message.reply_text(history_message.strip())
            
        except Exception as e:
            await update.message.reply_text(f"❌ Error retrieving history: {str(e)}")
    
    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle regular text messages."""
        try:
            # Extract message details
            message = update.message.text
            user_id = str(update.effective_user.id)
            chat_id = str(update.effective_chat.id)
            user_name = update.effective_user.first_name or "User"
            
            logger.info(f"Received message from {user_name} ({user_id}): {message[:50]}...")
            
            # Send typing indicator
            await context.bot.send_chat_action(chat_id=chat_id, action="typing")
            
            # Process message through orchestrator
            if self.orchestrator:
                response = await self.orchestrator.handle_message(message, user_id, chat_id)
            else:
                response = "❌ System not ready. Orchestrator not connected."
            
            # Send response
            await update.message.reply_text(response)
            
            logger.info(f"Sent response to {user_name}: {response[:50]}...")
            
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            error_response = f"❌ I encountered an error processing your message: {str(e)}"
            await update.message.reply_text(error_response)
    
    async def send_message(self, chat_id: str, message: str):
        """Send a message to a specific chat (for proactive messaging)."""
        try:
            if self.application and self.is_running:
                await self.application.bot.send_message(chat_id=chat_id, text=message)
                logger.info(f"Sent proactive message to chat {chat_id}")
            else:
                logger.warning("Cannot send message: bot not running")
        except Exception as e:
            logger.error(f"Error sending message to chat {chat_id}: {e}")
    
    def get_bot_info(self):
        """Get information about the bot."""
        return {
            "is_running": self.is_running,
            "has_token": bool(self.bot_token),
            "has_application": self.application is not None
        } 