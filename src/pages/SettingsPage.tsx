import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ngWords as defaultNgWords } from '@/config/settings';

export function SettingsPage() {
    const [ngWords, setNgWords] = useState(defaultNgWords.join('\n'));
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    const handleSave = async () => {
        setIsSaving(true);
        // In a real app, this would save to the database
        await new Promise((resolve) => setTimeout(resolve, 500));
        setIsSaving(false);
        setSaveMessage('保存しました');
        setTimeout(() => setSaveMessage(''), 3000);
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">設定</h1>
                <p className="mt-2 text-muted-foreground">アプリケーション設定を管理</p>
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

                        {saveMessage && (
                            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
                                ✓ {saveMessage}
                            </div>
                        )}

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
                <Card className="mt-6 bg-muted p-6">
                    <h3 className="font-semibold">ご注意</h3>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                        <li>• NGキーワードに登録した企業は一覧で赤色表示になります</li>
                        <li>• キーワードは部分一致で判定されます</li>
                        <li>• 大文字・小文字は区別されません</li>
                    </ul>
                </Card>
            </div>
        </div>
    );
}
