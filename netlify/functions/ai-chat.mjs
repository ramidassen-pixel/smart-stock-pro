export default async (req) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try { body = await req.json(); }
  catch(e) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { question, businessData, conversationHistory } = body;
  if (!question) {
    return new Response(JSON.stringify({ error: 'Question is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build system prompt with business context
  const systemPrompt = `You are an AI business assistant built into SmartStock Pro, a business management app for a tile/building materials store.

You have access to the owner's real business data provided below. Your job is to answer questions about their inventory, sales, expenses, profits, and give actionable business advice.

BUSINESS DATA:
${JSON.stringify(businessData, null, 2)}

INSTRUCTIONS:
- Answer in clear, simple English — the owner may not be a tech expert
- Be specific — use actual numbers from their data, not generic advice
- Keep answers concise but complete
- If stock is low, mention it urgently
- Format numbers with dollar signs and commas where appropriate
- If you don't have enough data to answer, say so clearly
- Be friendly and professional
- When listing items, use bullet points
- Always end with a helpful tip or next action if relevant`;

  // Build messages array with conversation history
  const messages = [];
  if (conversationHistory && Array.isArray(conversationHistory)) {
    conversationHistory.slice(-10).forEach(msg => {
      messages.push({ role: msg.role, content: msg.content });
    });
  }
  messages.push({ role: 'user', content: question });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return new Response(JSON.stringify({ error: 'AI service error. Please try again.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text || 'Sorry, I could not generate a response.';

    return new Response(JSON.stringify({ answer }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch(e) {
    console.error('AI chat error:', e);
    return new Response(JSON.stringify({ error: 'Connection error. Check your internet and try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  path: '/api/ai-chat'
};
        
