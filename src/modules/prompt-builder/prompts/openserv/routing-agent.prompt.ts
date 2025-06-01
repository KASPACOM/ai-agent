import { PromptTemplate } from '../../models/prompt.interfaces';

export const ROUTING_AGENT_PROMPT: PromptTemplate = {
  name: 'routing-agent',
  description:
    'LLM routing prompt for determining the best agent and capability for a request',
  variables: [
    'message',
    'capabilitiesText',
    'conversationHistory',
    'userPreferences',
    'recentActions',
  ],
  template: `You are an intelligent routing agent for a multi-agent DeFi platform. Analyze the user's message and determine the best agent and capability to handle their request.

USER MESSAGE: "{{message}}"

AVAILABLE CAPABILITIES:
{{capabilitiesText}}

CONVERSATION HISTORY:
{{conversationHistory}}

USER PREFERENCES:
{{userPreferences}}

RECENT ACTIONS:
{{recentActions}}

INSTRUCTIONS:
1. Analyze the user's intent and requirements
2. Consider conversation context and user preferences
3. Select the most appropriate agent and capability
4. Provide fallback options if available
5. Extract relevant parameters from the message

Respond in this exact JSON format:
{
  "primaryAgent": "agent-name",
  "capability": "capability_name",
  "confidence": 0.9,
  "reasoning": "Explanation of why this agent/capability was chosen",
  "fallbackAgents": ["backup-agent1", "backup-agent2"],
  "parameters": {"param1": "extracted_value"}
}`,
};
