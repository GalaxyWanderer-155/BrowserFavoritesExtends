// API配置管理模块
// 用于管理大模型API的配置信息

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  provider: 'openai', // 'openai', 'claude', 'custom'
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 500,
  timeout: 30000, // 30秒
  enabled: false // 是否启用智能标签功能
};

/**
 * 支持的API提供商配置
 */
const PROVIDER_CONFIGS = {
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-3.5-turbo',
    models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo-preview'],
    apiKeyPattern: /^sk-[a-zA-Z0-9]{32,}$/,
    requiredFields: ['endpoint', 'apiKey', 'model']
  },
  claude: {
    name: 'Anthropic Claude',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-sonnet-20240229',
    models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    apiKeyPattern: /^sk-ant-[a-zA-Z0-9\-_]{95}$/,
    requiredFields: ['endpoint', 'apiKey', 'model']
  },
  deepseek: {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-coder'],
    apiKeyPattern: /^sk-[a-zA-Z0-9]{32,}$/,
    requiredFields: ['endpoint', 'apiKey', 'model']
  },
  custom: {
    name: '自定义API',
    endpoint: '',
    defaultModel: '',
    models: [],
    apiKeyPattern: null, // 自定义API不验证格式
    requiredFields: ['endpoint', 'apiKey']
  }
};

/**
 * 存储配置的Key
 */
const STORAGE_KEY = 'aiApiConfig';

/**
 * 简单的加密/解密函数（Base64编码，仅用于基本保护）
 * 注意：这不是真正的加密，只是简单的编码
 * 在生产环境中，应该使用更安全的加密方法
 */
function simpleEncode(text) {
  if (!text) return '';
  try {
    return btoa(unescape(encodeURIComponent(text)));
  } catch (error) {
    console.warn('编码失败:', error);
    return text;
  }
}

function simpleDecode(encoded) {
  if (!encoded) return '';
  try {
    return decodeURIComponent(escape(atob(encoded)));
  } catch (error) {
    console.warn('解码失败:', error);
    return encoded;
  }
}

/**
 * 获取API配置
 * @returns {Promise<Object>} API配置对象
 */
