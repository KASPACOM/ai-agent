"""
Action Tools for Agno integration.
These tools allow the AI agent to execute actions through the orchestrator.
"""
import logging
from typing import Dict, Any, List
from agno.tools import Toolkit

logger = logging.getLogger(__name__)

class ActionTools(Toolkit):
    """
    Agno toolkit that provides access to the action system.
    Allows the AI agent to execute various actions like API calls, web searches, etc.
    """
    
    def __init__(self, orchestrator=None):
        """Initialize the action tools."""
        self.orchestrator = orchestrator
        super().__init__(name="action_tools")
    
    def web_search(self, query: str) -> str:
        """
        Perform a web search using DuckDuckGo.
        
        Args:
            query: The search query
            
        Returns:
            Search results including abstract, answer, and related topics
        """
        try:
            if not self.orchestrator:
                return "Error: Orchestrator not available"
            
            # Execute the web search action
            import asyncio
            result = asyncio.run(self.orchestrator.execute_action("web_search", {"query": query}))
            
            logger.info(f"Web search executed for query: {query}")
            
            if result.get("status") == "completed":
                search_result = result.get("result", {})
                response = f"Web search results for '{query}':\n"
                if search_result.get("abstract"):
                    response += f"Abstract: {search_result['abstract']}\n"
                if search_result.get("answer"):
                    response += f"Answer: {search_result['answer']}\n"
                if search_result.get("definition"):
                    response += f"Definition: {search_result['definition']}\n"
                if search_result.get("related_topics"):
                    response += f"Related topics: {', '.join(search_result['related_topics'])}\n"
                return response
            else:
                return f"Web search failed: {result.get('error', 'Unknown error')}"
            
        except Exception as e:
            logger.error(f"Error in web search: {e}")
            return f"Web search failed: {str(e)}"
    
    def get_weather(self, location: str) -> str:
        """
        Get weather information for a specific location.
        
        Args:
            location: The location to get weather for
            
        Returns:
            Weather information including temperature, condition, humidity
        """
        try:
            if not self.orchestrator:
                return "Error: Orchestrator not available"
            
            # Execute the weather action
            import asyncio
            result = asyncio.run(self.orchestrator.execute_action("weather", {"location": location}))
            
            logger.info(f"Weather lookup executed for location: {location}")
            
            if result.get("status") == "completed":
                weather_data = result.get("result", {})
                response = f"Weather for {location}:\n"
                response += f"Temperature: {weather_data.get('temperature', 'N/A')}°C\n"
                response += f"Condition: {weather_data.get('condition', 'N/A')}\n"
                response += f"Humidity: {weather_data.get('humidity', 'N/A')}%\n"
                response += f"Wind Speed: {weather_data.get('wind_speed', 'N/A')} km/h"
                return response
            else:
                return f"Weather lookup failed: {result.get('error', 'Unknown error')}"
            
        except Exception as e:
            logger.error(f"Error in weather lookup: {e}")
            return f"Weather lookup failed: {str(e)}"
    
    def get_current_time(self) -> str:
        """
        Get current time and date information.
        
        Returns:
            Current time, date, day of week, and timestamp
        """
        try:
            if not self.orchestrator:
                return "Error: Orchestrator not available"
            
            # Execute the time action
            import asyncio
            result = asyncio.run(self.orchestrator.execute_action("time", {}))
            
            logger.info("Time lookup executed")
            
            if result.get("status") == "completed":
                time_data = result.get("result", {})
                response = f"Current time information:\n"
                response += f"Time: {time_data.get('current_time', 'N/A')}\n"
                response += f"Date: {time_data.get('current_date', 'N/A')}\n"
                response += f"Day: {time_data.get('day_of_week', 'N/A')}"
                return response
            else:
                return f"Time lookup failed: {result.get('error', 'Unknown error')}"
            
        except Exception as e:
            logger.error(f"Error in time lookup: {e}")
            return f"Time lookup failed: {str(e)}"
    
    def get_system_info(self) -> str:
        """
        Get basic system information.
        
        Returns:
            System platform, Python version, CPU count, memory info
        """
        try:
            if not self.orchestrator:
                return "Error: Orchestrator not available"
            
            # Execute the system info action
            import asyncio
            result = asyncio.run(self.orchestrator.execute_action("system_info", {}))
            
            logger.info("System info lookup executed")
            
            if result.get("status") == "completed":
                sys_data = result.get("result", {})
                response = f"System information:\n"
                response += f"Platform: {sys_data.get('platform', 'N/A')}\n"
                response += f"Python: {sys_data.get('python_version', 'N/A')}\n"
                response += f"CPU Cores: {sys_data.get('cpu_count', 'N/A')}\n"
                response += f"Total Memory: {sys_data.get('memory_total', 'N/A')}\n"
                response += f"Available Memory: {sys_data.get('memory_available', 'N/A')}"
                return response
            else:
                return f"System info lookup failed: {result.get('error', 'Unknown error')}"
            
        except Exception as e:
            logger.error(f"Error in system info lookup: {e}")
            return f"System info lookup failed: {str(e)}"
    
    def make_http_request(self, url: str, method: str = "GET") -> str:
        """
        Make an HTTP request to an external API.
        
        Args:
            url: The URL to request
            method: HTTP method (GET, POST, PUT, DELETE, etc.)
            
        Returns:
            Response status code and data summary
        """
        try:
            if not self.orchestrator:
                return "Error: Orchestrator not available"
            
            params = {
                "url": url,
                "method": method,
                "headers": {},
                "data": None
            }
            
            # Execute the HTTP request action
            import asyncio
            result = asyncio.run(self.orchestrator.execute_action("http_request", params))
            
            logger.info(f"HTTP request executed: {method} {url}")
            
            if result.get("status") == "completed":
                response_data = result.get("result", {})
                response = f"HTTP {method} request to {url}:\n"
                response += f"Status Code: {response_data.get('status_code', 'N/A')}\n"
                response += f"Response: {response_data.get('data', 'No data')[:200]}..."
                return response
            else:
                return f"HTTP request failed: {result.get('error', 'Unknown error')}"
            
        except Exception as e:
            logger.error(f"Error in HTTP request: {e}")
            return f"HTTP request failed: {str(e)}"
    
    def list_available_actions(self) -> str:
        """
        List all available actions that can be executed.
        
        Returns:
            List of available actions with their descriptions
        """
        try:
            if not self.orchestrator or not self.orchestrator.action_manager:
                return "Error: Action manager not available"
            
            actions = self.orchestrator.action_manager.list_actions()
            
            logger.info("Listed available actions")
            
            response = "Available actions:\n"
            for action in actions:
                response += f"- {action['name']} ({action['action_id']}): {action['description']}\n"
            
            return response
            
        except Exception as e:
            logger.error(f"Error listing actions: {e}")
            return f"Failed to list actions: {str(e)}"

    def execute_custom_action(self, action_id: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Execute a custom action by ID.
        
        Args:
            action_id: The ID of the action to execute
            params: Parameters to pass to the action
            
        Returns:
            Action execution result
        """
        try:
            if not self.orchestrator:
                return {"error": "Orchestrator not available"}
            
            # Execute the custom action
            import asyncio
            result = asyncio.run(self.orchestrator.execute_action(action_id, params or {}))
            
            logger.info(f"Custom action executed: {action_id}")
            return result
            
        except Exception as e:
            logger.error(f"Error executing custom action {action_id}: {e}")
            return {"error": f"Custom action failed: {str(e)}"}

    # Override the Toolkit methods for Agno integration
    def run(self, **kwargs) -> str:
        """
        Main entry point for the tool when called by Agno.
        This method routes to the appropriate action based on the request.
        """
        try:
            # Extract the action type and parameters from kwargs
            action_type = kwargs.get("action_type", "")
            
            if action_type == "web_search":
                query = kwargs.get("query", "")
                result = self.web_search(query)
                
            elif action_type == "weather":
                location = kwargs.get("location", "")
                result = self.get_weather(location)
                
            elif action_type == "time":
                result = self.get_current_time()
                
            elif action_type == "system_info":
                result = self.get_system_info()
                
            elif action_type == "http_request":
                url = kwargs.get("url", "")
                method = kwargs.get("method", "GET")
                result = self.make_http_request(url, method)
                
            elif action_type == "list_actions":
                result = self.list_available_actions()
                
            elif action_type == "custom_action":
                action_id = kwargs.get("action_id", "")
                params = kwargs.get("params", {})
                result = self.execute_custom_action(action_id, params)
                
            else:
                # If no specific action type, try to infer from the kwargs
                if "query" in kwargs:
                    result = self.web_search(kwargs["query"])
                elif "location" in kwargs:
                    result = self.get_weather(kwargs["location"])
                elif "url" in kwargs:
                    result = self.make_http_request(kwargs["url"])
                else:
                    result = self.list_available_actions()
            
            # Format the result for the agent
            if isinstance(result, dict):
                if result.get("status") == "completed":
                    return f"Action completed successfully. Result: {result.get('result', 'No result data')}"
                elif result.get("status") == "error":
                    return f"Action failed: {result.get('error', 'Unknown error')}"
                else:
                    return f"Action result: {result}"
            else:
                return str(result)
                
        except Exception as e:
            logger.error(f"Error in ActionTools.run: {e}")
            return f"Tool execution failed: {str(e)}" 