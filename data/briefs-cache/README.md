# Committed negotiation-brief cache (one JSON per vendor, keyed on a hash of its
# real inputs). `npm run briefs` reuses an entry when the inputs are unchanged,
# so Bedrock is only called when the data moves. Delete an entry to force a rebuild.