async function getApiConfig() {
  try {
    // 检查是否在 Chrome 扩展环境中
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.warn('Chrome storage API 不可用，返回默认配置');
      return { ...DEFAULT_CONFIG };
    }

    const result = await chrome.storage.local.get(STORAGE_KEY);
    const config = result[STORAGE_KEY];

    if (!config) {
      // 如果没有配置，返回默认配置
      console.log('未找到已保存的API配置，返回默认配置');
      return { ...DEFAULT_CONFIG };
    }

    console.log('从 storage 读取API配置:', {
      provider: config.provider,
      endpoint: config.endpoint ? (config.endpoint.length > 30 ? config.endpoint.substring(0, 30) + '...' : config.endpoint) : '未设置',
      model: config.model,
      enabled: config.enabled,
      hasApiKey: !!config.apiKey
    });

    // 解密 API Key（如果已加密）
    let decryptedApiKey = config.apiKey || '';
    if (decryptedApiKey && decryptedApiKey.startsWith('ENCODED:')) {
      try {
        const encoded = decryptedApiKey.replace('ENCODED:', '');
        decryptedApiKey = simpleDecode(encoded);
      } catch (e) {
        console.warn('API Key 解密失败:', e);
        decryptedApiKey = '';
      }
    }

    // 合并默认配置，确保所有字段都存在
    // 重要：明确处理每个字段，避免使用 || 运算符导致空字符串被替换
    // 对于 endpoint 和 model，只有在配置中明确没有值（undefined/null/空字符串）时才使用默认值
    const mergedConfig = {
      provider: config.provider || DEFAULT_CONFIG.provider,
      // endpoint: 如果配置中有值（即使是空字符串），使用配置值；否则检查是否有保存的值
      endpoint: (config.endpoint !== undefined && config.endpoint !== null) ? config.endpoint : DEFAULT_CONFIG.endpoint,
      apiKey: decryptedApiKey,
      // model: 如果配置中有值（即使是空字符串），使用配置值；否则检查是否有保存的值
      model: (config.model !== undefined && config.model !== null) ? config.model : DEFAULT_CONFIG.model,
      temperature: config.temperature !== undefined && config.temperature !== null ? config.temperature : DEFAULT_CONFIG.temperature,
      maxTokens: config.maxTokens !== undefined && config.maxTokens !== null ? config.maxTokens : DEFAULT_CONFIG.maxTokens,
      timeout: config.timeout !== undefined && config.timeout !== null ? config.timeout : DEFAULT_CONFIG.timeout,
      enabled: config.enabled !== undefined && config.enabled !== null ? config.enabled : DEFAULT_CONFIG.enabled
    };

    // 如果提供商配置存在，更新相关信息（仅在保存的配置中完全没有字段时才使用提供商默认值）
    if (mergedConfig.provider && PROVIDER_CONFIGS[mergedConfig.provider]) {
      const providerConfig = PROVIDER_CONFIGS[mergedConfig.provider];
      
      // 只有在保存的配置中完全没有 endpoint 字段（undefined）时才使用提供商默认值
      // 如果保存的是空字符串，说明用户明确设置为空，应该保留
      if (config.endpoint === undefined || config.endpoint === null) {
        // 如果也没有默认配置的 endpoint，才使用提供商的默认值
        if (!mergedConfig.endpoint || mergedConfig.endpoint === DEFAULT_CONFIG.endpoint) {
          mergedConfig.endpoint = providerConfig.endpoint || mergedConfig.endpoint;
        }
      }
      
      // 只有在保存的配置中完全没有 model 字段（undefined）时才使用提供商默认值
      if (config.model === undefined || config.model === null) {
        // 如果也没有默认配置的 model，才使用提供商的默认值
        if (!mergedConfig.model || mergedConfig.model === DEFAULT_CONFIG.model) {
          mergedConfig.model = providerConfig.defaultModel || mergedConfig.model;
        }
      }
    }

    console.log('合并后的配置:', {
      provider: mergedConfig.provider,
      endpoint: mergedConfig.endpoint ? (mergedConfig.endpoint.length > 30 ? mergedConfig.endpoint.substring(0, 30) + '...' : mergedConfig.endpoint) : '未设置',
      model: mergedConfig.model,
      enabled: mergedConfig.enabled,
      hasApiKey: !!mergedConfig.apiKey
    });

    return mergedConfig;
  } catch (error) {
    console.error('获取API配置失败:', error);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 保存API配置
 * @param {Object} config - 配置对象
 * @param {boolean} encodeKey - 是否加密API Key（默认true）
 * @returns {Promise<boolean>} 是否保存成功
 */
async function saveApiConfig(config, encodeKey = true) {
  try {
    // 检查是否在 Chrome 扩展环境中
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.error('Chrome storage API 不可用');
      return false;
    }

    // 验证配置
    const validation = validateApiConfig(config);
    if (!validation.valid) {
      console.error('配置验证失败:', validation.errors);
      throw new Error(validation.errors.join(', '));
    }

    // 准备保存的配置 - 确保所有字段都被保存
    const configToSave = {
      provider: config.provider || DEFAULT_CONFIG.provider,
      endpoint: config.endpoint || '',
      apiKey: config.apiKey || '',
      model: config.model || '',
      temperature: config.temperature !== undefined ? config.temperature : DEFAULT_CONFIG.temperature,
      maxTokens: config.maxTokens !== undefined ? config.maxTokens : DEFAULT_CONFIG.maxTokens,
      timeout: config.timeout !== undefined ? config.timeout : DEFAULT_CONFIG.timeout,
      enabled: config.enabled !== undefined ? config.enabled : DEFAULT_CONFIG.enabled
    };

    // 加密 API Key
    if (encodeKey && configToSave.apiKey) {
      // 检查是否已经加密
      if (!configToSave.apiKey.startsWith('ENCODED:')) {
        const encoded = simpleEncode(configToSave.apiKey);
        configToSave.apiKey = 'ENCODED:' + encoded;
      }
    }

    // 保存到 storage
    await chrome.storage.local.set({
      [STORAGE_KEY]: configToSave
    });

    console.log('API配置已保存到 storage:', {
      provider: configToSave.provider,
      endpoint: configToSave.endpoint,
      model: configToSave.model,
      enabled: configToSave.enabled,
      hasApiKey: !!configToSave.apiKey
    });

    console.log('API配置已保存');
    return true;
  } catch (error) {
    console.error('保存API配置失败:', error);
    throw error;
  }
}

