# Dockerfile type 2 to bootstrap ctBridgeBot with single volume

# Use node:20-bookworm as base image, as alpine lack some unknown libraries
FROM node:20-bookworm

LABEL maintainer="Eddy0644 <i@ryancc.top>"

# Install necessary packages required by chromium
RUN apt-get update && apt-get install -y \
    # this line to solve 'shared libraries: libnss3.so ENOENT'
    libnss3-dev libgdk-pixbuf2.0-dev libgtk-3-dev libxss-dev\
    # this line to solve 'shared libraries: libasound.so.2 ENOENT'
    libasound2\
 && rm -rf /var/lib/apt/lists/*\
    # mkdir for workdir ?
 && mkdir /bot

WORKDIR /bot

# Must do this to save my poor traffic!
COPY package.json /bot
RUN npm install

COPY . /bot

RUN chmod +x /bot/static/2.entry.sh
ENTRYPOINT /bot/static/2.entry.sh

CMD ["/bot/static/2.entry.sh", "go"]