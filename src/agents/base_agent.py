from typing import List, Optional, Dict, Any
from agno import Agent, ReasoningTools, Memory
from pydantic import BaseModel

class AgentResponse(BaseModel):
    """Response model for agent interactions"""
    content: str
    metadata: Optional[Dict[str, Any]] = None

class BaseAgent:
    """Base agent implementation using Agno framework"""
    
    def __init__(
        self,
        model: str = "gpt-4",
        memory: bool = True,
        tools: Optional[List] = None
    ):
        self.agent = Agent(
            model=model,
            tools=tools or [ReasoningTools()],
            memory=memory
        )
        
    async def process_message(self, message: str) -> AgentResponse:
        """Process an incoming message"""
        response = await self.agent.chat(message)
        return AgentResponse(
            content=response.content,
            metadata=response.metadata
        )
    
    async def think(self, prompt: str) -> AgentResponse:
        """Use reasoning tools to think through a problem"""
        response = await self.agent.think(prompt)
        return AgentResponse(
            content=response.content,
            metadata=response.metadata
        )
    
    async def analyze(self, data: Any) -> AgentResponse:
        """Analyze data using reasoning tools"""
        response = await self.agent.analyze(data)
        return AgentResponse(
            content=response.content,
            metadata=response.metadata
        ) 