// ==================== 智能标签生成相关功能 ====================
// 注意：由于 service worker 环境的限制，这里实现简化版本的智能标签生成功能

// ==================== 消息类型常量 ====================
const MESSAGE_TYPES = {
  EXTRACT_PAGE_CONTENT: 'EXTRACT_PAGE_CONTENT',        // 提取页面内容
  PAGE_CONTENT_EXTRACTED: 'PAGE_CONTENT_EXTRACTED',    // 页面内容提取完成
  GENERATE_SMART_TAGS: 'GENERATE_SMART_TAGS'           // 生成智能标签
};

// 内容缓存（URL -> 清洗后的内容）
const contentCache = new Map();
const CACHE_EXPIRY = 1000 * 60 * 60; // 1小时

// 从缓存获取内容
function getCachedContent(url) {
  const cached = contentCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    return cached.data;
  }
  return null;
}

// 保存内容到缓存
function setCachedContent(url, data) {
  contentCache.set(url, {
    data: data,
    timestamp: Date.now()
  });
}

// 清洗内容（简化版，不依赖DOM）
function cleanContentData(rawContent) {
  if (!rawContent || !rawContent.success) {
    return null;
  }

  const data = rawContent.data;
  return {
    title: data.title || '',
    description: data.metaDescription || '',
    content: data.mainText || '',
    domain: data.domain || '',
    url: data.url || '',
    headings: data.headings || [],
    paragraphs: data.paragraphs || []
  };
}

// 从 content script 提取页面内容
async function extractPageContentFromTab(tabId) {
  try {
    // 检查标签页是否存在
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      throw new Error('标签页不存在');
    }

    // 检查URL是否是 http/https
    if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
      throw new Error('不支持的URL协议');
    }

    // 发送消息到 content script 提取内容
    const response = await chrome.tabs.sendMessage(tabId, {
      action: MESSAGE_TYPES.EXTRACT_PAGE_CONTENT,
      timestamp: Date.now()
    });

    return response;
  } catch (error) {
    console.error('提取页面内容失败:', error);
    throw error;
  }
}

// 简单的API Key解密（Base64解码）
function decodeApiKey(encodedKey) {
  if (!encodedKey || !encodedKey.startsWith('ENCODED:')) {
    return encodedKey;
  }
  try {
    const encoded = encodedKey.replace('ENCODED:', '');
    return decodeURIComponent(escape(atob(encoded)));
  } catch (e) {
    return encodedKey;
  }
}

// 调用AI API（简化版，直接在service worker中实现）
async function callAIForTags(config, prompt) {
  const { provider, endpoint, apiKey, model, temperature, maxTokens, timeout } = config;
  const decodedApiKey = decodeApiKey(apiKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout || 30000);

  try {
    let requestBody = {};
    let headers = {
      'Content-Type': 'application/json'
    };

    if (provider === 'openai' || provider === 'deepseek') {
      headers['Authorization'] = `Bearer ${decodedApiKey}`;
      requestBody = {
        model: model || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-3.5-turbo'),
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 500
      };
    } else if (provider === 'claude') {
      headers['x-api-key'] = decodedApiKey;
      headers['anthropic-version'] = '2023-06-01';
      requestBody = {
        model: model || 'claude-3-sonnet-20240229',
        max_tokens: maxTokens || 500,
        temperature: temperature || 0.7,
        messages: [{ role: 'user', content: prompt }]
      };
    } else {
      // 自定义API，使用OpenAI格式
      headers['Authorization'] = `Bearer ${decodedApiKey}`;
      requestBody = {
        model: model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 500
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    // 提取响应文本
    let text = '';
    if (data.choices && data.choices[0] && data.choices[0].message) {
      text = data.choices[0].message.content || '';
    } else if (data.content && data.content[0] && data.content[0].text) {
      text = data.content[0].text || '';
    } else if (data.text) {
      text = data.text;
    }

    if (!text) {
      throw new Error('API响应格式不正确');
    }

    return text;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('API请求超时');
    }
    throw error;
  }
}

// 解析标签文本
function parseTagsFromResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    return [];
  }

  let text = responseText.trim();
  
  // 提取标签部分
  const tagMatch = text.match(/#[\w\u4e00-\u9fa5]+(?:\s+#[\w\u4e00-\u9fa5]+)*/);
  if (tagMatch) {
    text = tagMatch[0];
  }

  const parts = text.split(/\s+/);
  const tags = [];

  for (const part of parts) {
    let tag = part.trim().replace(/[#。，、.,;:!?！？：；]+$/, '');
    if (tag.startsWith('#')) {
      tag = tag.substring(1);
    }
    
    if (tag && tag.length > 0 && tag.length <= 20 && !tag.includes(' ') && !tag.includes('\n')) {
      tags.push(tag);
    }
  }

  return [...new Set(tags)].slice(0, 10);
}

// 构建提示词
function buildTagPrompt(contentData, existingTags = []) {
  const { title, description, content, domain } = contentData;
  
  let prompt = `请根据以下网站信息，生成3-5个简洁的标签（每个标签不超过6个字，不含空格）：\n\n`;
  
  if (title) prompt += `标题：${title}\n`;
  if (description) prompt += `描述：${description}\n`;
  if (domain) prompt += `域名：${domain}\n`;
  if (content) {
    const limitedContent = content.length > 500 ? content.substring(0, 500) + '...' : content;
    prompt += `主要内容：${limitedContent}\n`;
  }
  
  if (existingTags && existingTags.length > 0) {
    prompt += `已有标签：${existingTags.join('、')}\n\n请基于已有标签，补充3-5个相关的标签。`;
  } else {
    prompt += `\n请为这个网站生成合适的标签。`;
  }
  
  prompt += `\n\n请以"#标签1 #标签2 #标签3"的格式返回标签，多个标签用空格分隔，每个标签以#开头。只返回标签文本，不要包含其他说明文字。`;
  
  return prompt;
}

// 保存标签
async function saveBookmarkTags(bookmarkId, tags) {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    bookmarkTags[bookmarkId] = tags;
    await chrome.storage.local.set({ bookmarkTags: bookmarkTags });
  } catch (error) {
    console.error('保存书签标签失败:', error);
    throw error;
  }
}

// 获取已有标签
async function getBookmarkTags(bookmarkId) {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    return bookmarkTags[bookmarkId] || [];
  } catch (error) {
    return [];
  }
}

