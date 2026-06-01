/**
 * AI Listing 生成器 - Vercel Serverless Function
 *
 * 功能：接收前端的产品信息，调用 DeepSeek API 生成多语言 Listing
 */

const fetch = require('node-fetch');

// ===== DeepSeek API 配置 =====
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

// ===== 语言映射 =====
const LANGUAGE_MAP = {
  '🇺🇸 美国': { lang: '英文', locale: 'US', hint: '使用美式英语拼写（如 color 而非 colour）' },
  '🇬🇧 英国': { lang: '英文', locale: 'UK', hint: '使用英式英语拼写（如 colour 而非 color）' },
  '🇩🇪 德国': { lang: '德文', locale: 'DE', hint: '使用标准德语，避免方言表达' },
  '🇯🇵 日本': { lang: '日文', locale: 'JP', hint: '使用标准日语，包含适当的敬语和片假名外来语' }
};

module.exports = async (req, res) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { productName, params, sellingPoints, market, platform } = req.body;

    if (!productName) {
      return res.status(400).json({ error: '产品名称不能为空' });
    }

    const langInfo = LANGUAGE_MAP[market] || LANGUAGE_MAP['🇺🇸 美国'];

    // 构造 system prompt
    const systemPrompt = `你是一位资深的跨境电商 Listing 优化专家，精通全球多市场文案撰写和 SEO 关键词优化。

输出语言要求：必须使用${langInfo.lang}撰写，面向${market}市场。${langInfo.hint}

输出要求（必须是合法 JSON，不要包含 markdown 代码块标记）：
{
  "score": 85-98 之间的整数,
  "title": "商品标题（不超过200个字符，包含核心关键词，使用${langInfo.lang}）",
  "bullets": ["5个 Bullet Points，每个以emoji开头，突出卖点，使用${langInfo.lang}"],
  "description": "商品描述，2-3段，有吸引力，使用${langInfo.lang}",
  "keywords": ["8-10个后台搜索关键词，使用${langInfo.lang}"],
  "scoreReason": "评分原因简述（用中文解释即可）"
}`;

    // 构造用户消息
    const userText = `请为以下产品生成${platform || '亚马逊'} Listing（面向${market}市场，使用${langInfo.lang}）：
- 产品名称：${productName}
- 产品参数：${params || '未提供'}
- 核心卖点：${sellingPoints || '未提供'}
- 目标市场：${market || '美国'}
- 销售平台：${platform || '亚马逊'}

请严格按照 JSON 格式输出，不要添加任何额外说明。`;

    // 调用 DeepSeek API
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ],
        temperature: 0.7,
        max_tokens: 2500
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek API 错误:', errText);
      return res.status(502).json({ error: 'AI 服务暂时不可用，请稍后重试' });
    }

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || '';

    // 解析 AI 返回的 JSON
    let result;
    try {
      const cleanJson = aiContent.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
      result = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('JSON 解析失败，原始内容:', aiContent);
      return res.status(500).json({ error: 'AI 返回格式异常，请重试' });
    }

    res.json({
      success: true,
      score: result.score || 90,
      scoreReason: result.scoreReason || 'SEO 优化良好，符合平台规范',
      title: result.title || '',
      bullets: result.bullets || [],
      description: result.description || '',
      keywords: result.keywords || []
    });

  } catch (err) {
    console.error('服务端错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
};
