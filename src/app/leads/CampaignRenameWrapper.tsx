'use client';

import { useRouter } from 'next/navigation';
import CampaignTable, { Campaign } from './CampaignTable';

interface Props {
  campaigns: Campaign[];
  renameCampaign: (formData: FormData) => Promise<void>;
}

export default function CampaignRenameWrapper({ campaigns, renameCampaign }: Props) {
  const router = useRouter();

  const handleRename = async (id: string, newName: string) => {
    const formData = new FormData();
    formData.set('listId', id);
    formData.set('newName', newName);
    await renameCampaign(formData);
    router.refresh();
  };

  return <CampaignTable campaigns={campaigns} onRename={handleRename} />;
}
