/**
 * AI UI解析 — レシピがないサイトのパスワード変更フォームを動的に解析する
 *
 * Gemini API を使用してページのHTMLを解析し、
 * パスワード変更に必要なフォーム要素とアクション手順を特定する。
 */

export interface PageAnalysis {
  /** パスワード変更ページかどうか */
  isPasswordChangePage: boolean;
  /** パスワード変更ページへのリンク（現在のページが違う場合） */
  passwordChangeLink?: string;
  /** 操作手順 */
  steps?: Array<{
    action: 'fill' | 'click';
    selector: string;
    value?: string;
    description: string;
  }>;
  /** 分析コメント */
  comment?: string;
}

export interface AnalyzeParams {
  html: string;
  title: string;
  url: string;
  domain: string;
  apiKey: string;
}

/**
 * ページのHTMLを分析してパスワード変更フォームを特定する
 */
export async function analyzePageForPasswordChange(
  params: AnalyzeParams
): Promise<PageAnalysis> {
  const { html, title, url, domain, apiKey } = params;

  // HTMLを簡略化（大きすぎるとAPIの制限に引っかかる）
  const simplifiedHtml = simplifyHtml(html);

  const prompt = `あなたはWebページのUI解析エキスパートです。
以下のWebページのHTMLを分析し、パスワード変更フォームを特定してください。

## ページ情報
- URL: ${url}
- タイトル: ${title}
- ドメイン: ${domain}

## HTML
\`\`\`html
${simplifiedHtml}
\`\`\`

## タスク
1. このページにパスワード変更フォームが存在するか判断してください
2. 存在する場合、以下のフォーム要素のCSSセレクタを特定してください：
   - 現在のパスワード入力欄
   - 新しいパスワード入力欄
   - パスワード確認入力欄（ある場合）
   - 送信ボタン
3. 存在しない場合、パスワード変更ページへのリンクがあれば特定してください

## レスポンス形式 (JSON)
\`\`\`json
{
  "isPasswordChangePage": boolean,
  "passwordChangeLink": "URL or null",
  "steps": [
    {"action": "fill", "selector": "CSSセレクタ", "value": "{{old_password}}", "description": "現在のパスワードを入力"},
    {"action": "fill", "selector": "CSSセレクタ", "value": "{{new_password}}", "description": "新しいパスワードを入力"},
    {"action": "fill", "selector": "CSSセレクタ", "value": "{{new_password}}", "description": "パスワード確認を入力"},
    {"action": "click", "selector": "CSSセレクタ", "description": "送信ボタンをクリック"}
  ],
  "comment": "分析コメント"
}
\`\`\`

JSONのみをレスポンスしてください。`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Gemini APIからの応答が空です');
    }

    // JSONを抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('レスポンスからJSONを抽出できませんでした');
    }

    return JSON.parse(jsonMatch[0]) as PageAnalysis;
  } catch (error: any) {
    console.error('AI解析エラー:', error.message);
    return {
      isPasswordChangePage: false,
      comment: `AI解析エラー: ${error.message}`,
    };
  }
}

/**
 * HTMLを簡略化する（不要な要素を除去し、サイズを削減）
 */
function simplifyHtml(html: string): string {
  let simplified = html;

  // script, style, svg, noscript タグとその内容を除去
  simplified = simplified.replace(/<script[\s\S]*?<\/script>/gi, '');
  simplified = simplified.replace(/<style[\s\S]*?<\/style>/gi, '');
  simplified = simplified.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  simplified = simplified.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // コメントを除去
  simplified = simplified.replace(/<!--[\s\S]*?-->/g, '');

  // data-*属性を除去（セレクタに必要なものは残す）
  simplified = simplified.replace(/ data-(?!testid|test-id|cy)[a-z-]+="[^"]*"/gi, '');

  // 連続する空白を縮小
  simplified = simplified.replace(/\s+/g, ' ');

  // 最大文字数を制限（Gemini APIの入力制限対策）
  const MAX_LENGTH = 30000;
  if (simplified.length > MAX_LENGTH) {
    // formタグ周辺を優先的に抽出
    const formMatch = simplified.match(/<form[\s\S]*?<\/form>/i);
    if (formMatch) {
      simplified = formMatch[0];
    } else {
      // inputタグを含む領域を抽出
      const inputRegion = simplified.match(
        /[\s\S]{0,2000}<input[\s\S]{0,5000}/i
      );
      if (inputRegion) {
        simplified = inputRegion[0];
      } else {
        simplified = simplified.substring(0, MAX_LENGTH);
      }
    }
  }

  return simplified;
}
