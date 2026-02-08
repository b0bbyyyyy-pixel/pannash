'use client';

export default function DeleteCampaignButton({
  campaignId,
  onDelete,
}: {
  campaignId: string;
  onDelete: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={onDelete}>
      <input type="hidden" name="campaign_id" value={campaignId} />
      <button
        type="submit"
        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
        onClick={(e) => {
          if (!confirm('Are you sure you want to delete this campaign?')) {
            e.preventDefault();
          }
        }}
      >
        Delete
      </button>
    </form>
  );
}
