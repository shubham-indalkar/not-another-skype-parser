/**
 * Not Another Skyper Parser
 * A clean, modern viewer for Skype chat exports with search capabilities and media display.
 * @author Shubham Indalkar
 * @version 1.0.0
 */

"use strict";

/**
 * APPLICATION STATE
 * Core data structures to manage application state
 */
let state = {
  skypeData: null,       // Holds the parsed Skype export JSON data
  currentUserId: "",     // Current user's Skype ID
  selectedChat: null,     // Currently selected conversation
  messages: {             // Message collections
    current: [],          // Messages in current conversation
    filtered: [],         // Messages after filtering (search)
    highlighted: [],      // Messages matching search criteria
    highlightIndex: -1    // Current position in highlight navigation
  }
};

/**
 * DOM ELEMENTS
 * References to DOM elements used throughout the application
 */
const ui = {
  // Main sections
  steps: {
    fileSelect: document.querySelector(".step-1"),
    chatView: document.querySelector(".step-2")
  },
  
  // File handling
  fileInput: document.getElementById("fileInput"),
  loadButton: document.getElementById("btnLoad"),
  
  // Conversations
  chatList: document.getElementById("conversationList"),
  chatHeader: document.getElementById("selectedConversationHeader"),
  chatControls: document.querySelector(".chat-controls"),
  closeButton: document.getElementById("closeChatBtn"),
  
  // Search - Conversations
  chatSearch: {
    input: document.getElementById("searchConversationsInput"),
    clearButton: document.querySelector('.chat-search-clear-btn'),
    legacyClearButton: document.getElementById("clearSearchChatsBtn")
  },
  
  // Search - Messages
  messageSearch: {
    bar: document.querySelector(".search-bar"),
    input: document.getElementById("searchMessagesInput"),
    clearButton: document.querySelector('.search-bar .search-clear-btn'),
    toggleButton: document.getElementById("toggleSearchBtn"),
    prevButton: document.getElementById("prevSearchResult"),
    nextButton: document.getElementById("nextSearchResult"),
    closeButton: document.getElementById("clearSearchBtn")
  },
  
  // Messages
  messageList: document.getElementById("messages"),
  
  // Export info
  content: document.querySelector('.main-content')
};

// Create export info element
const exportInfo = document.createElement('div');
exportInfo.className = 'export-info';
ui.content.appendChild(exportInfo);

/**
 * TEXT PROCESSING UTILITIES
 * Core functions for cleaning and transforming text content
 */

/**
 * Safely removes HTML tags from content while preserving links
 * @param {string} html - HTML content to process
 * @returns {string} Clean text without HTML tags
 */
function stripAllTags(html) {
  if (!html) return "";
  
  // Preserve <a> tags for clickable links
  if (html.includes('<a href=')) {
    return html;
  }
  
  // Strip all other HTML tags safely
  const noTags = html.replace(/<[^>]+>/g, "");
  const textArea = document.createElement("textarea");
  textArea.innerHTML = noTags; // Use browser's HTML entity decoder
  return textArea.value;
}

/**
 * Cleans Skype IDs by removing prefixes
 * @param {string} id - Raw Skype ID
 * @returns {string} Cleaned ID without prefixes
 */
function stripId(id) {
  return (id || "").replace(/^8:/, "").replace(/^live:/, "");
}

/**
 * Escapes special characters in string for use in RegExp
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for RegExp
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes Skype reaction text placeholders from messages
 * @param {string} text - Message text with reaction codes
 * @returns {string} Clean text without reaction placeholders
 */
function stripReactionText(text) {
  if (!text) return "";
  
  // Remove common reaction/emoji text patterns
  return text.replace(/\([a-zA-Z0-9_]+\)/g, '')
            .replace(/\(manbowing\)/g, '')
            .replace(/\(like\)/g, '')
            .replace(/\(stareyes\)/g, '')
            .replace(/\(applause\)/g, '')
            .replace(/\(party\)/g, '')
            .replace(/\(bow\)/g, '');
}

/**
 * Converts URLs in text to clickable links with security attributes
 * @param {string} text - Text potentially containing URLs
 * @returns {string} Text with URLs converted to secure <a> tags
 */
