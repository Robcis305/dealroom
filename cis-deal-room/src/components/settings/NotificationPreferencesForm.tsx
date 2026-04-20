'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface Props {
  initialNotifyUploads: boolean;
  initialNotifyDigest: boolean;
}

type FieldKey = 'notifyUploads' | 'notifyDigest';

export function NotificationPreferencesForm({
  initialNotifyUploads,
  initialNotifyDigest,
}: Props) {
  const [notifyUploads, setNotifyUploads] = useState(initialNotifyUploads);
  const [notifyDigest, setNotifyDigest] = useState(initialNotifyDigest);
  const [saving, setSaving] = useState<FieldKey | null>(null);

  async function update(field: FieldKey, nextValue: boolean) {
    const revert = () => {
      if (field === 'notifyUploads') setNotifyUploads(!nextValue);
      else setNotifyDigest(!nextValue);
    };
    if (field === 'notifyUploads') setNotifyUploads(nextValue);
    else setNotifyDigest(nextValue);
    setSaving(field);
    try {
      const res = await fetchWithAuth('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: nextValue }),
      });
      if (!res.ok) {
        revert();
        toast.error('Failed to update preference');
      } else {
        toast.success('Preference updated');
      }
    } catch {
      revert();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 text-sm text-text-primary cursor-pointer">
        <input
          type="checkbox"
          checked={notifyUploads}
          disabled={saving === 'notifyUploads'}
          onChange={(e) => update('notifyUploads', e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Email me when files are uploaded</span>
          <span className="block text-xs text-text-muted">
            Sent for folders you have access to. Turn off to stop receiving upload emails.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm text-text-primary cursor-pointer">
        <input
          type="checkbox"
          checked={notifyDigest}
          disabled={saving === 'notifyDigest'}
          onChange={(e) => update('notifyDigest', e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Send a daily digest instead of instant emails</span>
          <span className="block text-xs text-text-muted">
            When on, upload notifications are batched into one daily email.
          </span>
        </span>
      </label>
    </div>
  );
}