/**
 * 验证API配置
 * @param {Object} config - 配置对象
 * @returns {Object} 验证结果 { valid: boolean, errors: string[] }
 */
function validateApiConfig(config) {
  const errors = [];

  if (!config) {
    return {
      valid: false,
      errors: ['配置对象不能为空']
    };
  }

  // 检查提供商
  if (config.provider) {
    if (!PROVIDER_CONFIGS[config.provider]) {
      errors.push(`不支持的API提供商: ${config.provider}`);
    } else {
      const providerConfig = PROVIDER_CONFIGS[config.provider];

      // 检查必填字段
      providerConfig.requiredFields.forEach(field => {
        if (!config[field] || (typeof config[field] === 'string' && config[field].trim() === '')) {
          errors.push(`必填字段缺失: ${field}`);
        }
      });

      // 验证 API Key 格式（如果提供商有格式要求）
      if (config.apiKey && providerConfig.apiKeyPattern) {
        // 处理加密的 Key
        let keyToValidate = config.apiKey;
        if (keyToValidate.startsWith('ENCODED:')) {
          try {
            const encoded = keyToValidate.replace('ENCODED:', '');
            keyToValidate = simpleDecode(encoded);
          } catch (e) {
            // 解码失败，使用原值
          }
        }

        if (!providerConfig.apiKeyPattern.test(keyToValidate)) {
          errors.push(`API Key 格式不正确（${providerConfig.name}）`);
        }
      }
    }
  }

  // 验证 endpoint 格式
  if (config.endpoint) {
    try {
      const url = new URL(config.endpoint);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('API端点必须是 http 或 https 协议');
      }
    } catch (e) {
      errors.push('API端点格式不正确（应为有效的URL）');
    }
  }

  // 验证 temperature（如果提供）
  if (config.temperature !== undefined) {
    const temp = parseFloat(config.temperature);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      errors.push('temperature 必须在 0-2 之间');
    }
  }

  // 验证 maxTokens（如果提供）
  if (config.maxTokens !== undefined) {
    const tokens = parseInt(config.maxTokens);
    if (isNaN(tokens) || tokens < 1 || tokens > 4000) {
      errors.push('maxTokens 必须在 1-4000 之间');
    }
  }

  // 验证 timeout（如果提供）
  if (config.timeout !== undefined) {
    const timeout = parseInt(config.timeout);
    if (isNaN(timeout) || timeout < 1000 || timeout > 120000) {
      errors.push('timeout 必须在 1000-120000 毫秒之间');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 获取支持的API提供商列表
 * @returns {Object} 提供商配置对象
 */
function getSupportedProviders() {
  return PROVIDER_CONFIGS;
}

/**
 * 获取默认配置
 * @returns {Object} 默认配置对象
 */
function getDefaultConfig() {
  return { ...DEFAULT_CONFIG };
}

/**
 * 重置配置为默认值
 * @returns {Promise<boolean>} 是否重置成功
 */
async function resetApiConfig() {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    console.log('API配置已重置为默认值');
    return true;
  } catch (error) {
    console.error('重置API配置失败:', error);
    return false;
  }
}

/**
 * 检查配置是否已设置且有效
 * @returns {Promise<boolean>} 配置是否有效
 */
async function isConfigValid() {
  try {
    const config = await getApiConfig();
    const validation = validateApiConfig(config);
    return validation.valid && config.enabled === true;
  } catch (error) {
    return false;
  }
}

// 导出函数（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getApiConfig,
    saveApiConfig,
    validateApiConfig,
    getSupportedProviders,
    getDefaultConfig,
    resetApiConfig,
    isConfigValid,
    PROVIDER_CONFIGS,
    DEFAULT_CONFIG
  };
}

// 如果在浏览器环境中，也可以挂载到全局对象
if (typeof window !== 'undefined') {
  window.ApiConfig = {
    getApiConfig,
    saveApiConfig,
    validateApiConfig,
    getSupportedProviders,
    getDefaultConfig,
    resetApiConfig,
    isConfigValid,
    PROVIDER_CONFIGS,
    DEFAULT_CONFIG
  };
}
