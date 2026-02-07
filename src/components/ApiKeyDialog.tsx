import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';

interface ApiKeyDialogProps {
  open: boolean;
  onSaved: () => void;
}

export function ApiKeyDialog({ open, onSaved }: ApiKeyDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await window.electronAPI.settings.saveApiKey(apiKey.trim());
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    await window.electronAPI.settings.saveApiKey('');
    onSaved();
  };

  return (
    <Dialog open={open}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Google Maps APIキーの設定</DialogTitle>
          <DialogDescription>
            電話番号の自動取得機能を使うには、Google Maps Places APIキーが必要です。
            後から設定画面で変更できます。
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <DialogFooter>
          <button
            onClick={handleSkip}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            スキップ
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || saving}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
