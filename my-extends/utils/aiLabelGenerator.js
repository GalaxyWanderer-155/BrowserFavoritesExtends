// AI标签生成模块
// 用于调用大模型API生成智能标签

/**
 * 构建提示词（Prompt）
 * @param {Object} contentData - 清洗后的内容数据
 * @param {Array<string>} existingTags - 已有标签（可选）
 * @returns {string} 构建的提示词
 */
function buildPrompt(contentData, existingTags = []) {
  if (!contentData) {
    throw new Error('内容数据不能为空');
  }

  const { title, description, content, domain, url, headings, paragraphs } = contentData;

  let prompt = `请根据以下网站信息，生成3-5个简洁的标签（每个标签不超过6个字，不含空格）：

`;

  // 标题
  if (title) {
    prompt += `标题：${title}\n`;
  }

  // 描述
  if (description) {
    prompt += `描述：${description}\n`;
  }

  // 域名
  if (domain) {
    prompt += `域名：${domain}\n`;
  }

  // 主要内容（限制长度）
  if (content) {
    const maxContentLength = 500; // 限制内容长度，避免超出token限制
    const limitedContent = content.length > maxContentLength 
      ? content.substring(0, maxContentLength) + '...'
      : content;
    prompt += `主要内容：${limitedContent}\n`;
  }

  // 主要标题（如果有）
  if (headings && headings.length > 0) {
    const mainHeadings = headings.slice(0, 3).map(h => h.text || h).join('、');
    if (mainHeadings) {
      prompt += `主要标题：${mainHeadings}\n`;
    }
  }

  // 已有标签（用于补充标签）
  if (existingTags && existingTags.length > 0) {
    prompt += `已有标签：${existingTags.join('、')}\n`;
    prompt += `\n请基于已有标签，补充3-5个相关的标签。`;
  } else {
    prompt += `\n请为这个网站生成合适的标签。`;
  }

  prompt += `\n\n请以"#标签1 #标签2 #标签3"的格式返回标签，多个标签用空格分隔，每个标签以#开头。只返回标签文本，不要包含其他说明文字。`;

  return prompt;
}

/**
 * 调用OpenAI API
 * @param {Object} config - API配置
 * @param {string} prompt - 提示词
 * @returns {Promise<Object>} API响应
 */
async function callOpenAIApi(config, prompt) {
  const { endpoint, apiKey, model, temperature, maxTokens, timeout } = config;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout || 30000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 500
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    // 提取响应文本
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return {
        text: data.choices[0].message.content || '',
        usage: data.usage || null
      };
    } else {
      throw new Error('API响应格式不正确');
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('API请求超时');
    }
    throw error;
  }
}

/**
 * 调用Claude API
 * @param {Object} config - API配置
 * @param {string} prompt - 提示词
 * @returns {Promise<Object>} API响应
 */
async function callClaudeApi(config, prompt) {
  const { endpoint, apiKey, model, temperature, maxTokens, timeout } = config;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout || 30000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-3-sonnet-20240229',
        max_tokens: maxTokens || 500,
        temperature: temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    // 提取响应文本
    if (data.content && data.content.length > 0 && data.content[0].text) {
      return {
        text: data.content[0].text || '',
        usage: data.usage || null
      };
    } else {
      throw new Error('API响应格式不正确');
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('API请求超时');
    }
    throw error;
  }
}

/**
 * 调用自定义API（兼容OpenAI格式）
 * @param {Object} config - API配置
 * @param {string} prompt - 提示词
 * @returns {Promise<Object>} API响应
 */
async function callCustomApi(config, prompt) {
  const { endpoint, apiKey, model, temperature, maxTokens, timeout } = config;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout || 30000);

  try {
    // 尝试OpenAI格式
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey ? `Bearer ${apiKey}` : undefined
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 500
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    // 尝试提取响应文本（兼容多种格式）
    let text = '';
    if (data.choices && data.choices[0] && data.choices[0].message) {
      text = data.choices[0].message.content || '';
    } else if (data.content && data.content[0] && data.content[0].text) {
      text = data.content[0].text || '';
    } else if (data.text) {
      text = data.text;
    } else if (typeof data === 'string') {
      text = data;
    }

    if (!text) {
      throw new Error('API响应格式不正确');
    }

    return {
      text: text,
      usage: data.usage || null
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('API请求超时');
    }
    throw error;
  }
}

/**
 * 调用DeepSeek API
 * @param {Object} config - API配置
 * @param {string} prompt - 提示词
 * @returns {Promise<Object>} API响应
 */
async function callDeepSeekApi(config, prompt) {
  // DeepSeek API 使用与 OpenAI 兼容的格式
  // 可以直接使用 callOpenAIApi，但为了明确性，单独实现
  const { endpoint, apiKey, model, temperature, maxTokens, timeout } = config;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout || 30000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 500
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    // 提取响应文本（OpenAI兼容格式）
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return {
        text: data.choices[0].message.content || '',
        usage: data.usage || null
      };
    } else {
      throw new Error('API响应格式不正确');
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('API请求超时');
    }
    throw error;
  }
}

/**
 * 调用AI API（根据提供商选择对应的API调用函数）
 * @param {Object} config - API配置
 * @param {string} prompt - 提示词
 * @returns {Promise<Object>} API响应
 */
async function callAIApi(config, prompt) {
  if (!config || !config.provider) {
    throw new Error('API配置不完整');
  }

  if (!config.apiKey) {
    throw new Error('API Key 未设置');
  }

  if (!config.endpoint) {
    throw new Error('API端点未设置');
  }

  const { provider } = config;

  switch (provider) {
    case 'openai':
      return await callOpenAIApi(config, prompt);
    case 'claude':
      return await callClaudeApi(config, prompt);
    case 'deepseek':
      return await callDeepSeekApi(config, prompt);
    case 'custom':
      return await callCustomApi(config, prompt);
    default:
      throw new Error(`不支持的API提供商: ${provider}`);
  }
}

