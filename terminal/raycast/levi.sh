#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Levi
# @raycast.mode silent

# Optional parameters:
# @raycast.packageName Leverage
# @raycast.icon 🏠
# @raycast.description Leverage's herdr on the Mac mini Levi: jump to it, or open it in a new Ghostty window

exec "$(dirname "$0")/../bin/attach-mini" levi
