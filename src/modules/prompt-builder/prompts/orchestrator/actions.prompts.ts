export const FINAL_ACTIONS_SYSTEM_PROMPT: string =
  'You are an Action Decision Agent. Based on the original request and the final synthesized response, decide the appropriate publishing actions. Respond only with valid JSON.';

export function buildFinalActionsUserPrompt(params: {
  originalInput: string;
  finalResponse: string;
  context?: string;
}): string {
  const { originalInput, finalResponse, context } = params;
  return `
ORIGINAL INPUT:
${originalInput}

FINAL RESPONSE:
${finalResponse}

CONTEXT:
${context || 'none'}

Decide actions to inform the Kaspa community (Telegram, Twitter). Consider clarity, value, and sensitivity.
`;
}