// 生成智能标签（降级方案：仅使用标题和URL）
async function generateTagsFallback(bookmarkId, bookmark) {
  try {
    // 检查API配置
    const result = await chrome.storage.local.get('aiApiConfig');
    const apiConfig = result.aiApiConfig;

    if (!apiConfig || !apiConfig.enabled) {
      return;
    }

    // 构建简单的内容数据
    let domain = '';
    try {
      const urlObj = new URL(bookmark.url);
      domain = urlObj.hostname.replace('www.', '');
    } catch (e) {
      domain = bookmark.url;
    }

    const simpleContent = {
      title: bookmark.title || '',
      description: '',
      content: bookmark.url || '',
      domain: domain,
      url: bookmark.url || ''
    };

    // 获取已有标签
    const existingTags = await getBookmarkTags(bookmarkId);

    // 构建提示词
    const prompt = buildTagPrompt(simpleContent, existingTags);

    // 调用API
    const responseText = await callAIForTags(apiConfig, prompt);

    // 解析标签
    const newTags = parseTagsFromResponse(responseText);

    if (newTags.length > 0) {
      // 合并标签
      const allTags = [...new Set([...existingTags, ...newTags])];
      await saveBookmarkTags(bookmarkId, allTags);
      console.log('智能标签生成成功（降级方案）:', allTags);
    } else {
      console.warn('未能解析出标签');
    }
  } catch (error) {
    console.error('生成智能标签失败（降级方案）:', error);
  }
}

// 生成智能标签（完整方案：使用页面内容）
async function generateSmartTagsForBookmark(bookmarkId, bookmark) {
  try {
    // 检查API配置
    const result = await chrome.storage.local.get('aiApiConfig');
    const apiConfig = result.aiApiConfig;

    if (!apiConfig || !apiConfig.enabled) {
      return;
    }

    // 检查缓存
    const cachedContent = getCachedContent(bookmark.url);
    let cleanedContent = null;

    if (cachedContent) {
      console.log('使用缓存的内容');
      cleanedContent = cachedContent;
    } else {
      try {
        // 获取当前活动标签页
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
          throw new Error('无法获取活动标签页');
        }

        const activeTab = tabs[0];

        // 检查URL是否匹配
        let targetTab = activeTab;
        if (activeTab.url !== bookmark.url) {
          // 如果URL不匹配，尝试查找匹配的标签页
          try {
            const allTabs = await chrome.tabs.query({ url: bookmark.url });
            if (allTabs.length > 0) {
              targetTab = allTabs[0];
            } else {
              throw new Error('无法找到匹配的标签页');
            }
          } catch (e) {
            throw new Error('无法找到匹配的标签页');
          }
        }

        // 提取内容（设置超时10秒）
        const extractPromise = extractPageContentFromTab(targetTab.id);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('内容提取超时')), 10000);
        });

        const rawContent = await Promise.race([extractPromise, timeoutPromise]);
        
        // 验证响应格式
        if (rawContent && rawContent.action === MESSAGE_TYPES.PAGE_CONTENT_EXTRACTED) {
          if (rawContent.success) {
            // 清洗内容
            cleanedContent = cleanContentData(rawContent);
            
            // 保存到缓存
            if (cleanedContent) {
              setCachedContent(bookmark.url, cleanedContent);
            }
          } else {
            console.warn('页面内容提取失败:', rawContent.error);
            throw new Error(rawContent.error || '页面内容提取失败');
          }
        } else {
          // 兼容旧格式（如果没有 action 字段）
          cleanedContent = cleanContentData(rawContent);
          if (cleanedContent) {
            setCachedContent(bookmark.url, cleanedContent);
          }
        }
      } catch (error) {
        console.warn('内容提取失败:', error);
        // 内容提取失败，使用降级方案
        cleanedContent = null;
      }
    }

    // 如果内容提取失败，使用降级方案
    if (!cleanedContent) {
      console.warn('使用降级方案生成标签');
      await generateTagsFallback(bookmarkId, bookmark);
      return;
    }

    // 使用提取的内容生成标签
    try {
      // 获取已有标签
      const existingTags = await getBookmarkTags(bookmarkId);

      // 构建提示词
      const prompt = buildTagPrompt(cleanedContent, existingTags);

      // 调用API（设置超时30秒）
      const apiPromise = callAIForTags(apiConfig, prompt);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('API调用超时')), 30000);
      });

      const responseText = await Promise.race([apiPromise, timeoutPromise]);

      // 解析标签
      const newTags = parseTagsFromResponse(responseText);

      if (newTags.length > 0) {
        // 合并标签
        const allTags = [...new Set([...existingTags, ...newTags])];
        await saveBookmarkTags(bookmarkId, allTags);
        console.log('智能标签生成成功:', allTags);
      } else {
        console.warn('未能解析出标签，尝试降级方案');
        await generateTagsFallback(bookmarkId, bookmark);
      }
    } catch (error) {
      console.error('生成标签失败:', error);
      // API调用失败，尝试降级方案
      await generateTagsFallback(bookmarkId, bookmark);
    }
  } catch (error) {
    console.error('生成智能标签失败:', error);
    // 最终降级方案
    try {
      await generateTagsFallback(bookmarkId, bookmark);
    } catch (fallbackError) {
      console.error('降级方案也失败:', fallbackError);
    }
  }
}

