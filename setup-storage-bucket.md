# Setup Supabase Storage for Lead Attachments

Follow these steps in your Supabase dashboard:

## 1. Create Storage Bucket

1. Go to **Storage** in the left sidebar
2. Click **"New bucket"**
3. Name: `lead-attachments`
4. Set to **Public** (so files can be downloaded with signed URLs)
5. Click **Create bucket**

## 2. Set Storage Policies

After creating the bucket, click on it and go to **Policies** tab. Add these policies:

### Policy 1: Users can upload their own files
```sql
CREATE POLICY "Users can upload their own files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lead-attachments' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

### Policy 2: Users can view their own files
```sql
CREATE POLICY "Users can view their own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lead-attachments' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

### Policy 3: Users can delete their own files
```sql
CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'lead-attachments' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

## File Structure

Files will be stored in the bucket with this structure:
```
lead-attachments/
  {user_id}/
    {lead_id}/
      {column_field}/
        {unique_filename}
```

This ensures files are organized by user, lead, and which column they belong to.
