"""
Task Manager for handling automated tasks and scheduled operations.
"""
import asyncio
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class Task:
    """Represents a task that can be executed by the task manager."""
    
    def __init__(self, task_id: str, name: str, description: str = "", 
                 schedule: Optional[str] = None, enabled: bool = True):
        self.task_id = task_id
        self.name = name
        self.description = description
        self.schedule = schedule  # Future: cron-like scheduling
        self.enabled = enabled
        self.created_at = datetime.now()
        self.last_run = None
        self.run_count = 0
        self.status = "pending"
    
    async def execute(self, orchestrator=None) -> Dict[str, Any]:
        """Execute the task. Override in subclasses."""
        logger.info(f"Executing task: {self.name}")
        self.last_run = datetime.now()
        self.run_count += 1
        self.status = "completed"
        
        return {
            "task_id": self.task_id,
            "status": "completed",
            "executed_at": self.last_run.isoformat(),
            "result": "Task executed successfully"
        }

class TaskManager:
    """
    Manages automated tasks and scheduled operations.
    Currently empty but ready for future expansion.
    """
    
    def __init__(self, orchestrator=None):
        """Initialize the task manager."""
        self.orchestrator = orchestrator
        self.tasks: Dict[str, Task] = {}
        self.is_running = False
        self.task_loop = None
        
        logger.info("TaskManager initialized")
    
    async def start(self):
        """Start the task manager."""
        if self.is_running:
            logger.warning("Task manager is already running")
            return
        
        self.is_running = True
        logger.info("Task manager started")
        
        # Future: Start background task loop for scheduled tasks
        # self.task_loop = asyncio.create_task(self._task_loop())
    
    async def stop(self):
        """Stop the task manager."""
        if not self.is_running:
            return
        
        self.is_running = False
        
        # Future: Cancel task loop
        if self.task_loop:
            self.task_loop.cancel()
            try:
                await self.task_loop
            except asyncio.CancelledError:
                pass
        
        logger.info("Task manager stopped")
    
    async def add_task(self, task: Task) -> bool:
        """Add a new task to the manager."""
        try:
            if task.task_id in self.tasks:
                logger.warning(f"Task {task.task_id} already exists")
                return False
            
            self.tasks[task.task_id] = task
            logger.info(f"Added task: {task.name} ({task.task_id})")
            return True
            
        except Exception as e:
            logger.error(f"Error adding task {task.task_id}: {e}")
            return False
    
    async def remove_task(self, task_id: str) -> bool:
        """Remove a task from the manager."""
        try:
            if task_id not in self.tasks:
                logger.warning(f"Task {task_id} not found")
                return False
            
            task = self.tasks.pop(task_id)
            logger.info(f"Removed task: {task.name} ({task_id})")
            return True
            
        except Exception as e:
            logger.error(f"Error removing task {task_id}: {e}")
            return False
    
    async def execute_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Execute a specific task manually."""
        try:
            if task_id not in self.tasks:
                logger.error(f"Task {task_id} not found")
                return None
            
            task = self.tasks[task_id]
            if not task.enabled:
                logger.warning(f"Task {task_id} is disabled")
                return None
            
            logger.info(f"Executing task: {task.name}")
            result = await task.execute(self.orchestrator)
            return result
            
        except Exception as e:
            logger.error(f"Error executing task {task_id}: {e}")
            return {
                "task_id": task_id,
                "status": "error",
                "error": str(e)
            }
    
    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get the status of a specific task."""
        if task_id not in self.tasks:
            return None
        
        task = self.tasks[task_id]
        return {
            "task_id": task.task_id,
            "name": task.name,
            "description": task.description,
            "enabled": task.enabled,
            "status": task.status,
            "created_at": task.created_at.isoformat(),
            "last_run": task.last_run.isoformat() if task.last_run else None,
            "run_count": task.run_count
        }
    
    async def list_tasks(self) -> List[Dict[str, Any]]:
        """List all tasks and their statuses."""
        return [await self.get_task_status(task_id) for task_id in self.tasks.keys()]
    
    async def enable_task(self, task_id: str) -> bool:
        """Enable a task."""
        if task_id not in self.tasks:
            return False
        
        self.tasks[task_id].enabled = True
        logger.info(f"Enabled task: {task_id}")
        return True
    
    async def disable_task(self, task_id: str) -> bool:
        """Disable a task."""
        if task_id not in self.tasks:
            return False
        
        self.tasks[task_id].enabled = False
        logger.info(f"Disabled task: {task_id}")
        return True
    
    async def _task_loop(self):
        """
        Background loop for executing scheduled tasks.
        Future implementation for automated task execution.
        """
        while self.is_running:
            try:
                # Future: Check for scheduled tasks and execute them
                # For now, just sleep
                await asyncio.sleep(60)  # Check every minute
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in task loop: {e}")
                await asyncio.sleep(60)
    
    def get_manager_info(self) -> Dict[str, Any]:
        """Get information about the task manager."""
        return {
            "is_running": self.is_running,
            "total_tasks": len(self.tasks),
            "enabled_tasks": sum(1 for task in self.tasks.values() if task.enabled),
            "disabled_tasks": sum(1 for task in self.tasks.values() if not task.enabled)
        }

# Example task classes for future use:

class HealthCheckTask(Task):
    """Example task that performs system health checks."""
    
    def __init__(self):
        super().__init__(
            task_id="health_check",
            name="System Health Check",
            description="Performs periodic health checks on all system components",
            schedule="*/5 * * * *"  # Every 5 minutes
        )
    
    async def execute(self, orchestrator=None) -> Dict[str, Any]:
        """Perform health check."""
        await super().execute(orchestrator)
        
        if orchestrator:
            health = await orchestrator.health_check()
            return {
                "task_id": self.task_id,
                "status": "completed",
                "executed_at": self.last_run.isoformat(),
                "result": health
            }
        
        return {
            "task_id": self.task_id,
            "status": "completed",
            "executed_at": self.last_run.isoformat(),
            "result": "Health check completed (no orchestrator)"
        }

class NotificationTask(Task):
    """Example task that sends periodic notifications."""
    
    def __init__(self, message: str, chat_id: str):
        super().__init__(
            task_id=f"notification_{chat_id}",
            name="Periodic Notification",
            description=f"Sends periodic notifications to chat {chat_id}"
        )
        self.message = message
        self.chat_id = chat_id
    
    async def execute(self, orchestrator=None) -> Dict[str, Any]:
        """Send notification."""
        await super().execute(orchestrator)
        
        if orchestrator and orchestrator.telegram:
            await orchestrator.telegram.send_message(self.chat_id, self.message)
            return {
                "task_id": self.task_id,
                "status": "completed",
                "executed_at": self.last_run.isoformat(),
                "result": f"Notification sent to {self.chat_id}"
            }
        
        return {
            "task_id": self.task_id,
            "status": "error",
            "executed_at": self.last_run.isoformat(),
            "result": "No telegram integration available"
        } 