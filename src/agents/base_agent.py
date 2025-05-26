"""
Base AI Agent using Agno framework with tools and session history.
"""
import os
import logging
from typing import Optional, List, Dict, Any
from agno.agent import Agent
from agno.models.openai.chat import OpenAIChat
from agno.tools.reasoning import ReasoningTools
from actions.action_tools import ActionTools

logger = logging.getLogger(__name__)

class BaseAgent:
    """
    Base AI Agent that handles message processing with tools and maintains session history.
    Uses Agno framework for agent management and OpenAI for the underlying model.
    """
    
    def __init__(self, model_name: str = "gpt-4o", orchestrator=None):
        """Initialize the agent with model and tools."""
        self.model_name = model_name
        self.orchestrator = orchestrator
        self.agent = None
        self.session_history = []
        
        # Initialize the agent
        self._initialize_agent()
        
        logger.info(f"BaseAgent initialized with model: {model_name}")
    
    def _initialize_agent(self):
        """Initialize the Agno agent with model and tools."""
        try:
            # Get OpenAI API key
            openai_api_key = os.getenv("OPENAI_API_KEY")
            if not openai_api_key:
                raise ValueError("OPENAI_API_KEY environment variable is required")
            
            # Initialize OpenAI model
            model = OpenAIChat(
                id=self.model_name,
                temperature=0.7,
                max_tokens=2000,
                api_key=openai_api_key
            )
            
            # Initialize tools
            tools = []
            
            # Add reasoning tools for structured thinking
            reasoning_tools = ReasoningTools(add_instructions=True)
            tools.append(reasoning_tools)
            
            # Add action tools for API calls and external integrations
            if self.orchestrator:
                action_tools = ActionTools(orchestrator=self.orchestrator)
                tools.append(action_tools)
            
            # System message for the agent
            system_message = """You are an intelligent AI assistant with access to various tools and capabilities.

Your primary responsibilities:
1. Analyze user messages and understand their intent
2. Use reasoning tools to think through complex problems step by step
3. Execute actions when needed (API calls, data retrieval, etc.)
4. Provide helpful, accurate, and contextual responses
5. Maintain conversation context and remember previous interactions

Available tools:
- Reasoning tools: For structured thinking and problem-solving
- Action tools: For making API calls and external integrations

Always be helpful, accurate, and maintain a friendly conversational tone.
When using tools, explain your reasoning process to the user when appropriate."""
            
            # Create the agent
            self.agent = Agent(
                model=model,
                system_message=system_message,
                tools=tools,
                stream=False,
                # Agno handles session history automatically
                # We can access it through agent.session
            )
            
            logger.info("Agno agent initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize agent: {e}")
            raise
    
    async def process_message(self, message: str) -> str:
        """
        Process a user message and return a response.
        This maintains session history automatically through Agno.
        """
        try:
            logger.info(f"Processing message: {message[:100]}...")
            
            # Use Agno agent to process the message
            # This automatically maintains session history
            run_response = self.agent.run(user_message=message)
            
            # Extract response from RunResponse object
            response = self._extract_response(run_response)
            
            # Update our local session history for external access
            self.session_history.append({
                "role": "user",
                "content": message
            })
            self.session_history.append({
                "role": "assistant", 
                "content": response
            })
            
            logger.info(f"Generated response: {response[:100]}...")
            return response
            
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            return f"I apologize, but I encountered an error processing your message: {str(e)}"
    
    def _extract_response(self, run_response) -> str:
        """Extract the actual response text from Agno's RunResponse object."""
        try:
            # Try different attributes that might contain the response
            if hasattr(run_response, 'content') and run_response.content:
                return str(run_response.content)
            elif hasattr(run_response, 'response') and run_response.response:
                return str(run_response.response)
            elif hasattr(run_response, 'message') and run_response.message:
                return str(run_response.message)
            elif hasattr(run_response, 'text') and run_response.text:
                return str(run_response.text)
            else:
                # Fallback: convert the entire response to string
                return str(run_response)
                
        except Exception as e:
            logger.error(f"Error extracting response: {e}")
            return "I generated a response but had trouble formatting it properly."
    
    def get_session_history(self) -> List[Dict[str, Any]]:
        """Get the current session history."""
        return self.session_history.copy()
    
    def get_agno_session(self):
        """Get the Agno agent's session object for advanced access."""
        if self.agent and hasattr(self.agent, 'session'):
            return self.agent.session
        return None
    
    def clear_session_history(self):
        """Clear the session history."""
        self.session_history = []
        # Note: Agno's internal session history is managed by the framework
        # If you need to clear it, you might need to recreate the agent
        logger.info("Session history cleared")
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the current model."""
        return {
            "model_name": self.model_name,
            "session_length": len(self.session_history),
            "has_agno_session": self.get_agno_session() is not None
        }

    async def think(self, prompt: str) -> str:
        """Use Agno's reasoning tools to think through a problem."""
        try:
            # Use the agent's run method with reasoning
            run_response = self.agent.run(user_message=prompt)
            return self._extract_response(run_response)
        except Exception as e:
            logger.error(f"Error in think method: {e}")
            return f"I encountered an error while thinking: {str(e)}"

    async def analyze(self, content: str) -> str:
        """Use Agno's reasoning tools to analyze content."""
        try:
            prompt = f"Analyze the following content: {content}"
            run_response = self.agent.run(user_message=prompt)
            return self._extract_response(run_response)
        except Exception as e:
            logger.error(f"Error in analyze method: {e}")
            return f"I encountered an error while analyzing: {str(e)}" 