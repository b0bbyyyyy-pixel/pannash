'use client';

import { useRouter } from 'next/navigation';
import CampaignTable, { Campaign } from './CampaignTable';

interface Props {
  campaigns: Campaign[];
  renameCampaign: (formData: FormData) => Promise<void>;
  deleteCampaign: (formData: FormData) => Promise<void>;
}

export default function CampaignRenameWrapper({ campaigns, renameCampaign, deleteCampaign }: Props) {
  const router = useRouter();

  const handleRename = async (id: string, newName: string) => {
    const formData = new FormData();
    formData.set('listId', id);
    formData.set('newName', newName);
    await renameCampaign(formData);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    const formData = new FormData();
    formData.set('listId', id);
    try {
      await deleteCampaign(formData);
    } catch {
      // server action may throw on redirect — that's OK
    }
    router.refresh();
  };

  return <CampaignTable campaigns={campaigns} onRename={handleRename} onDelete={handleDelete} />;
}
