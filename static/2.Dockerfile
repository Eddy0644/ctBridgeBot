FROM node:20-bookworm

LABEL maintainer="Eddy0644 <i@ryancc.top>"

RUN mkdir /bot

WORKDIR /bot

# Must do this to save my poor traffic!
COPY package.json /bot
RUN npm install

COPY . /bot

RUN chmod +x /bot/static/3entry.sh
ENTRYPOINT /bot/static/3entry.sh

CMD ["/bot/static/3entry.sh", "go"]