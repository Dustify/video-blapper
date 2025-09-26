#!/bin/bash

# Define the list of devices to check
DEVICES=(
  dri dma_heap mali0 rga mpp_service
  iep mpp-service vpu_service vpu-service
  hevc_service hevc-service rkvdec rkvenc vepu h265e
)

# Start writing the override file
cat > docker-compose.override.yml << EOL
services:
  app:
    devices:
EOL

# Loop through the devices and add them to the override file if they exist
for dev in "${DEVICES[@]}"; do
  if [ -e "/dev/$dev" ]; then
    echo "      - \"/dev/$dev:/dev/$dev\"" >> docker-compose.override.yml
    echo "Found device: /dev/$dev"
  fi
done

echo "docker-compose.override.yml generated successfully."