/**
 * 解析标签（从API响应中提取标签）
 * @param {string} responseText - API响应的文本
 * @returns {Array<string>} 解析后的标签数组
 */
function parseTags(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    return [];
  }

  // 清理文本（移除前后空白、换行等）
  let text = responseText.trim();

  // 尝试提取标签部分（可能包含其他说明文字）
  // 查找包含 # 标签的行或文本块
  const tagMatch = text.match(/#[\w\u4e00-\u9fa5]+(?:\s+#[\w\u4e00-\u9fa5]+)*/);
  if (tagMatch) {
    text = tagMatch[0];
  }

  // 按空格分割
  const parts = text.split(/\s+/);
  const tags = [];

  for (const part of parts) {
    let tag = part.trim();
    
    // 移除 # 号（如果有）
    if (tag.startsWith('#')) {
      tag = tag.substring(1);
    }

    // 移除末尾的标点符号（如句号、逗号等）
    tag = tag.replace(/[。，、.,;:!?！？：；]+$/, '');

    // 验证标签格式
    // 标签应该：不为空、不包含空格、长度在1-20个字符之间
    if (tag && 
        tag.length > 0 && 
        tag.length <= 20 && 
        !tag.includes(' ') && 
        !tag.includes('\n') &&
        !tag.includes('\t')) {
      tags.push(tag);
    }
  }

  // 去重
  const uniqueTags = [...new Set(tags)];

  // 限制标签数量（最多10个）
  return uniqueTags.slice(0, 10);
}

/**
 * 保存书签标签
 * @param {string} bookmarkId - 书签ID
 * @param {Array<string>} tags - 标签数组
 * @returns {Promise<void>}
 */
async function saveBookmarkTags(bookmarkId, tags) {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.warn('Chrome storage API 不可用');
      return;
    }

    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    bookmarkTags[bookmarkId] = tags;
    await chrome.storage.local.set({ bookmarkTags: bookmarkTags });
  } catch (error) {
    console.error('保存书签标签失败:', error);
    throw error;
  }
}

/**
 * 获取书签标签
 * @param {string} bookmarkId - 书签ID
 * @returns {Promise<Array<string>>} 标签数组
 */
async function getBookmarkTags(bookmarkId) {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return [];
    }

    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    return bookmarkTags[bookmarkId] || [];
  } catch (error) {
    console.error('获取书签标签失败:', error);
    return [];
  }
}

/**
 * 主函数：生成智能标签
 * @param {string} bookmarkId - 书签ID
 * @param {Object} pageContent - 页面内容数据（清洗后的）
 * @param {Object} apiConfig - API配置（可选，如果不提供则从storage读取）
 * @returns {Promise<Object>} 生成结果 { success: boolean, tags: Array<string>, error?: string }
 */
async function generateSmartTags(bookmarkId, pageContent, apiConfig = null) {
  try {
    // 1. 获取API配置
    let config = apiConfig;
    if (!config) {
      if (typeof ApiConfig !== 'undefined') {
        config = await ApiConfig.getApiConfig();
      } else if (typeof window !== 'undefined' && window.ApiConfig) {
        config = await window.ApiConfig.getApiConfig();
      } else {
        throw new Error('API配置模块未加载');
      }
    }

    // 检查配置是否有效且已启用
    if (!config.enabled) {
      return {
        success: false,
        tags: [],
        error: '智能标签功能未启用'
      };
    }

    const validation = typeof ApiConfig !== 'undefined' 
      ? ApiConfig.validateApiConfig(config)
      : (typeof window !== 'undefined' && window.ApiConfig 
          ? window.ApiConfig.validateApiConfig(config)
          : { valid: false, errors: ['配置验证不可用'] });
    
    if (!validation.valid) {
      return {
        success: false,
        tags: [],
        error: 'API配置无效: ' + validation.errors.join(', ')
      };
    }

    // 2. 获取已有标签（如果有）
    const existingTags = await getBookmarkTags(bookmarkId);

    // 3. 构建提示词
    const prompt = buildPrompt(pageContent, existingTags);

    // 4. 调用AI API
    const response = await callAIApi(config, prompt);

    // 5. 解析标签
    const tags = parseTags(response.text);

    if (tags.length === 0) {
      return {
        success: false,
        tags: [],
        error: '未能从API响应中解析出标签'
      };
    }

    // 6. 合并已有标签和新生成的标签（去重）
    const allTags = [...new Set([...existingTags, ...tags])];

    // 7. 保存标签
    await saveBookmarkTags(bookmarkId, allTags);

    return {
      success: true,
      tags: allTags,
      newTags: tags,
      existingTags: existingTags
    };
  } catch (error) {
    console.error('生成智能标签失败:', error);
    return {
      success: false,
      tags: [],
      error: error.message || '生成标签时发生未知错误'
    };
  }
}

// 导出函数（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildPrompt,
    callAIApi,
    callOpenAIApi,
    callClaudeApi,
    callDeepSeekApi,
    callCustomApi,
    parseTags,
    saveBookmarkTags,
    getBookmarkTags,
    generateSmartTags
  };
}

// 如果在浏览器环境中，也可以挂载到全局对象
if (typeof window !== 'undefined') {
  window.AiLabelGenerator = {
    buildPrompt,
    callAIApi,
    callOpenAIApi,
    callClaudeApi,
    callDeepSeekApi,
    callCustomApi,
    parseTags,
    saveBookmarkTags,
    getBookmarkTags,
    generateSmartTags
  };
}
