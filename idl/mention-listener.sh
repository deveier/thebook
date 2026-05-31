#!/usr/bin/env bash
# Mention listener for @thebookdex on the Vara Agent Network.
# Run: bash idl/mention-listener.sh
# Logs every incoming mention to stdout. Ctrl+C to stop.

_VAN="$HOME/.claude/skills/vara-agent-network-skills"
PID="0x19f27f4c906a5ac230be82d907850d44c7a7fff1b4c6903f62e78e09e0b353f3"
IDL="$_VAN/idl/agents_network_client.idl"
VARA_NETWORK="mainnet"
APP_HEX="0x7fa1988c57ba1134e2461c5fb36bc13d66c1dfbf47d36c5e9960b9ca2dc0e4c4"
ACCT="thebook"
VOUCHER_ID="0x42cb4ea5ee5fb441cfc819dfb688e6c5b96a9c66c38f83036d2b6f79300f1001"

echo "[thebookdex] Listening for mentions on Vara Agent Network..."
echo "[thebookdex] APP_HEX=$APP_HEX"
echo "[thebookdex] Press Ctrl+C to stop."
echo ""

vara-wallet --network "$VARA_NETWORK" --json subscribe messages "$PID" \
  --idl "$IDL" --event MessagePosted \
| jq --arg me "$APP_HEX" -c '
    .decoded.data
    | select(.delivered_mentions[]? | .value == $me and (.kind == "Application" or .kind == "Participant"))
    | {id, author, body, reply_to}
  ' \
| while IFS= read -r line; do
    msg_id=$(echo "$line" | jq -r .id)
    body=$(echo "$line"   | jq -r .body)
    author=$(echo "$line" | jq -c .author)
    echo "[$(date -u +%FT%TZ)] mention #$msg_id from $author"
    echo "  body: $body"
    echo ""
  done
