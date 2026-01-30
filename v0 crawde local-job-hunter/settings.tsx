'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function SettingsPage() {
  const [ngWords, setNgWords] = useState(
    `ブラック企業\n派遣会社\n外資系\nベンチャー\n`
  );
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsSaving(false);
    toast({
      title: '保存しました',
      description: 'NG設定が正常に保存されました。',
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">設定</h1>
        <p className="mt-2 text-muted-foreground">
          アプリケーション設定を管理
        </p>
      </div>

      <div className="max-w-2xl">
        {/* NG Rules Section */}
        <Card className="p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">NGワード設定</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              以下のキーワードを含む企業は赤色でハイライト表示されます
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="ng-words" className="text-base">
                NGキーワード
              </Label>
              <Textarea
                id="ng-words"
                placeholder="キーワードを1行ずつ入力してください"
                value={ngWords}
                onChange={(e) => setNgWords(e.target.value)}
                className="mt-2 min-h-48 font-mono text-sm"
              />
            </div>

            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-semibold">現在のNGキーワード</p>
              <div className="mt-2 space-y-1">
                {ngWords
                  .split('\n')
                  .filter((word) => word.trim())
                  .map((word, index) => (
                    <p key={index}>• {word}</p>
                  ))}
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-blue-600 py-6 text-base font-semibold text-white hover:bg-blue-700 sm:w-auto"
            >
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </div>
        </Card>

        {/* Additional Settings Info */}
        <Card className="mt-6 p-6 bg-muted">
          <h3 className="font-semibold">ご注意</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              • NGキーワードに登録した企業は一覧で赤色表示になります
            </li>
            <li>
              • キーワードは部分一致で判定されます
            </li>
            <li>
              • 大文字・小文字は区別されません
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
