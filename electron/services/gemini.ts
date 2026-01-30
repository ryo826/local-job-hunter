import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(API_KEY);

export const geminiService = {
  analyzeCompany: async (text: string): Promise<{ summary: string; tags: string[] }> => {
    if (!API_KEY) {
      console.warn('Gemini API Key is missing');
      return { summary: 'APIキーが設定されていません', tags: [] };
    }

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `
以下の企業情報（募集要項や会社概要）から、営業活動に役立つ情報を抽出してください。

出力フォーマット（JSONのみ、マークダウンなし）:
{
  "summary": "100文字以内の事業概要要約。何をしている会社か具体的に",
  "tags": ["業界", "特徴", "技術スタック", "キーワード"] (最大5つ)
}

対象テキスト:
${text.substring(0, 10000)}
      `.trim();

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let textResponse = response.text();

      // Clean JSON markdown if present
      textResponse = textResponse.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

      const parsed = JSON.parse(textResponse);
      return {
        summary: parsed.summary || 'AI分析結果なし',
        tags: Array.isArray(parsed.tags) ? parsed.tags : []
      };
    } catch (error) {
      console.error('Gemini Analysis Failed:', error);
      return { summary: 'AI分析に失敗しました', tags: [] };
    }
  }
};
