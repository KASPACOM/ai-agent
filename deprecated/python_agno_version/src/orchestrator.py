"""
Orchestrator class that manages the entire AI agent system.
"""
import asyncio
import logging
from typing import Dict, Any, Optional
from agents.base_agent import BaseAgent
from integrations.telegram_listener import TelegramListener
from tasks.task_manager import TaskManager
from actions.action_manager import ActionManager

logger = logging.getLogger(__name__)

class Orchestrator:
    """
    Main orchestrator that coordinates all system components:
    - Telegram integration (listener/responder)
    - AI Agent (with tools and memory)
    - Task management (future automated tasks)
    - Action management (API calls and external integrations)
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize the orchestrator with all components."""
        self.config = config or {}
        
        # Initialize core components
        self.agent = None
        self.telegram = None
        self.task_manager = None
        self.action_manager = None
        
        # System state
        self.is_running = False
        self.session_data = {}
        
        logger.info("Orchestrator initialized")
    
    async def initialize(self):
        """Initialize all components asynchronously."""
        try:
            # Initialize AI Agent with tools and memory
            logger.info("Initializing AI Agent...")
            self.agent = BaseAgent(
                model_name=self.config.get("model_name", "gpt-4o")
            )
            
            # Initialize Action Manager (API calls, external integrations)
            logger.info("Initializing Action Manager...")
            self.action_manager = ActionManager()
            
            # Initialize Task Manager (future automated tasks)
            logger.info("Initializing Task Manager...")
            self.task_manager = TaskManager()
            
            # Initialize Telegram integration
            logger.info("Initializing Telegram integration...")
            self.telegram = TelegramListener(
                orchestrator=self  # Pass reference for message handling
            )
            
            logger.info("All components initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize orchestrator: {e}")
            raise
    
    async def start(self):
        """Start the orchestrator and all its components."""
        if self.is_running:
            logger.warning("Orchestrator is already running")
            return
        
        try:
            # Initialize if not already done
            if not self.agent:
                await self.initialize()
            
            logger.info("Starting orchestrator...")
            self.is_running = True
            
            # Start Telegram listener
            await self.telegram.start()
            
            # Start task manager (for future automated tasks)
            await self.task_manager.start()
            
            logger.info("Orchestrator started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start orchestrator: {e}")
            self.is_running = False
            raise
    
    async def stop(self):
        """Stop the orchestrator and all its components."""
        if not self.is_running:
            return
        
        logger.info("Stopping orchestrator...")
        self.is_running = False
        
        # Stop all components
        if self.telegram:
            await self.telegram.stop()
        
        if self.task_manager:
            await self.task_manager.stop()
        
        logger.info("Orchestrator stopped")
    
    async def handle_message(self, message: str, user_id: str, chat_id: str) -> str:
        """
        Main message handling pipeline.
        This is called by the Telegram listener when a message is received.
        """
        try:
            logger.info(f"Processing message from user {user_id}: {message[:50]}...")
            
            # Update session context
            session_key = f"{user_id}_{chat_id}"
            if session_key not in self.session_data:
                self.session_data[session_key] = {
                    "user_id": user_id,
                    "chat_id": chat_id,
                    "message_count": 0,
                    "created_at": "now"  # You can add proper timestamp
                }
            
            self.session_data[session_key]["message_count"] += 1
            self.session_data[session_key]["last_message"] = message
            
            # Process message through AI agent
            # The agent will use its tools to:
            # 1. Analyze the message and decide what actions are needed
            # 2. Execute any required API calls through action tools
            # 3. Build a comprehensive response
            response = await self.agent.process_message(message)
            
            # Update session with response
            self.session_data[session_key]["last_response"] = response
            
            logger.info(f"Generated response for user {user_id}: {response[:50]}...")
            return response
            
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            return f"I apologize, but I encountered an error processing your message: {str(e)}"
    
    async def execute_action(self, action_name: str, params: Dict[str, Any]) -> Any:
        """
        Execute an action through the action manager.
        This can be called by agent tools when they need to make API calls.
        """
        try:
            return await self.action_manager.execute(action_name, params)
        except Exception as e:
            logger.error(f"Error executing action {action_name}: {e}")
            raise
    
    def get_session_data(self, user_id: str, chat_id: str) -> Dict[str, Any]:
        """Get session data for a specific user/chat."""
        session_key = f"{user_id}_{chat_id}"
        return self.session_data.get(session_key, {})
    
    def get_agent_history(self) -> list:
        """Get the agent's session history (managed by Agno)."""
        if self.agent:
            return self.agent.session_history
        return []
    
    async def health_check(self) -> Dict[str, Any]:
        """Check the health of all components."""
        return {
            "orchestrator": self.is_running,
            "agent": self.agent is not None,
            "telegram": self.telegram.is_running if self.telegram else False,
            "task_manager": self.task_manager.is_running if self.task_manager else False,
            "action_manager": self.action_manager is not None,
            "active_sessions": len(self.session_data)
        } 