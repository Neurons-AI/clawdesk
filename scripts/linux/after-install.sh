#!/bin/bash

# Post-installation script for ClawDesk on Linux

set -e

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database -q /usr/share/applications || true
fi

# Update icon cache
if command -v gtk-update-icon-cache &> /dev/null; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi

# Create symbolic link for CLI access (optional)
if [ -x /opt/ClawDesk/clawdesk ]; then
    ln -sf /opt/ClawDesk/clawdesk /usr/local/bin/clawdesk 2>/dev/null || true
fi

echo "ClawDesk has been installed successfully."
