#!/bin/bash

# Test script for reply webhook
# Usage: ./test-reply-webhook.sh [campaign_lead_id]

CAMPAIGN_LEAD_ID=${1:-"test-id-12345"}

echo "Testing reply webhook..."
echo "Campaign Lead ID: $CAMPAIGN_LEAD_ID"
echo ""

curl -X POST http://localhost:3000/api/webhooks/reply \
  -H "Content-Type: application/json" \
  -d "{
    \"campaign_lead_id\": \"$CAMPAIGN_LEAD_ID\",
    \"reply_text\": \"Thanks for reaching out! I'm very interested in learning more.\",
    \"from\": \"test-lead@example.com\"
  }"

echo ""
echo "Done!"