function makeLinksClickable(text) {
  if (!text) return "";

  // If text already contains anchor tags, ensure they open safely in new tabs
  if (text.includes('<a href=')) {
    return text.replace(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g, (match, url, displayText) => {
      // Clean up any encoded ampersands in the URL
      url = url.replace(/&amp;/g, '&');
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${displayText}</a>`;
    });
  }
  
  // Convert plain text URLs to clickable links
  const urlRegex = /(https?:\/\/[^\s"]+)(?:">[^"]+)?/g;
  return text.replace(urlRegex, (match, url) => {
    // Clean up the URL by removing any trailing quotes or brackets
    url = url.replace(/["\]>]+$/, '');
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

function getSenderName(message) {
  // Return Unknown if displayName is null or undefined
  if (!message.displayName) {
    return 'Unknown';
  }
  
  return message.displayName;
}

// Add helper functions for message processing
function getMessageDisplayName(message) {
  // Return Unknown for null/empty displayName or .cid format names
  if (!message.displayName || message.displayName.includes('.cid.')) {
    return 'Unknown';
  }
  return message.displayName;
}

/**
 * Converts Skype text emoticons to emoji characters
 * @param {string} content - Text containing Skype emoticons
 * @returns {string} Text with emoticons replaced by emoji characters
 */
function convertEmoticonsToEmoji(content) {
  if (!content) return "";
  
  // Comprehensive map of Skype emoticons to emoji Unicode characters
  const emoticonMap = {
    // Basic emoticons
    '(y)': '👍', '(n)': '👎', '(heart)': '❤️', '(love)': '😍',
    '(smile)': '😊', '(laugh)': '😂', '(happy)': '😃', '(giggle)': '😄',
    '(grin)': '😁', '(yes)': '👍', '(no)': '👎', '(thumbsup)': '👍',
    '(thumbsdown)': '👎', '(clap)': '👏', '(bow)': '🙇', '(manbowing)': '🙇‍♂️',
    '(hi)': '👋', '(wave)': '👋', '(hug)': '🤗', '(think)': '🤔',
    '(party)': '🎉', '(cake)': '🍰', '(dance)': '💃', '(devil)': '😈',
    '(angel)': '😇', '(envy)': '😒', '(wait)': '⏳', '(star)': '⭐',
    '(stareyes)': '🤩', '(surprised)': '😮', '(shock)': '😱', '(worry)': '😟',
    '(sweat)': '😓', '(sad)': '😢', '(crying)': '😭', '(tears)': '😢',
    '(angry)': '😠', '(peace)': '✌️', '(talk)': '💬', '(inlove)': '😍',
    '(blush)': '😊', '(cool)': '😎', '(wondering)': '🤔', '(nerd)': '🤓',
    '(chuckle)': '😏', '(doh)': '🤦', '(wasntme)': '🤷', '(coffee)': '☕',
    '(beer)': '🍺', '(music)': '🎵', '(idea)': '💡', '(phone)': '📱',
    '(time)': '⏰', '(trip)': '🏖️', '(rain)': '🌧️', '(sun)': '☀️',
    '(tumbleweed)': '🌵', '(movie)': '🎬', '(pizza)': '🍕', '(cash)': '💰',
    '(muscle)': '💪', '(facepalm)': '🤦', '(wait)': '⏳', '(bandit)': '🤠',
    '(rock)': '🤘', '(headbang)': '🤘', '(punch)': '👊', '(fistbump)': '👊',
    '(ok)': '👌', '(highfive)': '🙌', '(handshake)': '🤝', '(swear)': '🤬',
    '(puke)': '🤮', '(awaits)': '⌛', '(calling)': '📞', '(wtf)': '😳',
    '(fubar)': '😵', '(finger)': '🖕', '(fingerscrossed)': '🤞', '(dream)': '💭',
    '(yawn)': '😴', '(holidayspirit)': '🎄', '(celebrate)': '🎊', '(pray)': '🙏',
    '(expressionless)': '😑', '(disappointed)': '😞', '(applause)': '👏'
  };
  
  // First, handle <ss> tags with emoji references
  const ssRegex = /<ss\s+type="([^"]+)"[^>]*>\([^)]+\)<\/ss>/g;
  let result = content.replace(ssRegex, (match, type) => {
    // Map the ss type attribute to the matching emoji
    if (emoticonMap[`(${type})`]) {
      return emoticonMap[`(${type})`];
    }
    // If we have a direct UTF value in the tag, use that
    const utfMatch = match.match(/utf="([^"]+)"/i);
    if (utfMatch && utfMatch[1]) {
      return utfMatch[1];
    }
    // Default fallback - keep the original emoticon text
    const emoMatch = match.match(/\(([^)]+)\)/i);
    return emoMatch ? `(${emoMatch[1]})` : match;
  });
  
  // Then handle plain text emoticons
  for (const [emoticon, emoji] of Object.entries(emoticonMap)) {
    // Simple string replacement instead of regex to avoid potential issues
    result = result.split(emoticon).join(emoji);
  }
  
  return result;
}

/**
 * Cleans message content by removing format artifacts 
 * @param {string} content - Raw message content from Skype export
 * @returns {string} Cleaned message content ready for display
 */
function cleanMessageContent(content) {
  if (!content) return "";
  
  // Step 1: Remove timestamp and name prefix while preserving newlines
  content = content.replace(/\[\d+\]\s+[^:]+:\s*/, '');
  
  // Step 2: Remove legacy quote markers 
  content = content.replace(/<<<|>>>/, '');
  
  // Step 3: Convert Skype emoticons to real emoji characters
  content = convertEmoticonsToEmoji(content);
  
  // Step 4: Convert HTML line breaks to newlines and trim whitespace
  return content.replace(/<br\s*\/?>/g, '\n').trim();
}

/**
 * Extracts and processes quoted content from Skype messages
 * @param {string} content - Message content potentially containing quotes
 * @param {string} messageAuthorId - ID of the message author (for context)
 * @returns {Object} Object with quote information and cleaned content
 */
function processQuotedMessage(content, messageAuthorId = '') {
  // If no content or it doesn't have quote markers, return early
  if (!content) return { isQuote: false, actualContent: content };
  
  // Check if message contains quote markup (but handle false positives carefully)
  const hasQuoteMarkup = content.includes('<quote') || content.includes('<blockquote');
  if (!hasQuoteMarkup) {
    return { isQuote: false, actualContent: content };
  }
  
  // Try several patterns to match different quote formats
  // Pattern 1: Original Skype format with full metadata
  const quoteRegex = /<(?:quote|blockquote)\s+author="([^"]+)"\s+authorname="([^"]+)"\s+timestamp="([^"]+)"\s+conversation="([^"]+)"\s+messageid="([^"]+)"[^>]*>(.*?)<\/(?:quote|blockquote)>/s;
  const quoteMatch = content.match(quoteRegex);
  
  if (quoteMatch) {
    // We have full metadata available
    const [fullQuote, authorId, authorName, timestamp, conversationId, messageId, quotedContent] = quoteMatch;
    
    // Determine if this is a group chat (conversation IDs starting with "19:" are group chats)
    const isGroupChat = conversationId && conversationId.startsWith('19:');
    
    // Clean the quoted content
    const cleanedQuoteContent = cleanQuoteContent(quotedContent);
      
    // Extract the actual message content (everything except the quote)
    const actualContent = extractActualContent(content, fullQuote);
  
    // Determine the relationship between the message author and quoted author
    const replyRelationship = determineRelationship(messageAuthorId, authorId);
  
    // Return structured quote data with full metadata
    return {
      isQuote: true,
      quotedAuthor: formatAuthorName(authorName),
      quotedAuthorId: authorId,
      quotedContent: cleanedQuoteContent,
      actualContent: actualContent,
      isGroupChat: isGroupChat,
      originalMessageId: messageId,
      conversationId: conversationId,
      timestamp: timestamp,
      replyRelationship: replyRelationship
    };
  }
  
  // Pattern 2: Modern format with itemscope/itemtype (newer Skype/Teams)
  const blockQuoteRegex = /<blockquote\s+itemscope\s+itemtype="[^"]*"\s+itemid="([^"]+)">\s*<strong\s+itemprop="mri"\s+itemid="([^"]+)">([^<]+)<\/strong>.*?<p\s+itemprop="preview">(.*?)<\/p><\/blockquote>/s;
  const blockQuoteMatch = content.match(blockQuoteRegex);
  
  if (blockQuoteMatch) {
    const [fullQuote, messageId, authorId, quotedAuthor, quotedContent] = blockQuoteMatch;
    
    // Clean the quoted content
    const cleanedQuoteContent = cleanQuoteContent(quotedContent);
      
    // Extract the actual message content (everything except the quote)
    const actualContent = extractActualContent(content, fullQuote);
  
    // Check if this is a self-reply (same person replying to their own message)
    const isSelfReply = messageAuthorId && authorId && stripId(messageAuthorId) === stripId(authorId);
    
    // Return structured quote data
    return {
      isQuote: true,
      quotedAuthor: formatAuthorName(quotedAuthor),
      quotedAuthorId: authorId,
      quotedContent: cleanedQuoteContent,
      actualContent: actualContent,
      isGroupChat: true, // This format is used in group chats
      originalMessageId: messageId,
      replyRelationship: isSelfReply ? 'self-reply' : 'reply-to-other'
    };
  }
  
  // If no other patterns matched but we have quote markup, try a simple fallback pattern
  // This handles various alternative formats or malformed quotes
  const simpleQuoteRegex = /<(?:quote|blockquote)[^>]*>(.*?)<\/(?:quote|blockquote)>/s;
  const simpleMatch = content.match(simpleQuoteRegex);
  
  if (simpleMatch) {
    // Extract minimal information from the simple match
    const [fullQuote, quotedContent] = simpleMatch;
    
    // Extract any author name we can find
    let quotedAuthor = "Unknown";
    const authorNameMatch = content.match(/authorname="([^"]+)"/i) || content.match(/itemprop="mri"[^>]*>([^<]+)</i);
    if (authorNameMatch && authorNameMatch[1]) {
      quotedAuthor = authorNameMatch[1];
    }
    
    // Clean the quoted content
    const cleanedQuoteContent = cleanQuoteContent(quotedContent);
      
    // Extract the actual message content (everything except the quote)
    const actualContent = extractActualContent(content, fullQuote);
  
    // Return structured quote data with limited info
    return {
      isQuote: true,
      quotedAuthor: formatAuthorName(quotedAuthor),
      quotedContent: cleanedQuoteContent,
      actualContent: actualContent,
      isGroupChat: false, // Assume not a group chat if we can't determine
      originalMessageId: null,
      replyRelationship: 'reply-to-other' // Default when we can't determine
    };
  }
    
  // If we got here, we couldn't parse the quote properly despite detecting quote markers
  // Return a safe default to prevent empty messages
  return { 
    isQuote: false, 
    actualContent: content 
  };
}

/**
 * Cleans quoted content by removing markup and reactions
 * @param {string} content - Raw quote content to clean
 * @returns {string} Cleaned content
 */
function cleanQuoteContent(content) {
  return content
    .replace(/<legacyquote>.*?<\/legacyquote>/g, '')  // Remove legacy quote sections
    .replace(/<at[^>]*>[^<]*<\/at>/g, (match) => {
      // Preserve @mentions with their display name
      const nameMatch = match.match(/<at[^>]*>([^<]*)<\/at>/); 
      return nameMatch ? `@${nameMatch[1]}` : '';
    })
    .replace(/<[^>]+>/g, '')                         // Remove remaining HTML tags
    .replace(/\((?:manbowing|like|stareyes|applause|party|bow|.*handsskype)\)/g, '') // Remove reactions
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') // Decode HTML entities
    .replace(/\n+<<</g, '') // Remove new lines followed by <<<
    .replace(/\n{2,}/g, '\n') // Replace multiple newlines with a single one
    .trim();
}

/**
 * Extracts the actual content from a message (excluding quotes)
 * @param {string} fullContent - The full message content
 * @param {string} quoteContent - The quote portion to remove
 * @returns {string} The actual message content
 */
function extractActualContent(fullContent, quoteContent) {
  return fullContent
    .replace(quoteContent, '')
    .replace(/<[^>]+>/g, (match) => {
      // Preserve @mentions with their display name
      if (match.startsWith('<at')) {
        const nameMatch = match.match(/<at[^>]*>([^<]*)<\/at>/);
        return nameMatch ? `@${nameMatch[1]}` : '';
      }
      return ''; // Remove other tags
    })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') // Decode HTML entities
    .trim();
}

/**
 * Formats an author name for display
 * @param {string} authorName - Raw author name from the message
 * @returns {string} Formatted author name
 */
function formatAuthorName(authorName) {
  if (!authorName) return 'Unknown';
  
  // Handle Skype IDs or weird formats
  if (authorName.includes('.cid.') || authorName.includes('live:')) {
    return 'Unknown User';
  }
  
  return authorName;
}

/**
 * Determines the relationship between message author and quoted author
 * @param {string} messageAuthorId - ID of the current message author
 * @param {string} quotedAuthorId - ID of the quoted message author
 * @returns {string} Description of the relationship (self-reply, reply-to-other)
 */
function determineRelationship(messageAuthorId, quotedAuthorId) {
  if (!messageAuthorId || !quotedAuthorId) return 'reply';
  
  // Normalize IDs for comparison (remove prefixes like 8: or live:)
  const normalizedMessageAuthor = stripId(messageAuthorId);
  const normalizedQuotedAuthor = stripId(quotedAuthorId);
  
  return normalizedMessageAuthor === normalizedQuotedAuthor ? 'self-reply' : 'reply-to-other';
}

/**
 * UI UTILITY FUNCTIONS
 * Functions for managing UI elements and animations
 */

/**
 * Scrolls the message list to the bottom
 * @param {boolean} force - Whether to force immediate scroll (true) or use smooth animation (false)
 */
function scrollToBottom(force = false) {
  const scrollOptions = { behavior: force ? 'auto' : 'smooth' };
  
  // Use requestAnimationFrame to ensure DOM is ready before scrolling
  requestAnimationFrame(() => {
    ui.messageList.scrollTo({
      top: ui.messageList.scrollHeight,
      ...scrollOptions
    });
  });
}

/**
 * Creates a modal for previewing media (images/videos)
 * @returns {HTMLElement} The configured modal element
 */
function createPreviewModal() {
  const modal = document.createElement('div');
  modal.className = 'preview-modal hidden';
  
  // Hide modal when clicking anywhere on it
  modal.onclick = () => modal.classList.add('hidden');
  
  // Append to document body
  document.body.appendChild(modal);
  
  return modal;
}

const previewModal = createPreviewModal();

/**
 * INFORMATION DISPLAY FUNCTIONS
 * Functions for showing metadata and information about the export
 */

/**
 * Displays export information in the main content area
 * Shows key details about the loaded Skype export data
 */
function showExportInfo() {
  if (!state.skypeData) return;
  
  // Extract key metadata from the export
  const exportMetadata = {
    userId: state.skypeData.conversations[0]?.id || 'Not available',
    exportTime: new Date(state.skypeData.exportDate || Date.now()).toLocaleString(),
    conversationCount: state.skypeData.conversations?.length || 0
  };
  
  // Render the export information panel
  exportInfo.innerHTML = `
    <h2>Chat Export Details</h2>
    <p><span class="label">User ID:</span>${exportMetadata.userId}</p>
    <p><span class="label">Exported:</span>${exportMetadata.exportTime}</p>
    <p><span class="label">Conversations:</span>${exportMetadata.conversationCount}</p>
  `;
  
  // Show the export info panel
  exportInfo.style.display = 'flex';
}

/**
 * CONVERSATION MANAGEMENT
 * Functions for handling conversation display and navigation
 */

/**
 * Populates the conversation list with chats from the Skype export
 * Handles filtering, sorting, and displaying conversation counts
 * @param {string} filter - Optional search term to filter conversations
 */
function populateConversations(filter = "") {
  // Clear the current conversation list
  ui.chatList.innerHTML = "";
  
  // Map conversations with their original indices and massage the data
  const conversations = state.skypeData.conversations.map((conv, idx) => ({
    ...conv,
    originalIndex: idx,
    lastMessageTime: conv.MessageList?.[0]?.originalarrivaltime 
      ? new Date(conv.MessageList[0].originalarrivaltime).getTime()
      : 0
  }));

  // Find special conversation types
  const youChat = conversations.find(conv => conv.displayName === "File Transfer");
  const bookmarksChat = conversations.find(conv => conv.id?.includes(":starred"));
  
  // Sort conversations: special chats at top, then by most recent message
  conversations.sort((a, b) => {
    // Special case for "You" chat (File Transfer)
    if (a.displayName === "File Transfer") return -1;
    if (b.displayName === "File Transfer") return 1;
    
    // Special case for bookmarks
    if (a.id?.includes(":starred")) return -1;
    if (b.id?.includes(":starred")) return 1;
    
    // Otherwise sort by most recent message
    return b.lastMessageTime - a.lastMessageTime;
  });

  // Helper: Count only visible messages using the same filter as renderMessages
  const getVisibleMessageCount = (messageList) => {
    if (!Array.isArray(messageList)) return 0;
    
    return messageList.filter(m => {
      const content = m.content || "";
      
      // Skip various system messages and hidden content types
      if (!content ||
          content.trim() === "" ||
          content === "null" ||
          content.includes("<MediaAlbum") ||
          content.includes('type="Poll"') ||
          content === "<deletemember>" ||
          content === "<addmember>" ||
          content === "<URIObject" ||
          content.includes('type="SWIFT.1"') ||
          m.messagetype === "ThreadActivity/DeleteMember" ||
          m.messagetype === "ThreadActivity/AddMember" ||
          (m.properties && m.properties.deletetime)) {
        return false;
      }
      return true;
    }).length;
  };

  // Filter and render each conversation
  conversations.forEach(conv => {
    // Get conversation name (handle special cases)
    let name;
    if (conv.displayName === "File Transfer") {
      name = "You";
    } else if (conv.id?.includes(":starred")) {
      name = "Bookmarks";
    } else {
      name = conv.displayName || stripId(conv.id);
    }
    
    // Filter list by search term (case-insensitive)
    if (!filter || name.toLowerCase().includes(filter.toLowerCase())) {
      // Create a list item for this conversation
      const listItem = document.createElement("li");
      
      // Calculate visible message count
      const messageCount = getVisibleMessageCount(conv.MessageList);
      
      // Show name with message count
      listItem.textContent = `${name} (${messageCount})`;
      
      // Mark as selected if this is the active conversation
      if (state.selectedChat && state.selectedChat.id === conv.id) {
        listItem.classList.add('selected');
      }
      
      // Set click handler to open this conversation
      listItem.onclick = () => openConversation(conv.originalIndex);
      
      // Add to the conversation list
      ui.chatList.appendChild(listItem);
    }
  });
}

/**
 * Opens a conversation and displays its messages
 * @param {number} idx - Index of the conversation in the skypeData array
 */
function openConversation(idx) {
  // Store the selected conversation in state
  state.selectedChat = state.skypeData.conversations[idx];
  state.messages.current = state.selectedChat.MessageList || [];
  state.messages.filtered = state.messages.current;
  
  // Set header text based on conversation type - maintain consistent naming
  if (state.selectedChat.displayName === "File Transfer") {
    ui.chatHeader.textContent = "You";
  } else if (state.selectedChat.id?.includes(":starred")) {
    ui.chatHeader.textContent = "Bookmarks";
  } else {
    ui.chatHeader.textContent = state.selectedChat.displayName || stripId(state.selectedChat.id);
  }
  
  // Update UI state
  ui.chatControls.classList.remove("hidden");
  ui.messageSearch.input.value = "";
  
  // Hide the search clear button
  if (ui.messageSearch.clearButton) {
    ui.messageSearch.clearButton.style.display = "none";
  }
  
  // Hide export info panel when chat is opened
  exportInfo.style.display = 'none';
  
  // Refresh conversation list to update selection
  populateConversations();
  
  // Render messages for this conversation
  renderMessages();
}

/**
 * Closes the current conversation and returns to the export info view
 */
function closeChat() {
  // Reset state
  state.selectedChat = null;
  state.messages.current = [];
  state.messages.filtered = [];
  state.messages.highlighted = [];
  state.messages.highlightIndex = -1;
  
  // Clear the message list
  ui.messageList.innerHTML = "";
  
  // Reset the UI
  ui.chatHeader.textContent = "Select a chat";
  ui.chatControls.classList.add("hidden");
  ui.messageSearch.bar.classList.add("hidden");
  ui.messageSearch.input.value = "";
  
  // Show export information again
  showExportInfo();
}

/**
 * MESSAGE DISPLAY
 * Functions for displaying and formatting messages
 */

/**
 * Renders messages for the current conversation with optional search filtering
 * @param {string} searchTerm - Optional search term to filter messages
 */
function renderMessages(searchTerm = "") {
  // Clear UI state
  ui.messageList.innerHTML = "";
  state.messages.highlighted = [];
  state.messages.highlightIndex = -1;

  // Filter out empty messages and system messages
  const allMessages = state.messages.current
    .filter(m => {
      const content = m.content || "";
      // Skip various system messages and hidden content types
      if (!content || 
          content.trim() === "" || 
          content === "null" ||
          content.includes("<MediaAlbum") ||
          content.includes('type="Poll"') ||
          content === "<deletemember>" ||
          content === "<addmember>" ||
          content === "<URIObject" ||
          content.includes('type="SWIFT.1"') ||
          m.messagetype === "ThreadActivity/DeleteMember" ||
          m.messagetype === "ThreadActivity/AddMember" ||
          (m.properties && m.properties.deletetime)) {
        return false;
      }
      return true;
    });

  // Always render messages in reverse chronological order (newest first)
  state.messages.filtered = allMessages;

  // Apply search filtering if a term is provided
  if (searchTerm) {
    state.messages.filtered = allMessages.filter(m => 
      stripAllTags(m.content || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  // Show no results message if needed
  if (searchTerm && state.messages.filtered.length === 0) {
    const noResults = document.createElement("div");
    noResults.className = "no-results";
    noResults.innerHTML = "No messages found for: <span class='search-term-highlight'>" + searchTerm + "</span>";
    ui.messageList.appendChild(noResults);
    state.messages.filtered = allMessages;
  }

  // Track media loading for scroll behavior
  let mediaLoadCount = 0;
  const totalMedia = state.messages.filtered.filter(m => (m.content || "").includes("<URIObject")).length;

  state.messages.filtered.forEach((m, index) => {
    const li = document.createElement("li");
    const authorId = stripId(m.from);
    const isMine = authorId.toLowerCase() === state.currentUserId.toLowerCase();
    li.className = "message " + (isMine ? "mine" : "theirs");

    // Add author name - use Unknown if displayName is null
    const authorName = isMine ? "You" : (m.displayName || stripId(m.from) || "Unknown");
    if (authorName !== "Unknown") {
      const nameDiv = document.createElement("div");
      nameDiv.className = "msg-authorName";
      nameDiv.textContent = authorName;
      li.appendChild(nameDiv);
    }

    // Process quoted message if present
    const quoteInfo = processQuotedMessage(m.content || "", m.from);
    if (quoteInfo.isQuote) {
      // Add reply indicator to show this is a reply
      const replyIndicator = document.createElement("div");
      replyIndicator.className = "reply-indicator";
      replyIndicator.innerHTML = `<span class="reply-icon">↩️</span> Replying to <span class="reply-to-name">${quoteInfo.quotedAuthor}</span>`;
      li.appendChild(replyIndicator);
      
      // Create the quoted message div with enhanced styling
      const quoteDiv = document.createElement("div");
      quoteDiv.className = "quoted-message";
      
      // Add group chat context if applicable
      if (quoteInfo.isGroupChat) {
        quoteDiv.classList.add("group-chat-quote");
      }
      
      // Add different styling based on type of reply
      if (quoteInfo.replyRelationship === "self-reply") {
        quoteDiv.classList.add("self-reply");
      }
      
      quoteDiv.innerHTML = `
        <div class="quoted-author">${quoteInfo.quotedAuthor}</div>
        <div class="quoted-content">${quoteInfo.quotedContent}</div>
      `;
      li.appendChild(quoteDiv);
    }

    // Handle message content
    const content = quoteInfo.isQuote ? quoteInfo.actualContent : (m.content || "");
    
    // Only process content if it's not empty after cleaning
    const cleanedContent = stripAllTags(content).trim();
    if (cleanedContent) {
      if (content.includes("<URIObject")) {
        // Handle media content
        if (content.includes('type="Picture')) {
          const doc = content.match(/doc_id="([^"]+)"/);
          const orig = content.match(/<OriginalName v="([^"]+)"/);
          if (doc && orig) {
            const id = doc[1], ext = orig[1].split(".").pop();
            const src = `media/${id}.1.${ext}`;
            const img = document.createElement("img");
            img.src = src;
            img.className = "message-img";
            img.loading = "lazy";
            // Add timestamp
            const ts = document.createElement("div");
            ts.className = "timestamp";
            ts.textContent = new Date(m.originalarrivaltime).toLocaleString();
            li.appendChild(ts);
            img.onclick = (e) => {
              e.stopPropagation();
              const previewImg = document.createElement('img');
              previewImg.src = src;
              previewImg.className = 'preview-content';
              previewModal.innerHTML = '';
              previewModal.appendChild(previewImg);
              previewModal.classList.remove('hidden');
            };
            img.onload = () => {
              mediaLoadCount++;
              if (mediaLoadCount === totalMedia) {
                scrollToBottom(true); // Force scroll after all media loads
              }
            };
            img.onerror = () => {
              mediaLoadCount++;
              if (mediaLoadCount === totalMedia) {
                scrollToBottom(true);
              }
            };
            li.appendChild(img);
          } 
        } else if (content.includes('type="Video')) {
          const doc = content.match(/doc_id="([^"]+)"/);
          const orig = content.match(/<OriginalName v="([^"]+)"/);
          if (doc && orig) {
            const id = doc[1], ext = orig[1].split(".").pop();
            const src = `media/${id}.1.${ext}`;
            const vid = document.createElement("video");
            vid.src = src;
            vid.controls = true;
            vid.className = "message-video";
            vid.preload = "metadata";
            // Add timestamp
            const ts = document.createElement("div");
            ts.className = "timestamp";
            ts.textContent = new Date(m.originalarrivaltime).toLocaleString();
            li.appendChild(ts);
            vid.onclick = (e) => {
              e.stopPropagation();
              const previewVid = document.createElement('video');
              previewVid.src = src;
              previewVid.controls = true;
              previewVid.className = 'preview-content';
              previewVid.autoplay = true;
              previewModal.innerHTML = '';
              previewModal.appendChild(previewVid);
              previewModal.classList.remove('hidden');
            };
            vid.onloadedmetadata = () => {
              mediaLoadCount++;
              if (mediaLoadCount === totalMedia) {
                scrollToBottom(true);
              }
            };
            vid.onerror = () => {
              mediaLoadCount++;
              if (mediaLoadCount === totalMedia) {
                scrollToBottom(true);
              }
            };
            li.appendChild(vid);
          }
        } else if (content.includes('type="SWIFT.1') && content.includes('giphy.com')) {
          const gifMatch = content.match(/src="([^"]+)"/);
          if (gifMatch) {
            const gifUrl = gifMatch[1];
            const img = document.createElement("img");
            img.src = gifUrl;
            img.className = "message-gif";
            img.loading = "lazy";
            img.onerror = () => {
              img.parentElement.textContent = "GIF: " + (content.match(/alt="([^"]+)"/) || [])[1] || "Animated GIF";
            };
            li.appendChild(img);
          }
        }
      } else {
        let text = stripAllTags(content);
        text = cleanMessageContent(text);
        
        if (text.trim() !== "") {
          const span = document.createElement("span");
          span.className = "message-body";
          if (searchTerm) {
            const regex = new RegExp(escapeRegExp(searchTerm), "gi");
            const highlightedText = text.replace(regex, match => `<span class="highlight">${match}</span>`);
            span.innerHTML = makeLinksClickable(highlightedText);
            
            // Register element as a highlight for navigation
            if (text.toLowerCase().includes(searchTerm.toLowerCase())) {
              state.messages.highlighted.push(li);
            }
          } else {
            span.innerHTML = makeLinksClickable(text);
          }
          li.appendChild(span);

          // Add timestamp
          const ts = document.createElement("div");
          ts.className = "timestamp";
          ts.textContent = new Date(m.originalarrivaltime).toLocaleString();
          li.appendChild(ts);
        }
      }
      
      // Only append message if it has content
      if (li.querySelector('.message-body, .message-img, .message-video, .message-gif, .quoted-message')) {
        ui.messageList.appendChild(li);
      }
    }
  });

  // If no media, scroll to top (since messages are now in reverse order)
  if (totalMedia === 0) {
    ui.messageList.scrollTop = 0;
  }

  // Collect highlights from newest to oldest
  state.messages.highlighted = Array.from(ui.messageList.querySelectorAll(".highlight"));
  
  // If this is a search and we have highlights, start from newest (first in DOM)
  if (searchTerm && state.messages.highlighted.length > 0) {
    state.messages.highlightIndex = 0;
    selectHighlight(0);
    // Enable/disable navigation buttons
    ui.messageSearch.prevButton.disabled = false;
    ui.messageSearch.nextButton.disabled = false;
  } else {
    // Otherwise scroll to top (newest messages)
    ui.messageList.scrollTop = 0;
  }
}

/**
 * Selects and scrolls to a highlighted search result
 * @param {number} index - Index of the highlight to select
 */
function selectHighlight(index) {
  if (state.messages.highlighted.length === 0) return;
  
  // Remove active highlight class from all elements and add it to the selected one
  state.messages.highlighted.forEach((element, j) => {
    element.classList.toggle("active-highlight", j === index);
  });
  
  // If the highlighted element exists, scroll to it
  if (state.messages.highlighted[index]) {
    // Scroll the highlight into view with smooth animation
    state.messages.highlighted[index].scrollIntoView({ 
      behavior: "smooth", 
      block: "center"
    });
    
    // Update current highlight index in state
    state.messages.highlightIndex = index;
    
    // Update navigation buttons state
    ui.messageSearch.prevButton.disabled = index === state.messages.highlighted.length - 1; // Disable prev when at oldest
    ui.messageSearch.nextButton.disabled = index === 0; // Disable next when at newest
  }
}

/* — event wiring —*/

/**
 * EVENT HANDLERS
 * Core event handlers for user interactions
 */

/**
 * Loads and processes a Skype export JSON file
 */
ui.loadButton.onclick = () => {
  const file = ui.fileInput.files[0];
  if (!file) {
    return alert("Please select a messages.json file");
  }
  
  const reader = new FileReader();
  reader.onload = (event) => {
    // Parse the JSON data
    state.skypeData = JSON.parse(event.target.result);
    
    // Sort messages within each conversation by newest first
    state.skypeData.conversations.forEach(conversation => {
      if (conversation.MessageList) {
        conversation.MessageList.sort((a, b) => 
          new Date(b.originalarrivaltime || 0).getTime() - 
          new Date(a.originalarrivaltime || 0).getTime()
        );
      }
    });
    
    // Extract user ID and update UI state
    state.currentUserId = stripId(state.skypeData.userId || state.skypeData.me?.id || "");
    ui.steps.fileSelect.classList.add("hidden");
    ui.steps.chatView.classList.remove("hidden");
    
    // Initialize the conversations list and show export details
    populateConversations();
    showExportInfo();
  };
  
  // Read the file as text
  reader.readAsText(file, "utf-8");
};

/**
 * Chat search functionality
 * Handles searching through the conversation list
 */
ui.chatSearch.input.addEventListener("input", (event) => {
  const searchTerm = event.target.value;
  
  // Show/hide the clear button based on search term presence
  if (ui.chatSearch.clearButton) {
    ui.chatSearch.clearButton.style.display = searchTerm ? "block" : "none";
  }
  
  // Filter conversations based on search term
  populateConversations(searchTerm);
});

// Chat search clear button handler
if (ui.chatSearch.clearButton && ui.chatSearch.input) {
  ui.chatSearch.clearButton.onclick = () => {
    ui.chatSearch.input.value = "";
    ui.chatSearch.clearButton.style.display = "none";
    populateConversations();
    ui.chatSearch.input.focus();
  };
}

// Retain legacy clear button handler for backward compatibility
if (ui.chatSearch.legacyClearButton && ui.chatSearch.input) {
  ui.chatSearch.legacyClearButton.onclick = () => {
    ui.chatSearch.input.value = "";
    populateConversations();
  };
}

/**
 * Message search functionality
 * Handles searching through messages with debouncing
 */
ui.messageSearch.input.addEventListener("input", (event) => {
  const searchTerm = event.target.value;
  
  // Show/hide the clear button based on search term presence
  if (ui.messageSearch.clearButton) {
    ui.messageSearch.clearButton.style.display = searchTerm ? "block" : "none";
  }
  
  // Debounce the search to avoid performance issues with large message lists
  clearTimeout(ui.messageSearch.input.searchTimeout);
  ui.messageSearch.input.searchTimeout = setTimeout(() => {
    renderMessages(searchTerm);
  }, 100); // 100ms debounce delay
});

// Message search clear button handler
if (ui.messageSearch.clearButton && ui.messageSearch.input) {
  ui.messageSearch.clearButton.onclick = () => {
    ui.messageSearch.input.value = "";
    ui.messageSearch.clearButton.style.display = "none";
    renderMessages();
  };
}

/**
 * Toggle message search bar visibility
 */
ui.messageSearch.toggleButton.onclick = () => {
  ui.messageSearch.bar.classList.toggle("hidden");
  
  // If search bar is now visible, focus the input field
  if (!ui.messageSearch.bar.classList.contains("hidden")) {
    ui.messageSearch.input.focus();
  } else {
    // If search bar is now hidden, clear search and refresh messages
    ui.messageSearch.input.value = "";
    if (ui.messageSearch.clearButton) {
      ui.messageSearch.clearButton.style.display = "none";
    }
    renderMessages();
  }
};

/**
 * Close the current chat and return to the export info screen
 */
ui.closeButton.onclick = closeChat;

/**
 * Navigate to previous search result (older message)
 */
ui.messageSearch.prevButton.onclick = () => {
  if (state.messages.highlightIndex < state.messages.highlighted.length - 1) {
    selectHighlight(state.messages.highlightIndex + 1); // Move to older results
  }
};

/**
 * Navigate to next search result (newer message)
 */
ui.messageSearch.nextButton.onclick = () => {
  if (state.messages.highlightIndex > 0) {
    selectHighlight(state.messages.highlightIndex - 1); // Move to newer results
  }
};

/**
 * Close search bar and reset search results
 */
ui.messageSearch.closeButton.onclick = () => {
  ui.messageSearch.bar.classList.add("hidden");
  ui.messageSearch.input.value = "";
  
  if (ui.messageSearch.clearButton) {
    ui.messageSearch.clearButton.style.display = "none";
  }
  
  // Use requestAnimationFrame to ensure DOM updates before re-rendering
  requestAnimationFrame(() => {
    renderMessages();
  });
};