// 使用 storage 来通知书签变化
async function notifyBookmarkChange(type, data) {
  try {
    const timestamp = Date.now();
    await chrome.storage.local.set({
      bookmarkChange: {
        type: type,
        data: data,
        timestamp: timestamp
      }
    });
  } catch (error) {
    console.error('通知书签变化失败:', error);
  }
}

// 监听书签创建事件
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  console.log('书签已创建:', bookmark);
  notifyBookmarkChange('BOOKMARK_CREATED', { bookmark: bookmark });
  
  // 保存书签信息并在扩展图标上显示提示
  if (bookmark.url) {
    try {
      // 获取当前活动标签页的信息
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 存储书签信息供 popup 使用
      await chrome.storage.local.set({
        lastBookmarked: {
          id: id,
          title: bookmark.title,
          url: bookmark.url,
          dateAdded: bookmark.dateAdded,
          tabTitle: tab?.title || bookmark.title,
          tabUrl: tab?.url || bookmark.url,
          hasNewBookmark: true
        }
      });

      // 在扩展图标上显示提示徽章
      chrome.action.setBadgeText({ text: '新' });
      chrome.action.setBadgeBackgroundColor({ color: '#333' });

      // 异步生成智能标签（不阻塞主流程）
      // 使用 setTimeout 确保不影响主要功能的响应速度
      setTimeout(async () => {
        try {
          await generateSmartTagsForBookmark(id, bookmark);
        } catch (error) {
          console.error('后台生成智能标签失败:', error);
        }
      }, 100);
    } catch (error) {
      console.error('处理收藏事件失败:', error);
    }
  }
});

// 监听书签删除事件
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  console.log('书签已删除:', id);
  notifyBookmarkChange('BOOKMARK_REMOVED', { id: id });
});

// 监听书签更改事件
chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  console.log('书签已更改:', id, changeInfo);
  notifyBookmarkChange('BOOKMARK_CHANGED', { id: id, changeInfo: changeInfo });
});

// 监听书签移动事件
chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  console.log('书签已移动:', id, moveInfo);
  notifyBookmarkChange('BOOKMARK_MOVED', { id: id, moveInfo: moveInfo });
});

// 监听来自 popup 或其他地方的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GENERATE_SMART_TAGS') {
    // 异步处理生成智能标签请求
    (async () => {
      try {
        const { bookmarkId, bookmark, tabId } = request;
        
        if (!bookmarkId || !bookmark) {
          sendResponse({
            success: false,
            error: '缺少必要参数'
          });
          return;
        }

        // 先获取原有标签（用于计算新标签）
        const originalResult = await chrome.storage.local.get('bookmarkTags');
        const originalBookmarkTags = originalResult.bookmarkTags || {};
        const originalTags = originalBookmarkTags[bookmarkId] || [];
        
        // 调用生成智能标签函数
        await generateSmartTagsForBookmark(bookmarkId, bookmark);
        
        // 获取生成后的标签
        const result = await chrome.storage.local.get('bookmarkTags');
        const bookmarkTags = result.bookmarkTags || {};
        const allTags = bookmarkTags[bookmarkId] || [];
        
        // 计算新生成的标签
        const newTags = allTags.filter(tag => !originalTags.includes(tag));
        
        sendResponse({
          success: true,
          tags: allTags,
          newTags: newTags
        });
      } catch (error) {
        console.error('处理生成智能标签请求失败:', error);
        sendResponse({
          success: false,
          error: error.message || '生成标签失败'
        });
      }
    })();
    
    return true; // 保持消息通道开放以支持异步响应
  }
  
  return false; // 不处理的消息返回 false
});

console.log('书签监听服务已启动');

