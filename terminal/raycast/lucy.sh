#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Lucy
# @raycast.mode silent

# Optional parameters:
# @raycast.packageName Maelstrom
# @raycast.icon 🌀
# @raycast.description Maelstrom's herdr on the Mac mini Lucy: jump to it, or open it in a new Ghostty window

exec "$(dirname "$0")/../bin/attach-mini" lucy
