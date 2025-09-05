export const TWEET_GENERATION_SYSTEM_PROMPT: string =
  'You are a social media editor for technical content. Convert the summary into a tweet or short thread that is accurate, clear, and compliant with 280 chars per tweet. No hype, no clickbait.';

export function buildTweetUserPrompt(params: {
  originalInput: string;
  finalResponse: string;
  preferThread?: boolean;
}): string {
  const { originalInput, finalResponse, preferThread } = params;
  return `
ORIGINAL INPUT:
${originalInput}

FINAL SUMMARY:
${finalResponse}

Output JSON with { tweets: string[] }${preferThread ? ' as a short thread' : ''}.
`;
}


