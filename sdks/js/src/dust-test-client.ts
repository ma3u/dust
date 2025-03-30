/**
 * Dust.tt API Client Test
 * This script implements the streaming solution exactly as shown in the official SDK documentation
 * Source: https://www.npmjs.com/package/@dust-tt/client
 */

const { DustAPI } = require('@dust-tt/client');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

/**
 * @param {import('@dust-tt/client').DustAPI} dustApi
 * @param {string} conversationId
 * @param {string} userMessageId
 */
async function streamAgentResponse(dustApi, conversationId, userMessageId) {
  const controller = new AbortController();
  const signal = controller.signal;
  
  // Set a timeout for stream cancellation
  const timeout = setTimeout(() => {
    console.log('Stream timeout reached, aborting...');
    controller.abort();
  }, 60000);

  try {
    // Verify conversation and message before streaming
    console.log('Validating conversation and message...');
    console.log('Conversation ID:', conversationId);
    
    const conversationRes = await dustApi.getConversation(conversationId);
    if (conversationRes.isErr()) {
      console.error('Conversation response error:', conversationRes.error);
      throw new Error(`Invalid conversation: ${conversationRes.error.message}`);
    }
    
    const validConversation = conversationRes.value;
    console.log('Valid conversation object:', validConversation);
    
    // Validate conversation object structure
    if (!validConversation?.sId || !validConversation?.content) {
      throw new Error('Invalid conversation object structure');
    }
    
    const userMessageExists = validConversation.content.some(versions => {
      const message = versions[versions.length - 1];
      return message && message.type === "user_message" && message.sId === userMessageId;
    });

    if (!userMessageExists) {
      throw new Error(`User message ${userMessageId} not found in conversation`);
    }

    // Retry logic for agent message processing
    let retries = 3;
    let streamResult;
    
    while (retries > 0) {
      console.log(`Attempting to stream agent response (${retries} retries remaining)...`);
      
      // Verify API URL construction
      const apiUrl = `${dustApi.url}/api/v1/w/${dustApi.credentials.workspaceId}/assistant/conversations/${validConversation.sId}`;
      console.log('API URL:', apiUrl);
      
      streamResult = await dustApi.streamAgentAnswerEvents({
        conversation: validConversation,
        userMessageId,
        signal,
      });

      if (streamResult.isErr()) {
        if (streamResult.error.message.includes("agent hasn't processed")) {
          console.log('Agent still processing, waiting 5 seconds...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          retries--;
          continue;
        }
        throw new Error(`Stream error: ${streamResult.error.message}`);
      }
      break;
    }

    if (retries === 0) {
      throw new Error('Agent did not respond after multiple retries');
    }

    const { eventStream } = streamResult.value;
    let answer = "";
    let chainOfThought = "";

    console.log('\nReceiving response in real-time:');
    console.log('=========================================');

    // Process events from the stream
    for await (const event of eventStream) {
      if (!event) continue;

      switch (event.type) {
        case "user_message_error":
          console.error(`User message error: ${event.error.message}`);
          break;
        case "agent_error":
          console.error(`Agent error: ${event.error.message}`);
          break;
        case "generation_tokens":
          process.stdout.write(event.text);
          answer = (answer + event.text).trim();
          break;
        case "agent_message_success":
          console.log('\n\n[Message completed]');
          break;
      }
    }

    clearTimeout(timeout);
    return answer;

  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function main() {
  // Configuration from environment variables only - no hardcoded secrets
  const config = {
    workspaceId: process.env.DUST_WORKSPACE_ID,
    apiKey: process.env.DUST_API_KEY,
    baseUrl: process.env.DUST_DOMAIN || 'https://dust.tt',
    agentId: process.env.DUST_AGENT_ID,
    username: process.env.DUST_USERNAME || 'user',
    fullName: process.env.DUST_FULLNAME || 'Dust API User',
    timezone: process.env.DUST_TIMEZONE || 'UTC'
  };
  
  // Verify required environment variables are set
  if (!config.workspaceId || !config.apiKey || !config.agentId) {
    throw new Error('Missing required environment variables. Please set DUST_WORKSPACE_ID, DUST_API_KEY, and DUST_AGENT_ID');
  }

  console.log('=========================================');
  console.log('Dust.tt API SDK Example - Official Documentation Implementation');
  console.log('=========================================');
  console.log(`Workspace ID: ${config.workspaceId}`);
  console.log(`Agent ID: ${config.agentId}`);
  console.log(`Base URL: ${config.baseUrl}`);
  console.log('=========================================');

  try {
    console.log('\nFollowing the exact SDK documentation approach');
    console.log('Source: https://www.npmjs.com/package/@dust-tt/client');
    
    // Initialize the Dust API client
    const dustApi = new DustAPI(
      { url: config.baseUrl },
      { workspaceId: config.workspaceId, apiKey: config.apiKey },
      console
    );
    
    // Following the example from the documentation
    // Setup context for user information
    const context = {
      timezone: config.timezone,
      username: config.username,
      fullName: config.fullName
    };
    
    console.log('\nCreating conversation with initial message...');
    
    // Start a new conversation with a message mentioning the agent
    const conversationRes = await dustApi.createConversation({
      title: "Documentation Example Conversation",
      message: {
        content: "Hello! What can you help me with?",
        mentions: [{ configurationId: config.agentId }],
        context: context,
      },
    });

    console.log('Full conversation response:', JSON.stringify(conversationRes.value, null, 2));

    if (conversationRes.isErr()) {
      throw new Error(`Failed to create conversation: ${conversationRes.error.message}`);
    }
    
    const { conversation, message } = conversationRes.value;
    
    // Validate conversation object structure
    if (!conversation?.sId || !conversation?.content) {
      throw new Error('Invalid conversation object structure');
    }
    
    const userMessageExists = conversation.content.some(versions => {
      const message = versions[versions.length - 1];
      return message && message.type === "user_message" && message.sId === message.sId;
    });
    
    if (!userMessageExists) {
      throw new Error('User message not found in conversation');
    }
    
    // Pass the complete conversation object directly
    const streamResult = await dustApi.streamAgentAnswerEvents({
      conversation,
      userMessageId: message.sId,
      signal: new AbortController().signal,
    });

    console.log('Full stream response:', JSON.stringify(streamResult.value, null, 2));

    if (streamResult.isErr()) {
      throw new Error(`Failed to stream agent response: ${streamResult.error.message}`);
    }

    const { eventStream } = streamResult.value;
    let answer = "";
    let chainOfThought = "";

    console.log('\nReceiving response in real-time:');
    console.log('=========================================');

    // Process events from the stream
    for await (const event of eventStream) {
      if (!event) continue;

      switch (event.type) {
        case "user_message_error":
          console.error(`User message error: ${event.error.message}`);
          break;
        case "agent_error":
          console.error(`Agent error: ${event.error.message}`);
          break;
        case "generation_tokens":
          process.stdout.write(event.text);
          answer = (answer + event.text).trim();
          break;
        case "agent_message_success":
          console.log('\n\n[Message completed]');
          break;
      }
    }

    console.log('\n=========================================');
    console.log('\nFull response:');
    console.log('=========================================');
    console.log(answer);
    console.log('=========================================');

    console.log('\nConversation completed successfully!');
    console.log(`- Conversation ID: ${conversation.sId}`);
    console.log(`- You can view this conversation in the Dust.tt workspace:`);
    console.log(`  ${config.baseUrl}/w/${config.workspaceId}/assistant/conversations/${conversation.sId}`);

  } catch (error) {
    console.error('\nError:');
    console.error(error.message);
    if (error.dustError) {
      console.error('Dust API error:', error.dustError);
    }
  }
}

main().catch(error => {
  console.error('Error in main function:', error);
});