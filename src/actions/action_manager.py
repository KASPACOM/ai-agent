"""
Action Manager for handling API calls and external integrations.
"""
import asyncio
import logging
import aiohttp
import json
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime

logger = logging.getLogger(__name__)

class Action:
    """Represents an action that can be executed by the action manager."""
    
    def __init__(self, action_id: str, name: str, description: str = "", 
                 action_type: str = "api", enabled: bool = True):
        self.action_id = action_id
        self.name = name
        self.description = description
        self.action_type = action_type  # api, webhook, function, etc.
        self.enabled = enabled
        self.created_at = datetime.now()
        self.execution_count = 0
        self.last_execution = None
    
    async def execute(self, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute the action. Override in subclasses."""
        self.execution_count += 1
        self.last_execution = datetime.now()
        
        logger.info(f"Executing action: {self.name}")
        return {
            "action_id": self.action_id,
            "status": "completed",
            "executed_at": self.last_execution.isoformat(),
            "result": "Action executed successfully"
        }

class ActionManager:
    """
    Manages actions (API calls, webhooks, external integrations).
    Provides a registry of available actions that can be called by the AI agent.
    """
    
    def __init__(self):
        """Initialize the action manager."""
        self.actions: Dict[str, Action] = {}
        self.session = None
        
        # Register default actions
        self._register_default_actions()
        
        logger.info("ActionManager initialized")
    
    async def __aenter__(self):
        """Async context manager entry."""
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()
    
    def _register_default_actions(self):
        """Register default actions available to the system."""
        
        # Web search action
        self.register_action(WebSearchAction())
        
        # HTTP request action
        self.register_action(HttpRequestAction())
        
        # Weather action (example)
        self.register_action(WeatherAction())
        
        # Time/date action
        self.register_action(TimeAction())
        
        # System info action
        self.register_action(SystemInfoAction())
    
    def register_action(self, action: Action) -> bool:
        """Register a new action."""
        try:
            if action.action_id in self.actions:
                logger.warning(f"Action {action.action_id} already exists")
                return False
            
            self.actions[action.action_id] = action
            logger.info(f"Registered action: {action.name} ({action.action_id})")
            return True
            
        except Exception as e:
            logger.error(f"Error registering action {action.action_id}: {e}")
            return False
    
    def unregister_action(self, action_id: str) -> bool:
        """Unregister an action."""
        try:
            if action_id not in self.actions:
                logger.warning(f"Action {action_id} not found")
                return False
            
            action = self.actions.pop(action_id)
            logger.info(f"Unregistered action: {action.name} ({action_id})")
            return True
            
        except Exception as e:
            logger.error(f"Error unregistering action {action_id}: {e}")
            return False
    
    async def execute(self, action_id: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute a specific action."""
        try:
            if action_id not in self.actions:
                return {
                    "action_id": action_id,
                    "status": "error",
                    "error": f"Action {action_id} not found"
                }
            
            action = self.actions[action_id]
            if not action.enabled:
                return {
                    "action_id": action_id,
                    "status": "error",
                    "error": f"Action {action_id} is disabled"
                }
            
            logger.info(f"Executing action: {action.name}")
            
            # Ensure we have an HTTP session for actions that need it
            if not self.session:
                self.session = aiohttp.ClientSession()
            
            # Pass session to action if it needs it
            if hasattr(action, 'set_session'):
                action.set_session(self.session)
            
            result = await action.execute(params or {})
            return result
            
        except Exception as e:
            logger.error(f"Error executing action {action_id}: {e}")
            return {
                "action_id": action_id,
                "status": "error",
                "error": str(e)
            }
    
    def list_actions(self) -> List[Dict[str, Any]]:
        """List all available actions."""
        return [
            {
                "action_id": action.action_id,
                "name": action.name,
                "description": action.description,
                "type": action.action_type,
                "enabled": action.enabled,
                "execution_count": action.execution_count,
                "last_execution": action.last_execution.isoformat() if action.last_execution else None
            }
            for action in self.actions.values()
        ]
    
    def get_action_info(self, action_id: str) -> Optional[Dict[str, Any]]:
        """Get information about a specific action."""
        if action_id not in self.actions:
            return None
        
        action = self.actions[action_id]
        return {
            "action_id": action.action_id,
            "name": action.name,
            "description": action.description,
            "type": action.action_type,
            "enabled": action.enabled,
            "execution_count": action.execution_count,
            "last_execution": action.last_execution.isoformat() if action.last_execution else None,
            "created_at": action.created_at.isoformat()
        }

# Concrete action implementations:

class WebSearchAction(Action):
    """Action for performing web searches."""
    
    def __init__(self):
        super().__init__(
            action_id="web_search",
            name="Web Search",
            description="Perform web searches using DuckDuckGo",
            action_type="api"
        )
        self.session = None
    
    def set_session(self, session):
        """Set the HTTP session."""
        self.session = session
    
    async def execute(self, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute web search."""
        await super().execute(params)
        
        query = params.get("query", "") if params else ""
        if not query:
            return {
                "action_id": self.action_id,
                "status": "error",
                "error": "Query parameter is required"
            }
        
        try:
            # Use DuckDuckGo instant answer API
            url = "https://api.duckduckgo.com/"
            params_dict = {
                "q": query,
                "format": "json",
                "no_html": "1",
                "skip_disambig": "1"
            }
            
            async with self.session.get(url, params=params_dict) as response:
                data = await response.json()
                
                return {
                    "action_id": self.action_id,
                    "status": "completed",
                    "executed_at": self.last_execution.isoformat(),
                    "result": {
                        "query": query,
                        "abstract": data.get("Abstract", ""),
                        "answer": data.get("Answer", ""),
                        "definition": data.get("Definition", ""),
                        "related_topics": [topic.get("Text", "") for topic in data.get("RelatedTopics", [])[:3]]
                    }
                }
                
        except Exception as e:
            return {
                "action_id": self.action_id,
                "status": "error",
                "error": f"Web search failed: {str(e)}"
            }

class HttpRequestAction(Action):
    """Action for making HTTP requests."""
    
    def __init__(self):
        super().__init__(
            action_id="http_request",
            name="HTTP Request",
            description="Make HTTP requests to external APIs",
            action_type="api"
        )
        self.session = None
    
    def set_session(self, session):
        """Set the HTTP session."""
        self.session = session
    
    async def execute(self, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute HTTP request."""
        await super().execute(params)
        
        if not params:
            return {
                "action_id": self.action_id,
                "status": "error",
                "error": "Parameters are required"
            }
        
        url = params.get("url")
        method = params.get("method", "GET").upper()
        headers = params.get("headers", {})
        data = params.get("data")
        
        if not url:
            return {
                "action_id": self.action_id,
                "status": "error",
                "error": "URL parameter is required"
            }
        
        try:
            async with self.session.request(method, url, headers=headers, json=data) as response:
                response_data = await response.text()
                
                return {
                    "action_id": self.action_id,
                    "status": "completed",
                    "executed_at": self.last_execution.isoformat(),
                    "result": {
                        "status_code": response.status,
                        "headers": dict(response.headers),
                        "data": response_data[:1000]  # Limit response size
                    }
                }
                
        except Exception as e:
            return {
                "action_id": self.action_id,
                "status": "error",
                "error": f"HTTP request failed: {str(e)}"
            }

class WeatherAction(Action):
    """Action for getting weather information."""
    
    def __init__(self):
        super().__init__(
            action_id="weather",
            name="Weather Info",
            description="Get weather information for a location",
            action_type="api"
        )
        self.session = None
    
    def set_session(self, session):
        """Set the HTTP session."""
        self.session = session
    
    async def execute(self, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute weather lookup."""
        await super().execute(params)
        
        location = params.get("location", "") if params else ""
        if not location:
            return {
                "action_id": self.action_id,
                "status": "error",
                "error": "Location parameter is required"
            }
        
        try:
            # Use a free weather API (example with wttr.in)
            url = f"https://wttr.in/{location}?format=j1"
            
            async with self.session.get(url) as response:
                data = await response.json()
                current = data.get("current_condition", [{}])[0]
                
                return {
                    "action_id": self.action_id,
                    "status": "completed",
                    "executed_at": self.last_execution.isoformat(),
                    "result": {
                        "location": location,
                        "temperature": current.get("temp_C", ""),
                        "condition": current.get("weatherDesc", [{}])[0].get("value", ""),
                        "humidity": current.get("humidity", ""),
                        "wind_speed": current.get("windspeedKmph", "")
                    }
                }
                
        except Exception as e:
            return {
                "action_id": self.action_id,
                "status": "error",
                "error": f"Weather lookup failed: {str(e)}"
            }

class TimeAction(Action):
    """Action for getting current time and date information."""
    
    def __init__(self):
        super().__init__(
            action_id="time",
            name="Time & Date",
            description="Get current time and date information",
            action_type="function"
        )
    
    async def execute(self, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute time lookup."""
        await super().execute(params)
        
        now = datetime.now()
        
        return {
            "action_id": self.action_id,
            "status": "completed",
            "executed_at": self.last_execution.isoformat(),
            "result": {
                "current_time": now.strftime("%H:%M:%S"),
                "current_date": now.strftime("%Y-%m-%d"),
                "day_of_week": now.strftime("%A"),
                "timestamp": now.isoformat()
            }
        }

class SystemInfoAction(Action):
    """Action for getting system information."""
    
    def __init__(self):
        super().__init__(
            action_id="system_info",
            name="System Info",
            description="Get basic system information",
            action_type="function"
        )
    
    async def execute(self, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute system info lookup."""
        await super().execute(params)
        
        import platform
        import psutil
        
        return {
            "action_id": self.action_id,
            "status": "completed",
            "executed_at": self.last_execution.isoformat(),
            "result": {
                "platform": platform.platform(),
                "python_version": platform.python_version(),
                "cpu_count": psutil.cpu_count(),
                "memory_total": f"{psutil.virtual_memory().total // (1024**3)} GB",
                "memory_available": f"{psutil.virtual_memory().available // (1024**3)} GB"
            }
        } 